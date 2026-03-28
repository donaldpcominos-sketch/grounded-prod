// src/views/todayPlans.js
//
// Today Plans view — orchestration and rendering only.
// No scoring logic, no place enrichment, no Firestore.
//
// All behaviour comes from:
//   src/domain/todayPlans.js  — context building, scoring, packaging
//   src/services/places.js    — candidate fetching


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
// Each entry is a function that shows one sheet and resolves to its answer
// (a string for choice sheets, an object for form sheets), or null if the
// user taps the cancel / back button.
//
// The flow loop in collectAnswers() treats null as "go back one step".
// Step 0 uses 'Cancel' as its button label — tapping it exits the flow.
// All subsequent steps use 'Back' — tapping it returns to the previous step.
// This is the only navigation mechanism; no extra state machinery is needed.

const STEPS = [
  // Step 0 — baby state
  () => openChoiceSheet({
    title: 'How is Nico right now?',
    options: [
      { value: 'happy',        title: 'Happy',          description: 'Settled, content, good to go.' },
      { value: 'just-woke',    title: 'Just woke up',   description: 'Fresh and ready.' },
      { value: 'fussy',        title: 'A bit fussy',    description: 'Needs some patience.' },
      { value: 'tired',        title: 'Tired',          description: 'Low energy, keep it gentle.' },
      { value: 'due-nap-soon', title: 'Due a nap soon', description: 'Time is limited.' },
    ],
    cancel: 'Cancel',
  }),

  // Step 1 — parent energy
  () => openChoiceSheet({
    title: 'How are you feeling?',
    options: [
      { value: 'good',     title: 'Good',         description: 'Up for it.' },
      { value: 'low',      title: 'Low',          description: 'Moving, but carefully.' },
      { value: 'depleted', title: 'Depleted',     description: 'Easy does it.' },
      { value: 'solo',     title: 'Flying solo',  description: 'On your own today.' },
    ],
    cancel: 'Back',
  }),

  // Step 2 — priority
  () => openChoiceSheet({
    title: 'What feels right today?',
    options: PRIORITY_VALUES.map(p => ({ value: p.value, title: p.label })),
    cancel: 'Back',
  }),

  // Step 3 — travel tolerance
  () => openChoiceSheet({
    title: 'How far are you happy to go?',
    options: [
      { value: 'walk',  title: 'Walking distance',  description: 'Under 15 minutes on foot.' },
      { value: '15min', title: 'Up to 15 min away', description: 'Short drive or long walk.' },
      { value: '30min', title: 'Up to 30 min away', description: 'Comfortable drive.' },
    ],
    cancel: 'Back',
  }),

  // Step 4 — duration
  () => openChoiceSheet({
    title: 'How long do you have?',
    options: [
      { value: '30min', title: '30 minutes' },
      { value: '1hr',   title: 'About an hour' },
      { value: '2hr',   title: 'A couple of hours' },
      { value: 'open',  title: 'As long as it takes' },
    ],
    cancel: 'Back',
  }),

  // Step 5 — optional free-text note
  () => openSheet({
    title: 'Anything else? (optional)',
    body:  'A quick note to help narrow things down.',
    fields: [
      {
        id:          'freeText',
        label:       'Notes',
        type:        'textarea',
        placeholder: 'e.g. Nico just ate, or keep it shaded.',
        value:       '',
        rows:        3,
      },
    ],
    confirm: 'Find places',
    cancel:  'Back',
  }),
];

// Maps each step index to the answers key it populates.
// Step 5 returns an object — handled separately in the loop.
const STEP_KEYS = ['babyState', 'parentEnergy', 'priority', 'travelTolerance', 'duration', null];

// ─── Prompt flow ──────────────────────────────────────────────────────────────

async function collectAnswers() {
  const answers = {};
  let step = 0;

  while (step < STEPS.length) {
    const result = await STEPS[step]();

    if (result === null) {
      // Back / cancel
      if (step === 0) return null; // Cancel on first step exits the flow entirely
      step -= 1;
      continue;
    }

    const key = STEP_KEYS[step];

    if (key) {
      // Choice sheet — raw string value
      answers[key] = result;
    } else {
      // Step 5: form sheet returns an object
      answers.freeText = (result.freeText || '').trim() || null;
    }

    step += 1;
  }

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

function renderMeta(rec) {
  const parts = [];

  if (rec.walkable) {
    // driveMinutes is a drive-time estimate — not a walking-time estimate.
    // Show a neutral label instead.
    parts.push('🚶 Walkable');
  } else if (rec.driveMinutes != null) {
    parts.push(`🚗 ${rec.driveMinutes} min`);
  }

  if (rec.rating != null) {
    parts.push(`★ ${rec.rating}`);
  }

  if (rec.tags && rec.tags.length > 0) {
    const skip = new Set(['indoor', 'outdoor', 'easy']);
    const display = rec.tags.filter(t => !skip.has(t)).slice(0, 3);
    if (display.length > 0) {
      parts.push(display.join(' · '));
    }
  }

  if (parts.length === 0) return '';

  return `
    <div class="today-plan-meta">
      ${parts.map(p => `<span class="today-plan-meta-item">${p}</span>`).join('')}
    </div>
  `;
}

function renderCard(rec) {
  const suburb = rec.suburb
    ? `<p class="today-plan-suburb">${rec.suburb}</p>`
    : '';

  const mapsLink = rec.googleMapsUrl
    ? `<a class="today-plan-maps-link" href="${rec.googleMapsUrl}" target="_blank" rel="noopener noreferrer">Open in Maps →</a>`
    : '';

  return `
    <div class="today-plan-card" data-role="${rec.role}">
      ${renderRoleBadge(rec.role)}
      <h2 class="today-plan-name">${rec.name}</h2>
      ${suburb}
      <p class="today-plan-description">${rec.description}</p>
      <p class="today-plan-why">${rec.whyNow}</p>
      ${renderMeta(rec)}
      ${mapsLink}
    </div>
  `;
}

function renderResults(recommendations, context) {
  if (!recommendations || recommendations.length === 0) {
    return `
      <div class="today-plan-empty">
        <p class="card-body">No matching places found for your current preferences.</p>
        <button class="btn-secondary w-full mt-3" id="todayPlanRetryBtn">Try again</button>
      </div>
    `;
  }

  let contextNote = '';
  if (context?.weather === 'rainy') {
    contextNote = '<p class="today-plan-context-note">Keeping it indoors — looks wet out there.</p>';
  } else if (context?.weather === 'hot') {
    contextNote = '<p class="today-plan-context-note">Prioritising cool, easy options today.</p>';
  }

  return `
    <div class="today-plan-results">
      ${contextNote}
      <div class="today-plan-cards">
        ${recommendations.map(rec => renderCard(rec)).join('')}
      </div>
      <button class="btn-secondary w-full mt-4" id="todayPlanRetryBtn">Start over</button>
    </div>
  `;
}

function renderLoading() {
  return `
    <div class="today-plan-loading">
      <p class="card-body">Finding the best options for right now…</p>
    </div>
  `;
}

function renderPrompt() {
  return `
    <div class="today-plan-prompt">
      <p class="card-body">Answer a few quick questions and get three tailored suggestions for today.</p>
      <button class="btn-primary w-full mt-3" id="todayPlanStartBtn">Let's find somewhere</button>
    </div>
  `;
}

function renderView(phase, recommendations, context) {
  let content = '';

  if (phase === 'idle') {
    content = renderPrompt();
  } else if (phase === 'loading') {
    content = renderLoading();
  } else if (phase === 'results') {
    content = renderResults(recommendations, context);
  } else if (phase === 'error') {
    content = `
      <div class="today-plan-error">
        <p class="card-body">Something went wrong — please try again.</p>
        <button class="btn-secondary w-full mt-3" id="todayPlanRetryBtn">Try again</button>
      </div>
    `;
  }

  return `
    <main class="view-scroll">
      <div class="view-inner">
        <header class="page-header">
          <p class="eyebrow">Grounded</p>
          <h1 class="page-title">Today's plan</h1>
          <p class="page-subtitle">Where to take Nico right now.</p>
        </header>
        <section class="card mt-0" id="todayPlanCard">
          ${content}
        </section>
        <div style="height: 12px;"></div>
      </div>
    </main>
  `;
}

// ─── Card-level re-render helper ──────────────────────────────────────────────

function setCardContent(container, html) {
  const card = container.querySelector('#todayPlanCard');
  if (card) card.innerHTML = html;
}

// ─── Flow ─────────────────────────────────────────────────────────────────────

async function runFlow(container, profile, weatherData) {
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

  setCardContent(container, renderLoading());

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

  setCardContent(container, renderResults(recommendations, context));
  bindRetry(container, profile, weatherData);
}

// ─── Event binding ────────────────────────────────────────────────────────────

function bindRetry(container, profile, weatherData) {
  container.querySelector('#todayPlanRetryBtn')?.addEventListener('click', () => {
    _lastResults = null;
    _lastContext  = null;
    setCardContent(container, renderPrompt());
    bindStart(container, profile, weatherData);
  });
}

function bindStart(container, profile, weatherData) {
  container.querySelector('#todayPlanStartBtn')?.addEventListener('click', async () => {
    const btn = container.querySelector('#todayPlanStartBtn');
    if (btn) btn.disabled = true;
    try {
      await runFlow(container, profile, weatherData);
    } catch {
      setCardContent(container, `
        <div class="today-plan-error">
          <p class="card-body">Something went wrong — please try again.</p>
          <button class="btn-secondary w-full mt-3" id="todayPlanRetryBtn">Try again</button>
        </div>
      `);
      bindRetry(container, profile, weatherData);
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

    // If session results exist, show them immediately without re-running the flow
    if (_lastResults && _lastContext) {
      container.innerHTML = renderView('results', _lastResults, _lastContext);
      bindRetry(container, profile, weatherData);
      return;
    }

    container.innerHTML = renderView('idle', null, null);
    bindStart(container, profile, weatherData);
  },
};
