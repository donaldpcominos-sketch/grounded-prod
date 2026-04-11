// src/views/todayPlans.js
//
// Today Plans view — orchestration and rendering only.
// No scoring logic, no place enrichment, no Firestore.
//
// All behaviour comes from:
//   src/domain/todayPlans.js  — context building, scoring, packaging
//   src/services/places.js    — candidate fetching

import { showToast } from '../utils.js';
import {
  buildPlanContext,
  scoreCandidates,
  packageRecommendations,
  PRIORITY_VALUES,
} from '../domain/todayPlans.js';
import {
  fetchNearbyCandidates,
  radiusToMetres,
} from '../services/places.js';
import {
  saveTodayPlan,
  loadTodayPlan,
} from '../services/todayPlans.js';

// ─── Module-level session state ───────────────────────────────────────────────
// Persists across navigations within a session so returning to the view
// shows the last result without re-running the flow.

let _lastResults = null;
let _lastContext = null;

// ─── Bottom sheet helpers ─────────────────────────────────────────────────────
//
// No shared helpers exist in the codebase — these are self-contained here,
// matching the pattern used in src/views/books.js.
//
// openSheet        — form fields → resolves { [fieldId]: value } | null on cancel
// openChoiceSheet  — option list → resolves value string | null on cancel

function openSheet(config) {
  return new Promise(resolve => {
    const fieldsHtml = (config.fields || []).map(f => {
      if (f.type === 'textarea') {
        return `
          <div class="bsheet-field">
            <label class="bsheet-label" for="bsheet-${f.id}">${f.label}</label>
            <textarea
              class="bsheet-textarea textarea"
              id="bsheet-${f.id}"
              placeholder="${f.placeholder || ''}"
              rows="${f.rows || 3}"
            >${f.value || ''}</textarea>
          </div>
        `;
      }
      return `
        <div class="bsheet-field">
          <label class="bsheet-label" for="bsheet-${f.id}">${f.label}</label>
          <input
            class="bsheet-input"
            id="bsheet-${f.id}"
            type="${f.type || 'text'}"
            placeholder="${f.placeholder || ''}"
            value="${f.value || ''}"
            autocomplete="off"
          />
        </div>
      `;
    }).join('');

    const bodyHtml = config.body
      ? `<p class="bsheet-body">${config.body}</p>`
      : '';

    const confirmClass = config.danger
      ? 'bsheet-btn bsheet-btn--danger'
      : 'bsheet-btn bsheet-btn--primary';

    const el = document.createElement('div');
    el.className = 'bsheet-overlay';
    el.innerHTML = `
      <div class="bsheet" role="dialog" aria-modal="true">
        <div class="bsheet-handle"></div>
        <p class="bsheet-title">${config.title}</p>
        ${bodyHtml}
        ${fieldsHtml}
        <div class="bsheet-actions">
          <button class="${confirmClass}" id="bsheetConfirm">${config.confirm}</button>
          <button class="bsheet-btn bsheet-btn--cancel" id="bsheetCancel">${config.cancel || 'Cancel'}</button>
        </div>
      </div>
    `;

    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('bsheet-overlay--open'));

    function close(result) {
      el.classList.remove('bsheet-overlay--open');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
      resolve(result);
    }

    el.querySelector('#bsheetConfirm').addEventListener('click', () => {
      const result = {};
      (config.fields || []).forEach(f => {
        const input = el.querySelector(`#bsheet-${f.id}`);
        result[f.id] = input ? input.value : '';
      });
      close(result);
    });

    el.querySelector('#bsheetCancel').addEventListener('click', () => close(null));
    el.addEventListener('click', (e) => { if (e.target === el) close(null); });

    requestAnimationFrame(() => {
      const first = el.querySelector('input, textarea');
      if (first) first.focus();
    });
  });
}

function openChoiceSheet(config) {
  return new Promise(resolve => {
    const optionsHtml = (config.options || []).map(option => `
      <button
        type="button"
        class="bsheet-choice-btn"
        data-choice-value="${option.value}"
      >
        <span class="bsheet-choice-title">${option.title}</span>
        ${option.description
          ? `<span class="bsheet-choice-description">${option.description}</span>`
          : ''}
      </button>
    `).join('');

    const bodyHtml = config.body
      ? `<p class="bsheet-body">${config.body}</p>`
      : '';

    const el = document.createElement('div');
    el.className = 'bsheet-overlay';
    el.innerHTML = `
      <div class="bsheet" role="dialog" aria-modal="true">
        <div class="bsheet-handle"></div>
        <p class="bsheet-title">${config.title}</p>
        ${bodyHtml}
        <div class="bsheet-choice-list">
          ${optionsHtml}
        </div>
        <div class="bsheet-actions">
          <button class="bsheet-btn bsheet-btn--cancel" id="bsheetChoiceCancel">
            ${config.cancel || 'Cancel'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('bsheet-overlay--open'));

    function close(result) {
      el.classList.remove('bsheet-overlay--open');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
      resolve(result);
    }

    el.querySelectorAll('[data-choice-value]').forEach(btn => {
      btn.addEventListener('click', () => close(btn.getAttribute('data-choice-value')));
    });

    el.querySelector('#bsheetChoiceCancel')?.addEventListener('click', () => close(null));
    el.addEventListener('click', (e) => { if (e.target === el) close(null); });

    requestAnimationFrame(() => {
      const first = el.querySelector('[data-choice-value]');
      if (first) first.focus();
    });
  });
}

// ─── Prompt steps ─────────────────────────────────────────────────────────────
//
// Defined as named functions rather than a static array so the flow can
// branch conditionally (e.g. skip babyState when Nico isn't coming).
//
// Each function returns the sheet's resolved value, or null if the user
// tapped Back/Cancel. collectAnswers() treats null as "repeat this step"
// unless it is the first step, in which case it exits the flow entirely.
//
// Step map (4 steps when withNico=false, 5 when withNico=true):
//   0  Who's coming?       → withNico + outingFocus
//   1  How is Nico?        → babyState          [conditional: withNico only]
//   2  How are you?        → parentEnergy
//   3  What matters most?  → priority
//   4  Food?               → foodIntent
//   5  How far?            → travelTolerance

function stepOuting() {
  return openChoiceSheet({
    title: 'What kind of outing?',
    options: [
      {
        value:       'nico-easy',
        title:       'Nico and me — keeping it easy',
        description: 'Low-key, calm, minimal effort.',
      },
      {
        value:       'nico-both',
        title:       'Nico and me — something for both of us',
        description: 'A good mix of activity and ease.',
      },
      {
        value:       'me',
        title:       'Just me today',
        description: 'Nico is home — this one is for you.',
      },
    ],
    cancel: 'Cancel',
  });
}

function stepBabyState() {
  return openChoiceSheet({
    title: 'How is Nico right now?',
    options: [
      { value: 'happy',        title: 'Happy',          description: 'Settled, content, good to go.' },
      { value: 'just-woke',    title: 'Just woke up',   description: 'Fresh and ready.' },
      { value: 'fussy',        title: 'A bit fussy',    description: 'Needs some patience.' },
      { value: 'tired',        title: 'Tired',          description: 'Low energy, keep it gentle.' },
      { value: 'due-nap-soon', title: 'Due a nap soon', description: 'Time is limited.' },
    ],
    cancel: 'Back',
  });
}

function stepParentEnergy() {
  return openChoiceSheet({
    title: 'How are you feeling?',
    options: [
      { value: 'good',     title: 'Good',         description: 'Up for it.' },
      { value: 'low',      title: 'Low',          description: 'Moving, but carefully.' },
      { value: 'depleted', title: 'Depleted',     description: 'Easy does it.' },
      { value: 'solo',     title: 'Flying solo',  description: 'On your own today.' },
    ],
    cancel: 'Back',
  });
}

function stepPriority() {
  return openChoiceSheet({
    title: 'What matters most today?',
    options: PRIORITY_VALUES.map(p => ({ value: p.value, title: p.label })),
    cancel: 'Back',
  });
}

function stepTravelTolerance() {
  return openChoiceSheet({
    title: 'How far are you happy to go?',
    options: [
      { value: 'walk',  title: 'Walking distance',  description: 'Under 15 minutes on foot.' },
      { value: '15min', title: 'Up to 15 min away', description: 'Short drive or long walk.' },
      { value: '30min', title: 'Up to 30 min away', description: 'Comfortable drive.' },
    ],
    cancel: 'Back',
  });
}

// ─── Prompt flow ──────────────────────────────────────────────────────────────
//
// 4 steps max (3 when "Just me" is selected — no baby state step).
// null from any step means Back; null on step 0 exits entirely.
// foodIntent is derived from priority ('food' → 'required', else 'nice').

function decodeOutingType(outingType, answers) {
  if (outingType === 'me') {
    answers.withNico    = false;
    answers.outingFocus = 'me';
  } else if (outingType === 'nico-easy') {
    answers.withNico    = true;
    answers.outingFocus = 'nico';
  } else {
    answers.withNico    = true;
    answers.outingFocus = 'both';
  }
}

async function collectAnswers() {
  const answers = {};

  // ── Step 0: outing type ───────────────────────────────────────────────────
  let outingType = await stepOuting();
  if (outingType === null) return null;
  decodeOutingType(outingType, answers);

  // ── Step 1: baby state — only when Nico is coming ────────────────────────
  if (answers.withNico) {
    let babyState = await stepBabyState();
    while (babyState === null) {
      // Back → re-run step 0
      outingType = await stepOuting();
      if (outingType === null) return null;
      decodeOutingType(outingType, answers);
      if (!answers.withNico) break; // switched to "just me" — skip baby state
      babyState = await stepBabyState();
    }
    if (babyState !== null) answers.babyState = babyState;
  }

  // ── Step 2: parent energy ─────────────────────────────────────────────────
  let parentEnergy = await stepParentEnergy();
  while (parentEnergy === null) {
    // Back → re-run baby state (or outing if no Nico)
    if (answers.withNico) {
      const bs = await stepBabyState();
      if (bs !== null) answers.babyState = bs;
    } else {
      outingType = await stepOuting();
      if (outingType === null) return null;
      decodeOutingType(outingType, answers);
    }
    parentEnergy = await stepParentEnergy();
  }
  answers.parentEnergy = parentEnergy;

  // ── Step 3: priority ──────────────────────────────────────────────────────
  let priority = await stepPriority();
  while (priority === null) {
    // Back → re-ask parent energy
    const pe = await stepParentEnergy();
    if (pe !== null) answers.parentEnergy = pe;
    priority = await stepPriority();
  }
  answers.priority  = priority;
  answers.foodIntent = priority === 'food' ? 'required' : 'nice';

  // ── Step 4: travel tolerance ──────────────────────────────────────────────
  let travelTolerance = await stepTravelTolerance();
  while (travelTolerance === null) {
    // Back → re-ask priority
    const p = await stepPriority();
    if (p !== null) {
      answers.priority   = p;
      answers.foodIntent = p === 'food' ? 'required' : 'nice';
    }
    travelTolerance = await stepTravelTolerance();
  }
  answers.travelTolerance = travelTolerance;

  return answers;
}

// ─── Location helper ──────────────────────────────────────────────────────────

function getGeolocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      ()   => resolve(null),
      { timeout: 8000, maximumAge: 300000 }
    );
  });
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderRoleBadge(role) {
  const labels = { safest: 'Easiest option', best: 'Best fit', fallback: 'Alternative' };
  return `<span class="today-plan-role today-plan-role--${role}">${labels[role] || role}</span>`;
}

function renderCard(rec) {
  // Distance — walkable gets a neutral label; driveMinutes is a drive estimate only
  const distanceChip = rec.walkable
    ? `<span class="today-plan-chip">🚶 Walkable</span>`
    : rec.driveMinutes != null
      ? `<span class="today-plan-chip">🚗 ${rec.driveMinutes} min</span>`
      : '';

  const ratingChip = rec.rating != null
    ? `<span class="today-plan-chip">★ ${rec.rating}</span>`
    : '';

  // Tags — skip generic structural ones already implied by other signals
  const skip = new Set(['indoor', 'outdoor', 'easy']);
  const tagPills = rec.tags
    ? rec.tags
        .filter(t => !skip.has(t))
        .slice(0, 3)
        .map(t => `<span class="nico-tag">${t}</span>`)
        .join('')
    : '';

  const hasFoot = distanceChip || ratingChip || tagPills || rec.googleMapsUrl;

  const mapsLink = rec.googleMapsUrl
    ? `<a class="today-plan-maps-link" href="${rec.googleMapsUrl}" target="_blank" rel="noopener noreferrer">Open in Maps →</a>`
    : '';

  const suburb = rec.suburb
    ? `<p class="today-plan-suburb">${rec.suburb}</p>`
    : '';

  // planTitle is the action-framed plan label ("Easy coffee stop").
  // rec.name is the actual place name, rendered smaller beneath it.
  const planTitle = rec.planTitle
    ? `<h2 class="today-plan-name">${rec.planTitle}</h2>`
    : '';

  const placeName = rec.name
    ? `<p class="today-plan-place-name">${rec.name}</p>`
    : '';

  return `
    <div class="today-plan-card" data-role="${rec.role}">
      <div class="today-plan-card-top">
        ${renderRoleBadge(rec.role)}
      </div>
      ${planTitle}
      ${placeName}
      ${suburb}
      <p class="today-plan-description">${rec.description}</p>
      <p class="today-plan-why">${rec.whyNow}</p>
      ${hasFoot ? `
        <div class="today-plan-foot">
          <div class="today-plan-chips">
            ${distanceChip}
            ${ratingChip}
            ${tagPills}
          </div>
          ${mapsLink}
        </div>
      ` : ''}
    </div>
  `;
}

function renderResults(recommendations, context) {
  if (!recommendations || recommendations.length === 0) {
    return `
      <p class="card-body">No matching places found for your current preferences.</p>
      <button class="btn-secondary w-full mt-3" id="todayPlanRetryBtn">Try again</button>
    `;
  }

  let contextNote = '';
  if (context?.weather === 'rainy') {
    contextNote = `<p class="today-plan-context-note">Keeping it indoors — looks wet out there.</p>`;
  } else if (context?.weather === 'hot') {
    contextNote = `<p class="today-plan-context-note">Prioritising cool, shaded options today.</p>`;
  }

  return `
    ${contextNote}
    <div class="today-plan-cards">
      ${recommendations.map(rec => renderCard(rec)).join('')}
    </div>
    <button class="btn-secondary w-full mt-4" id="todayPlanRetryBtn">Start over</button>
  `;
}

function renderLoading() {
  return `
    <div class="today-plan-loading">
      <p class="eyebrow" style="margin-bottom: 8px;">One moment</p>
      <p class="card-body">Finding the best options for right now…</p>
    </div>
  `;
}

function renderPrompt() {
  return `
    <div class="today-plan-prompt">
      <p class="card-body">Answer a few quick questions and get three tailored suggestions for today.</p>
      <button class="btn-primary w-full mt-4" id="todayPlanStartBtn">Let's find somewhere</button>
    </div>
  `;
}

function renderView(phase, recommendations, context) {
  // In results phase the outer .card shell is stripped so each recommendation
  // card renders as its own surface (matching nico activity cards).
  // setCardContent always targets #todayPlanCard and sets innerHTML — the
  // wrapper element itself never changes, only its class and content.
  const isResults = phase === 'results';

  // Outer wrapper class: transparent in results, card in all other phases
  const wrapperClass = isResults
    ? 'today-plan-results-shell mt-0'
    : 'card mt-0';

  let content = '';
  if (phase === 'idle') {
    content = renderPrompt();
  } else if (phase === 'loading') {
    content = renderLoading();
  } else if (phase === 'results') {
    content = renderResults(recommendations, context);
  } else {
    content = `
      <p class="card-body">Something went wrong — please try again.</p>
      <button class="btn-secondary w-full mt-3" id="todayPlanRetryBtn">Try again</button>
    `;
  }

  return `
    <main class="view-scroll">
      <div class="view-inner">
        <header class="page-header">
          <p class="eyebrow">Grounded</p>
          <h1 class="page-title">Today's plan</h1>
          <p class="page-subtitle">Find somewhere good to go today.</p>
        </header>
        <section class="${wrapperClass}" id="todayPlanCard">
          ${content}
        </section>
        <div style="height: 12px;"></div>
      </div>
    </main>
  `;
}

// ─── Card-level re-render helper ──────────────────────────────────────────────
// Also swaps the wrapper class between phases:
//   results → today-plan-results-shell (transparent, cards provide their own surfaces)
//   all others → card (single contained surface)

function setCardContent(container, html, isResults = false) {
  const card = container.querySelector('#todayPlanCard');
  if (!card) return;
  if (isResults) {
    card.className = 'today-plan-results-shell mt-0';
  } else {
    card.className = 'card mt-0';
  }
  card.innerHTML = html;
}

// ─── Flow ─────────────────────────────────────────────────────────────────────

async function runFlow(container, userId, profile, weatherData) {
  const answers = await collectAnswers();
  if (!answers) return; // user cancelled from step 0

  // Inject weather from live data if available; otherwise default to sunny
  if (weatherData) {
    const desc = (weatherData.currentDesc || '').toLowerCase();
    if (desc.includes('rain') || desc.includes('shower')) {
      answers.weather = 'rainy';
    } else if ((weatherData.currentTemp ?? 0) >= 30) {
      answers.weather = 'hot';
    } else if (desc.includes('cloud') || desc.includes('overcast')) {
      answers.weather = 'cloudy';
    } else {
      answers.weather = 'sunny';
    }
    answers.weatherSource = 'live';
  } else {
    answers.weather = 'sunny';
    answers.weatherSource = 'manual';
  }

  setCardContent(container, renderLoading(), false);
  const context = buildPlanContext(answers, profile, weatherData);
  const radiusMetres = radiusToMetres(context.travelTolerance);
  const location = await getGeolocation();

  let fetchResult;
  try {
    fetchResult = await fetchNearbyCandidates(
      location?.lat ?? null,
      location?.lng ?? null,
      radiusMetres,
      context.weather
    );
  } catch {
    fetchResult = { candidates: [], fromCache: false, fromFallback: true };
  }

  const ranked = scoreCandidates(fetchResult.candidates, context);
  const recommendations = packageRecommendations(ranked, context, fetchResult.candidates);

  _lastResults = recommendations;
  _lastContext  = context;

  // Persist to Firestore so results survive app close — fire-and-forget
  if (userId) {
    saveTodayPlan(userId, context, recommendations).catch(() => {});
  }

  setCardContent(container, renderResults(recommendations, context), true);
  bindRetry(container, userId, profile, weatherData);
}

// ─── Event binding ────────────────────────────────────────────────────────────

function bindRetry(container, userId, profile, weatherData) {
  container.querySelector('#todayPlanRetryBtn')?.addEventListener('click', () => {
    _lastResults = null;
    _lastContext  = null;
    setCardContent(container, renderPrompt(), false);
    bindStart(container, userId, profile, weatherData);
  });
}

function bindStart(container, userId, profile, weatherData) {
  container.querySelector('#todayPlanStartBtn')?.addEventListener('click', async () => {
    const btn = container.querySelector('#todayPlanStartBtn');
    if (btn) btn.disabled = true;
    try {
      await runFlow(container, userId, profile, weatherData);
    } catch {
      setCardContent(container, `
        <p class="card-body">Something went wrong — please try again.</p>
        <button class="btn-secondary w-full mt-3" id="todayPlanRetryBtn">Try again</button>
      `, false);
      bindRetry(container, userId, profile, weatherData);
    }
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export const TodayPlansView = {
  async init(container, user) {
    container.innerHTML = '<div class="loading-state"><p>Loading…</p></div>';

    let profile     = null;
    let weatherData = null;

    try {
      const { db } = await import('../lib/firebase.js');
      const { doc, getDoc } = await import('firebase/firestore');
      const { fetchWeather } = await import('../services/weather.js');

      const [snap, weather] = await Promise.all([
        getDoc(doc(db, 'users', user.uid)),
        fetchWeather().catch(() => null),
      ]);

      profile     = snap.exists() ? snap.data() : null;
      weatherData = weather;
    } catch {
      // Degrade gracefully — profile and weather are optional
    }

    // Restore in-memory session results first (fastest path)
    if (_lastResults && _lastContext) {
      container.innerHTML = renderView('results', _lastResults, _lastContext);
      bindRetry(container, user.uid, profile, weatherData);
      return;
    }

    // Try to load today's saved plan from Firestore
    try {
      const saved = await loadTodayPlan(user.uid);
      if (saved?.recommendations?.length) {
        _lastResults = saved.recommendations;
        _lastContext  = saved.context;
        container.innerHTML = renderView('results', _lastResults, _lastContext);
        bindRetry(container, user.uid, profile, weatherData);
        return;
      }
    } catch {
      // Firestore unavailable — fall through to idle prompt
    }

    container.innerHTML = renderView('idle', null, null);
    bindStart(container, user.uid, profile, weatherData);
  },
};
