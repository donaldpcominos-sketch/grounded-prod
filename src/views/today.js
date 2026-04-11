import { saveTodayWellnessCheckin } from '../services/wellness.js';
import { touchLastActive } from '../services/lastSeen.js';
import { getTodayDisplay, showToast, getTodayKey } from '../utils.js';
import { fetchWeather } from '../services/weather.js';
import { WEEKLY_SPLIT } from '../data/workouts.js';
import { HABITS, toggleHabit } from '../services/habits.js';
import { navigateTo } from '../router.js';
import { getDailyState } from '../domain/dailyState.js';
import { Skeletons } from '../skeletons.js';
import { getTodayRecommendations } from '../domain/recommendations.js';
import { getTodaySummary } from '../domain/summary.js';
import { getDayContext } from '../domain/dayContext.js';
import {
  getReminderDecision,
  classifyEngagementState,
  buildWeatherBriefingMessage,
  getWeatherBriefingDecision,
} from '../domain/notifications.js';
import {
  loadNotificationData,
  recordAppOpened,
  recordMeaningfulEngagement,
  recordDailyReminderSent,
  recordWeatherBriefingSent,
} from '../services/notifications.js';

// ─── Greeting ─────────────────────────────────────────────────────────────────

function getGreeting(firstName) {
  const h = new Date().getHours();
  if (h < 12) return `Good morning, ${firstName}.`;
  if (h < 17) return `Good afternoon, ${firstName}.`;
  return `Good evening, ${firstName}.`;
}

// ─── Hero ring ────────────────────────────────────────────────────────────────

const RING_CIRCUMFERENCE = 263.89; // 2π × r42

function renderHeroRing(habitsState, workoutStreak) {
  const done  = habitsState?.completedCount ?? 0;
  const total = habitsState?.totalCount ?? 0;
  const allDone = total > 0 && done >= total;

  const ringFillClass = allDone ? 'today-ring-fill today-ring-fill--gold' : 'today-ring-fill';

  const innerContent = total > 0
    ? `
      <p class="today-ring-count">${done}<span style="font-size:14px;color:var(--color-ink-4)">/${total}</span></p>
      <p class="today-ring-label">habits</p>
      ${workoutStreak > 0 ? `<p class="today-ring-streak">🔥 ${workoutStreak}</p>` : ''}
    `
    : `<p class="today-ring-label" style="font-size:12px;color:var(--color-ink-3);text-align:center;padding:0 8px">Set up habits →</p>`;

  return `
    <div class="today-ring-wrap" id="todayRingWrap">
      <svg class="today-ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle class="${ringFillClass === 'today-ring-fill today-ring-fill--gold' ? 'today-ring-bg' : 'today-ring-bg'}" cx="50" cy="50" r="42"/>
        <circle class="${ringFillClass}" id="todayRingFill" cx="50" cy="50" r="42"/>
      </svg>
      <div class="today-ring-inner">${innerContent}</div>
    </div>
  `;
}

// ─── Weather card ─────────────────────────────────────────────────────────────

function weatherConditionClass(desc, emoji) {
  const d = (desc || '').toLowerCase();
  const e = emoji || '';
  if (d.includes('thunder') || d.includes('storm') || e === '⛈️') return 'weather-card--storm';
  if (d.includes('snow') || d.includes('sleet') || e === '❄️' || e === '🌨️') return 'weather-card--snow';
  if (d.includes('rain') || d.includes('drizzle') || d.includes('shower') || e === '🌧️' || e === '🌦️') return 'weather-card--rain';
  if (d.includes('partly') || d.includes('mostly') || e === '⛅' || e === '🌤️') return 'weather-card--partly-cloudy';
  if (d.includes('cloud') || d.includes('overcast') || d.includes('fog') || d.includes('mist')) return 'weather-card--cloudy';
  if (d.includes('sun') || d.includes('clear') || e === '☀️') return 'weather-card--sunny';
  return '';
}

function uvBadgeClass(uv) {
  if (uv >= 8) return 'weather-uv-badge weather-uv-badge--extreme';
  if (uv >= 4) return 'weather-uv-badge weather-uv-badge--high';
  return 'weather-uv-badge';
}

// renderWeatherCard accepts hasBriefing — a boolean indicating whether a
// valid briefing exists for this session. When true, a subtle "View briefing"
// button is appended at the bottom of the card so the user can re-open the
// briefing at any time, independent of whether the auto-banner is visible.

function renderWeatherCard(weather, hasBriefing) {
  if (!weather) {
    return `
      <div class="weather-card" id="weatherCard">
        <p class="card-label">Weather</p>
        <p class="card-body mt-1" style="color:var(--color-ink-4);">Unavailable — check your connection.</p>
      </div>
    `;
  }

  const { currentTemp, currentEmoji, currentDesc, currentUv, forecast, walkWindow, fromCache, cacheAgeMs } = weather;
  const condClass = weatherConditionClass(currentDesc, currentEmoji);

  const staleNote = fromCache
    ? `<p class="weather-stale-note">Offline — last updated ${Math.round(cacheAgeMs / 60000)} min ago</p>`
    : '';

  const forecastHtml = (forecast || []).map(d => `
    <div class="weather-forecast-day">
      <p class="forecast-label">${d.label}</p>
      <p class="forecast-emoji">${d.emoji}</p>
      <p class="forecast-temps">${d.high}&deg; <span>${d.low}&deg;</span></p>
    </div>
  `).join('');

  // "View briefing" — present whenever a briefing exists for this session,
  // regardless of whether the auto-banner has been dismissed.
  const viewBriefingBtn = hasBriefing
    ? `<button class="weather-briefing-link" id="viewWeatherBriefingBtn" aria-label="View today&#39;s weather briefing">View briefing</button>`
    : '';

  return `
    <div class="weather-card ${condClass}" id="weatherCard">
      <div class="weather-main">
        <div class="weather-current">
          <span class="weather-emoji">${currentEmoji}</span>
          <div class="weather-temp-block">
            <p class="weather-temp">${currentTemp}&deg;</p>
            <p class="weather-desc">${currentDesc}</p>
          </div>
        </div>
        <span class="${uvBadgeClass(currentUv)}">UV ${currentUv}</span>
      </div>
      ${walkWindow ? `<div class="weather-walk-window">${walkWindow}</div>` : ''}
      <div class="weather-forecast" id="weatherForecast" hidden>${forecastHtml}</div>
      <button class="weather-forecast-toggle" id="weatherForecastToggle" aria-expanded="false">Show forecast</button>
      ${staleNote}
      ${viewBriefingBtn}
    </div>
  `;
}

// ─── Return message ───────────────────────────────────────────────────────────

function getReturnMessage(gapHours) {
  if (gapHours <= 48) return null;
  if (gapHours > 7 * 24) {
    return {
      headline: "You've been away for a while.",
      sub: 'This is your space. Take your time — no catch-up needed.'
    };
  }
  if (gapHours > 3 * 24) {
    return {
      headline: "It's been a few days.",
      sub: "Welcome back. No pressure — just checking in when you're ready."
    };
  }
  return {
    headline: 'Good to see you again.',
    sub: "It's been a couple of days. Start wherever feels right."
  };
}

// ─── Weather briefing banner ──────────────────────────────────────────────────
// Used for both the automatic first-show and the manual re-open.
// The banner is identical either way — only the trigger differs.

function renderWeatherBriefingBanner(briefing) {
  if (!briefing) return '';

  return `
    <div
      class="reminder-banner reminder-banner--weather"
      id="weatherBriefingBanner"
      role="status"
      aria-live="polite"
    >
      <div class="reminder-banner-inner">
        <div class="reminder-banner-text">
          <p class="reminder-banner-headline">${briefing.headline}</p>
          <p class="reminder-banner-body">${briefing.body}</p>
        </div>
        <button
          class="reminder-banner-dismiss"
          id="weatherBriefingBannerDismiss"
          aria-label="Dismiss weather briefing"
        >✕</button>
      </div>
    </div>
  `;
}

// ─── In-app reminder banner ───────────────────────────────────────────────────
// Rendered only when getReminderDecision says shouldSendReminder === true.
// messageType drives the modifier class for tonal styling variation:
//   'soft'   — user has already started; warmer, acknowledging tone
//   'gentle' — user hasn't started yet; calm, inviting tone

function renderReminderBanner(decision) {
  if (!decision?.shouldSendReminder) return '';

  const typeClass = decision.messageType === 'soft'
    ? 'reminder-banner--soft'
    : 'reminder-banner--gentle';

  return `
    <div
      class="reminder-banner ${typeClass}"
      id="reminderBanner"
      data-message-type="${decision.messageType || 'gentle'}"
      role="status"
      aria-live="polite"
    >
      <div class="reminder-banner-inner">
        <div class="reminder-banner-text">
          <p class="reminder-banner-headline">${decision.headline}</p>
          <p class="reminder-banner-body">${decision.body}</p>
        </div>
        <button
          class="reminder-banner-dismiss"
          id="reminderBannerDismiss"
          aria-label="Dismiss reminder"
        >✕</button>
      </div>
    </div>
  `;
}

// ─── Quick check-in ───────────────────────────────────────────────────────────

const MOOD_OPTIONS = [
  { value: 'calm', emoji: '🌿', label: 'Calm' },
  { value: 'good', emoji: '✨', label: 'Good' },
  { value: 'flat', emoji: '😶', label: 'Flat' },
  { value: 'stretched', emoji: '🌊', label: 'Stretched' }
];

const ENERGY_OPTIONS = [
  { value: 'low', emoji: '🌙', label: 'Low' },
  { value: 'medium', emoji: '☀️', label: 'Medium' },
  { value: 'high', emoji: '⚡', label: 'High' }
];

function renderQuickCheckin(mood, energy) {
  const bothSet = mood && energy;

  if (bothSet) {
    const m = MOOD_OPTIONS.find(o => o.value === mood);
    const e = ENERGY_OPTIONS.find(o => o.value === energy);
    return `
      <div class="qci-card qci-card--summary" id="quickCheckin">
        <div class="qci-summary-row">
          <div class="qci-summary-pair">
            <span class="qci-mood-dot qci-mood-dot--${mood}" aria-hidden="true"></span>
            <span class="qci-summary-chip">${m?.emoji || ''} ${m?.label || mood}</span>
            <span class="qci-summary-chip">${e?.emoji || ''} ${e?.label || energy}</span>
          </div>
          <button class="qci-edit-btn" id="qciEditBtn" aria-label="Edit check-in">Edit</button>
        </div>
      </div>
    `;
  }

  const energyHidden = !mood;

  return `
    <div class="qci-card" id="quickCheckin">
      <p class="qci-heading">How are you feeling?</p>
      <div class="qci-group">
        ${MOOD_OPTIONS.map(o => `
          <button type="button"
            class="qci-btn${mood === o.value ? ' qci-btn--selected' : ''}"
            data-qci-group="mood" data-value="${o.value}"
            aria-pressed="${mood === o.value}"
          >
            <span class="qci-btn-emoji">${o.emoji}</span>
            <span class="qci-btn-label">${o.label}</span>
          </button>
        `).join('')}
      </div>
      <div class="qci-divider${energyHidden ? ' qci-divider--hidden' : ''}"></div>
      <div class="qci-group qci-group--energy${energyHidden ? ' qci-group--energy--hidden' : ''}">
        ${ENERGY_OPTIONS.map(o => `
          <button type="button"
            class="qci-btn${energy === o.value ? ' qci-btn--selected' : ''}"
            data-qci-group="energy" data-value="${o.value}"
            aria-pressed="${energy === o.value}"
          >
            <span class="qci-btn-emoji">${o.emoji}</span>
            <span class="qci-btn-label">${o.label}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

// ─── Priority actions ─────────────────────────────────────────────────────────

function renderPriorityActions(recommendations) {
  if (!Array.isArray(recommendations) || recommendations.length === 0) return '';

  // Show at most 2 suggestions — enough to nudge, not enough to overwhelm
  const recs = recommendations.slice(0, 2);

  return `
    <section class="priority-actions-list" id="priorityActionsCard">
      ${recs.map(rec => `
        <button
          type="button"
          class="priority-action"
          data-rec-route="${rec.route || ''}"
          data-rec-target="${rec.targetId || ''}"
          aria-label="${rec.title}"
        >
          <div class="priority-action-copy">
            <p class="priority-action-title">${rec.title}</p>
            <p class="priority-action-text">${rec.message}</p>
          </div>
          <span class="priority-action-cta">${rec.actionLabel || 'Open'} →</span>
        </button>
      `).join('')}
    </section>
  `;
}

// ─── Today's workout tile ─────────────────────────────────────────────────────

function getTypeTag(type) {
  return { lower: 'Glutes', upper: 'Upper', full: 'Full Body', 'cardio-core': 'Cardio', recovery: 'Mobility' }[type] || type;
}

function getTypeColor(type) {
  return { lower: 'tag--warm', upper: 'tag--cool', full: 'tag--neutral', 'cardio-core': 'tag--green', recovery: 'tag--soft' }[type] || 'tag--neutral';
}

function renderWorkoutTile(savedSession, state) {
  const today = new Date().getDay();
  const split = WEEKLY_SPLIT[today];
  if (!split) return '';

  const context = getDayContext(state);
  const isDone = savedSession?.status === 'complete';
  const isAlternate = savedSession?.type === 'alternate';

  let statusLine = '';
  if (isDone && isAlternate) {
    statusLine = `<span class="workout-tile-done workout-tile-done--alt">✓ ${savedSession.alternateLabel || 'Activity'} done</span>`;
  } else if (isDone) {
    statusLine = '<span class="workout-tile-done">✓ Done today</span>';
  }

  const focusText = getWorkoutTileFocus(split, context, isDone);

  return `
    <button class="workout-tile" id="workoutTileBtn" aria-label="Go to workouts">
      <div class="workout-tile-left">
        <p class="workout-tile-eyebrow">Today&#39;s workout</p>
        <p class="workout-tile-label">${split.label}</p>
        <p class="workout-tile-focus">${focusText}</p>
      </div>
      <div class="workout-tile-right">
        <span class="tag ${getTypeColor(split.type)}">${getTypeTag(split.type)}</span>
        ${statusLine}
        <span class="workout-tile-arrow">→</span>
      </div>
    </button>
  `;
}

function getWorkoutTileFocus(split, context, isDone) {
  if (isDone) {
    if (context.energyBand === 'low') return 'Nicely done — keep the rest of the day light';
    if (context.momentumBand === 'strong') return 'Another steady step in a strong week';
    return 'Movement done for today';
  }
  if (context.tone === 'welcome-back')     return 'Ease back in gently today';
  if (context.tone === 'gentle-reset')     return 'A little movement could help reset the day';
  if (context.energyBand === 'low')        return 'Keep it light today';
  if (context.tone === 'protect-momentum') return 'Momentum is already there — keep today realistic';
  if (context.tone === 'build-momentum')   return 'A good chance to keep your rhythm going';
  if (context.tone === 'reset-week')       return 'A small session could shift the tone of the week';
  if (context.energyBand === 'high')       return 'Good day to lean into your energy';
  return split.focus;
}

// ─── Habits entry tile ────────────────────────────────────────────────────────

function renderHabitsTile(habitsState) {
  const doneCount = habitsState?.completedCount ?? 0;
  const total     = habitsState?.totalCount ?? HABITS.length;
  const allDone   = total > 0 && doneCount === total;
  const pct       = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return `
    <button
      class="habits-entry-tile"
      id="habitsTileBtn"
      aria-label="Open habits tracker"
    >
      <div class="habits-tile-top">
        <div>
          <p class="habits-tile-eyebrow">Daily habits</p>
          <p class="habits-tile-count">${doneCount} <span>of ${total}</span></p>
        </div>
        <span class="workout-tile-arrow">${allDone ? '✓' : '→'}</span>
      </div>
      <div class="habits-tile-bar-wrap">
        <div class="habits-tile-bar" style="width:${pct}%"></div>
      </div>
    </button>
  `;
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderReturnCard(returnMsg) {
  if (!returnMsg) return '';
  return `
    <div class="return-card" id="returnCard" role="status" aria-live="polite">
      <div class="return-card-inner">
        <div class="return-card-text">
          <p class="return-card-headline">${returnMsg.headline}</p>
          <p class="return-card-sub">${returnMsg.sub}</p>
        </div>
        <button class="return-card-dismiss" id="returnCardDismiss" aria-label="Dismiss">✕</button>
      </div>
    </div>
  `;
}

// ─── Ritual ───────────────────────────────────────────────────────────────────

function ritualGreetingHTML(firstName) {
  return `
    <div class="ritual-step">
      <p class="ritual-eyebrow">Grounded</p>
      <h1 class="ritual-title">${getGreeting(firstName)}</h1>
      <p class="ritual-subtitle">${getTodayDisplay()}</p>
      <button class="ritual-begin-btn" id="ritualBeginBtn">Begin</button>
    </div>
  `;
}

function ritualMoodHTML() {
  return `
    <div class="ritual-step">
      <p class="ritual-progress">1 of 2</p>
      <h2 class="ritual-question">How are you<br>feeling today?</h2>
      <div class="ritual-options ritual-options--grid">
        ${MOOD_OPTIONS.map(o => `
          <button class="ritual-option" data-value="${o.value}">
            <span class="ritual-option-emoji">${o.emoji}</span>
            <span class="ritual-option-label">${o.label}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function ritualEnergyHTML() {
  return `
    <div class="ritual-step">
      <p class="ritual-progress">2 of 2</p>
      <h2 class="ritual-question">How's your<br>energy?</h2>
      <div class="ritual-options ritual-options--row">
        ${ENERGY_OPTIONS.map(o => `
          <button class="ritual-option" data-value="${o.value}">
            <span class="ritual-option-emoji">${o.emoji}</span>
            <span class="ritual-option-label">${o.label}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function ritualDoneHTML(mood, habitsState, workoutStreak) {
  const m = MOOD_OPTIONS.find(o => o.value === mood);
  return `
    <div class="ritual-step ritual-step--done">
      <div class="ritual-done-ring">
        ${renderHeroRing(habitsState, workoutStreak)}
      </div>
      <p class="ritual-done-headline">You're set.</p>
      ${m ? `<p class="ritual-done-mood">${m.emoji} ${m.label}</p>` : ''}
    </div>
  `;
}

// showRitual renders a full-screen overlay and walks through greeting →
// mood → energy → done. Calls onComplete({ mood, energy }) when finished,
// then fades out so the canvas renders underneath.
function showRitual(container, user, state, onComplete) {
  const firstName = user.displayName?.split(' ')[0] || 'there';
  const ws = { mood: '', energy: '' };

  const overlay = document.createElement('div');
  overlay.className = 'ritual-overlay';
  overlay.id = 'ritualOverlay';
  document.body.appendChild(overlay);

  const nav = document.querySelector('.bottom-nav');
  if (nav) { nav.style.opacity = '0'; nav.style.pointerEvents = 'none'; }

  // Set early cleanup so the router can dismiss the overlay on navigation
  container._groundedCleanup = () => {
    overlay.remove();
    if (nav) { nav.style.opacity = ''; nav.style.pointerEvents = ''; }
  };

  function step(html, bindFn) {
    overlay.classList.add('ritual-overlay--out');
    setTimeout(() => {
      overlay.innerHTML = html;
      overlay.classList.remove('ritual-overlay--out');
      requestAnimationFrame(() => bindFn());
    }, 180);
  }

  function goMood() {
    step(ritualMoodHTML(), () => {
      overlay.querySelectorAll('.ritual-option').forEach(btn => {
        btn.addEventListener('click', () => {
          ws.mood = btn.dataset.value;
          document.body.dataset.mood = ws.mood;
          overlay.querySelectorAll('.ritual-option').forEach(b =>
            b.classList.toggle('ritual-option--selected', b === btn)
          );
          saveTodayWellnessCheckin(user.uid, ws).catch(() => {});
          setTimeout(goEnergy, 320);
        });
      });
    });
  }

  function goEnergy() {
    step(ritualEnergyHTML(), () => {
      overlay.querySelectorAll('.ritual-option').forEach(btn => {
        btn.addEventListener('click', () => {
          ws.energy = btn.dataset.value;
          overlay.querySelectorAll('.ritual-option').forEach(b =>
            b.classList.toggle('ritual-option--selected', b === btn)
          );
          saveTodayWellnessCheckin(user.uid, ws).catch(() => {});
          setTimeout(goDone, 320);
        });
      });
    });
  }

  function goDone() {
    step(ritualDoneHTML(ws.mood, state.habits, state.workout?.streak ?? 0), () => {
      // Animate ring
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const ring = overlay.querySelector('#todayRingFill');
        if (ring) {
          const total = state.habits?.totalCount ?? 0;
          const done  = state.habits?.completedCount ?? 0;
          ring.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - (total > 0 ? done / total : 0));
        }
      }));

      // Canvas renders underneath while overlay fades
      setTimeout(() => {
        onComplete({ mood: ws.mood, energy: ws.energy });
        overlay.classList.add('ritual-overlay--exiting');
        if (nav) { nav.style.opacity = ''; nav.style.pointerEvents = ''; }
        setTimeout(() => { overlay.remove(); container._groundedCleanup = null; }, 400);
      }, 1600);
    });
  }

  // Step 0: greeting
  overlay.innerHTML = ritualGreetingHTML(firstName);
  overlay.querySelector('#ritualBeginBtn')?.addEventListener('click', goMood);
}

// ─── Canvas habits ────────────────────────────────────────────────────────────

function renderCanvasHabits(habitsState) {
  const items = habitsState?.items ?? [];
  if (!items.length) return '';

  return `
    <section class="canvas-habits" id="canvasHabits">
      <p class="canvas-section-label">Today's habits</p>
      <div class="canvas-habit-pills">
        ${items.map(h => `
          <button
            class="canvas-habit-pill${h.completed ? ' canvas-habit-pill--done' : ''}"
            data-habit-id="${h.id}"
            aria-label="${h.name}${h.completed ? ' — done' : ''}"
            aria-pressed="${h.completed}"
          >
            <span class="canvas-habit-pill-emoji">${h.emoji || '●'}</span>
          </button>
        `).join('')}
      </div>
    </section>
  `;
}

function renderView(user, state, returnMsg, weather, recommendations, reminderDecision, weatherBriefing, hasBriefing, canvasMode = false) {
  const firstName = user.displayName?.split(' ')[0] || 'there';
  const workoutStreak = state.workout?.streak ?? 0;

  return `
    <main class="view-scroll"${canvasMode ? ' data-mode="canvas"' : ''}>
      <div class="view-inner">

<header class="today-hero">
  <div class="today-hero-toprow">
    <p class="today-hero-eyebrow">Grounded</p>
    ${user.photoURL ? `<img src="${user.photoURL}" alt="${user.displayName || 'Profile'}" class="avatar" />` : ''}
  </div>
  ${renderHeroRing(state.habits, workoutStreak)}
  <h1 class="today-greeting">${getGreeting(firstName)}</h1>
  <p class="today-hero-date">${getTodayDisplay()}</p>
</header>

<p class="today-summary" id="todaySummary">
  ${getTodaySummary(state)}
</p>

        ${renderReturnCard(returnMsg)}
        ${renderWeatherBriefingBanner(weatherBriefing)}
        ${renderReminderBanner(reminderDecision)}
        ${renderPriorityActions(recommendations)}
        ${renderWeatherCard(weather, hasBriefing)}
        ${renderQuickCheckin(state.wellness.mood || '', state.wellness.energy || '')}

        ${canvasMode ? renderCanvasHabits(state.habits) : ''}

        <div class="card-stack">
          ${renderWorkoutTile(state.workout, state)}
          ${canvasMode ? '' : renderHabitsTile(state.habits)}
        </div>

        <p id="wellnessStatus" class="status-text mt-4 px-1"></p>

      </div>
    </main>
  `;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export const TodayView = {
  async init(container, user) {
    container.innerHTML = Skeletons.today();

    const [state, weather, notifData] = await Promise.all([
      getDailyState(user.uid),
      fetchWeather().catch(() => null),
      loadNotificationData(user.uid).catch(() => ({ prefs: null, notifState: null })),
    ]);

    // Record app opened. Fire-and-forget — never blocks the render.
    recordAppOpened(user.uid).catch(() => {});

    touchLastActive(user.uid);

    // ── Reminder decision ──────────────────────────────────────────────────
    // Suppressed for the session if the user already dismissed it.
    const reminderDecision = (!_reminderDismissed && notifData.prefs && notifData.notifState)
      ? getReminderDecision(notifData.prefs, state, notifData.notifState)
      : null;

    // ── Weather briefing ───────────────────────────────────────────────────
    // _sessionWeatherBriefing persists the computed briefing for the lifetime
    // of this session so the manual re-open button can always access it,
    // even after the auto-banner has been dismissed.
    //
    // The briefing is tomorrow-focused, using forecast[1] from the existing
    // weather fetch result. No extra network call or localStorage read needed.
    //
    // It is only populated once per session (on first init after a fresh
    // app open that passes the eligibility gates). On subsequent navigations
    // back to Today, the auto-banner is suppressed (_weatherBriefingDismissed)
    // but the "View briefing" button in the weather card still works because
    // _sessionWeatherBriefing is still set.
    if (!_sessionWeatherBriefing && notifData.prefs && notifData.notifState) {
      const briefingDecision = getWeatherBriefingDecision(
        notifData.prefs,
        notifData.notifState,
        weather,
      );

      if (briefingDecision.shouldShow) {
        const built = buildWeatherBriefingMessage(weather);
        if (built) {
          _sessionWeatherBriefing = built;
          // Record immediately so it does not auto-show again today,
          // even if the user dismisses and reopens the app.
          recordWeatherBriefingSent(user.uid).catch(() => {});
        }
      }
    }

    // The auto-banner renders only on the first eligible open this session.
    // Once _weatherBriefingDismissed is true, it is suppressed — but the
    // weather card's "View briefing" button remains available via
    // _sessionWeatherBriefing.
    const autoShowBriefing = !_weatherBriefingDismissed ? _sessionWeatherBriefing : null;

    const returnMsg = _returnDismissed ? null : getReturnMessage(state.lastSeen?.gapHours ?? 0);

    // ── Ritual — show once per day when check-in hasn't been done ─────────────
    if (!state.wellness.mood) {
      container.innerHTML = '';
      await new Promise(resolve => {
        showRitual(container, user, state, ({ mood, energy }) => {
          state.wellness.mood   = mood;
          state.wellness.energy = energy;
          resolve();
        });
      });
    }

    const viewState = {
      ...state,
      wellness: { ...state.wellness },
      habits:   { ...state.habits },
    };

    function getRecommendations() {
      return getTodayRecommendations(viewState);
    }

    container.innerHTML = renderView(
      user,
      viewState,
      returnMsg,
      weather,
      getRecommendations(),
      reminderDecision,
      autoShowBriefing,
      !!_sessionWeatherBriefing,
      true, // canvasMode — always on
    );

    // ── Mood ambient tint — restore from saved state on every load ───────────
    if (viewState.wellness?.mood) {
      document.body.dataset.mood = viewState.wellness.mood;
    } else {
      delete document.body.dataset.mood;
    }

    // ── Ring animation ───────────────────────────────────────────────────────
    // Double rAF ensures the element is painted at stroke-dashoffset:263.89
    // before we transition it to the target value.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const ring = document.getElementById('todayRingFill');
        if (!ring) return;
        const total = viewState.habits?.totalCount ?? 0;
        const done  = viewState.habits?.completedCount ?? 0;
        const pct   = total > 0 ? done / total : 0;
        ring.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - pct);
      });
    });

    // Record the reminder as sent immediately after rendering.
    if (reminderDecision?.shouldSendReminder) {
      recordDailyReminderSent(user.uid).catch(() => {});
    }

    const wellnessState = viewState.wellness;
    let habitsRefreshSeq = 0;

    // ── Banner auto-hide helper ──────────────────────────────────────────────
    function hideReminderBannerIfDone(updatedViewState) {
      const banner = document.getElementById('reminderBanner');
      if (!banner) return;

      const newEngagementState = classifyEngagementState(updatedViewState);
      if (newEngagementState === 'done') {
        banner.classList.add('reminder-banner--dismissing');
        setTimeout(() => banner.remove(), 300);
      }
    }

    // ── Bind events ──────────────────────────────────────────────────────────

    function bindPriorityActions() {
      document.querySelectorAll('.priority-action').forEach(btn => {
        btn.addEventListener('click', () => {
          const route    = btn.dataset.recRoute;
          const targetId = btn.dataset.recTarget;

          if (targetId) {
            const target = document.getElementById(targetId);
            if (target) {
              target.scrollIntoView({ behavior: 'smooth', block: 'center' });
              target.classList.add('today-target-pulse');
              setTimeout(() => target.classList.remove('today-target-pulse'), 1200);
            }
            return;
          }

          if (route) {
            const cleaned = route.replace(/^#\//, '').replace(/^#/, '');
            if (cleaned) navigateTo(cleaned);
          }
        });
      });
    }

    function bindStaticTiles() {
      document.getElementById('workoutTileBtn')?.addEventListener('click', () => {
        navigateTo('workouts');
      });

      document.getElementById('habitsTileBtn')?.addEventListener('click', () => {
        navigateTo('habits');
      });
    }

    function syncRing() {
      const ring = document.getElementById('todayRingFill');
      if (!ring) return;
      const total = viewState.habits?.totalCount ?? 0;
      const done  = viewState.habits?.completedCount ?? 0;
      ring.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - (total > 0 ? done / total : 0));
    }

    function rebuildCanvasHabits() {
      const section = document.getElementById('canvasHabits');
      if (!section) return;
      const fresh = document.createElement('div');
      fresh.innerHTML = renderCanvasHabits(viewState.habits);
      const next = fresh.firstElementChild;
      if (next) {
        section.replaceWith(next);
        bindCanvasHabits();
      }
    }

    function bindCanvasHabits() {
      document.querySelectorAll('.canvas-habit-pill').forEach(btn => {
        btn.addEventListener('click', async () => {
          const habitId = btn.dataset.habitId;
          const wasDone = btn.classList.contains('canvas-habit-pill--done');
          const habit   = viewState.habits?.items?.find(h => h.id === habitId);
          if (!habit) return;

          const newValue = !wasDone;
          btn.classList.toggle('canvas-habit-pill--done', newValue);
          btn.setAttribute('aria-pressed', String(newValue));

          // Optimistic update
          habit.completed = newValue;
          viewState.habits.completedCount = viewState.habits.items.filter(h => h.completed).length;
          syncRing();
          rebuildSummary();
          rebuildPriorityActions();

          try {
            await toggleHabit(user.uid, getTodayKey(), habitId, newValue, { name: habit.name, emoji: habit.emoji });
            window.dispatchEvent(new CustomEvent('grounded:habits-updated', { detail: { source: 'today-view' } }));
          } catch {
            // Revert on error
            habit.completed = wasDone;
            viewState.habits.completedCount = viewState.habits.items.filter(h => h.completed).length;
            btn.classList.toggle('canvas-habit-pill--done', wasDone);
            btn.setAttribute('aria-pressed', String(wasDone));
            syncRing();
          }
        });
      });
    }

    // ── Weather briefing banner bindings ─────────────────────────────────────
    // bindWeatherBriefingBanner handles both the auto-shown banner and any
    // banner re-injected by the manual "View briefing" button. It is called
    // once on init and again each time a banner is re-inserted into the DOM.

    function bindWeatherBriefingBanner() {
      document.getElementById('weatherBriefingBannerDismiss')?.addEventListener('click', () => {
        const banner = document.getElementById('weatherBriefingBanner');
        if (!banner) return;
        _weatherBriefingDismissed = true;
        banner.classList.add('reminder-banner--dismissing');
        setTimeout(() => banner.remove(), 300);
      });
    }

    // ── "View briefing" button in the weather card ───────────────────────────
    // Injects the briefing banner above the weather card when clicked.
    // Does not touch notification state — this is a pure UI action.
    // If a banner is already visible, scrolls to it instead of adding another.

    function bindViewBriefingButton() {
      document.getElementById('viewWeatherBriefingBtn')?.addEventListener('click', () => {
        if (!_sessionWeatherBriefing) return;

        // If the banner is already in the DOM, scroll to it and pulse.
        const existing = document.getElementById('weatherBriefingBanner');
        if (existing) {
          existing.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          existing.classList.add('reminder-banner--pulse');
          setTimeout(() => existing.classList.remove('reminder-banner--pulse'), 400);
          return;
        }

        // Re-inject the banner immediately before the weather card.
        const weatherCard = document.getElementById('weatherCard');
        if (!weatherCard) return;

        const node = document.createElement('div');
        node.innerHTML = renderWeatherBriefingBanner(_sessionWeatherBriefing);
        const banner = node.firstElementChild;
        if (!banner) return;

        // Clear the dismissed flag so the user can dismiss the re-opened banner.
        _weatherBriefingDismissed = false;

        weatherCard.insertAdjacentElement('beforebegin', banner);
        banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        // Bind the dismiss button on the freshly inserted banner.
        bindWeatherBriefingBanner();
      });
    }

    function bindReminderBanner() {
      document.getElementById('reminderBannerDismiss')?.addEventListener('click', () => {
        const banner = document.getElementById('reminderBanner');
        if (!banner) return;
        _reminderDismissed = true;
        banner.classList.add('reminder-banner--dismissing');
        setTimeout(() => banner.remove(), 300);
      });
    }

    function rebuildPriorityActions() {
      const card = document.getElementById('priorityActionsCard');
      if (!card) return;

      const fresh = document.createElement('div');
      fresh.innerHTML = renderPriorityActions(getRecommendations());
      const next = fresh.firstElementChild;

      if (next) {
        card.replaceWith(next);
        bindPriorityActions();
      } else {
        card.remove();
      }
    }

    function rebuildQci() {
      const qci = document.getElementById('quickCheckin');
      if (!qci) return;

      const fresh = document.createElement('div');
      fresh.innerHTML = renderQuickCheckin(wellnessState.mood, wellnessState.energy);
      qci.replaceWith(fresh.firstElementChild);
      bindQci();
    }

    function rebuildWorkoutTile() {
      const tile = document.getElementById('workoutTileBtn');
      if (!tile) return;

      const fresh = document.createElement('div');
      fresh.innerHTML = renderWorkoutTile(viewState.workout, viewState);
      const next = fresh.firstElementChild;

      if (next) {
        tile.replaceWith(next);
        bindStaticTiles();
      }
    }

    function rebuildHabitsTile() {
      const tile = document.getElementById('habitsTileBtn');
      if (!tile) return;

      const fresh = document.createElement('div');
      fresh.innerHTML = renderHabitsTile(viewState.habits);
      const next = fresh.firstElementChild;

      if (next) {
        tile.replaceWith(next);
        bindStaticTiles();
      }

      // Sync ring to updated habits state
      const ring = document.getElementById('todayRingFill');
      if (ring) {
        const total = viewState.habits?.totalCount ?? 0;
        const done  = viewState.habits?.completedCount ?? 0;
        const pct   = total > 0 ? done / total : 0;
        ring.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - pct);
      }
    }

    function rebuildSummary() {
      const summary = document.getElementById('todaySummary');
      if (!summary) return;
      summary.textContent = getTodaySummary(viewState);
    }

    async function refreshHabitsStateFromSource() {
      const seq = ++habitsRefreshSeq;

      try {
        const freshState = await getDailyState(user.uid);

        if (seq !== habitsRefreshSeq) return;

        viewState.habits = freshState.habits;

        if (freshState.habits?.completedCount > 0) {
          recordMeaningfulEngagement(user.uid).catch(() => {});
        }

        const mergedState = { ...viewState, habits: freshState.habits };
        hideReminderBannerIfDone(mergedState);

        rebuildHabitsTile();
        rebuildCanvasHabits();
        syncRing();
        rebuildSummary();
        rebuildPriorityActions();
      } catch {
        // fail silently for cross-view refresh
      }
    }

    function refreshTodayUI(options = {}) {
      const {
        qci             = true,
        summary         = true,
        priorityActions = true,
        workout         = true,
        habits          = true
      } = options;

      if (qci)             rebuildQci();
      if (summary)         rebuildSummary();
      if (priorityActions) rebuildPriorityActions();
      if (workout)         rebuildWorkoutTile();
      if (habits)          rebuildHabitsTile();
    }

    function collapseAndResolveQci() {
      const qci = document.getElementById('quickCheckin');
      if (!qci) return;
      qci.classList.add('qci-card--collapsing');
      setTimeout(() => {
        refreshTodayUI();
        // Animate the resolved summary card in
        const resolved = document.getElementById('quickCheckin');
        if (resolved) resolved.style.animation = 'qci-resolve 0.28s ease both';
      }, 340);
    }

    function bindQci() {
      document.querySelectorAll('[data-qci-group]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const group = btn.dataset.qciGroup;
          const val   = btn.dataset.value;

          wellnessState[group]      = val;
          viewState.wellness[group] = val;

          document.querySelectorAll(`[data-qci-group="${group}"]`).forEach(b => {
            b.classList.toggle('qci-btn--selected', b.dataset.value === val);
            b.setAttribute('aria-pressed', String(b.dataset.value === val));
          });

          // Reveal energy group the first time mood is selected
          if (group === 'mood') {
            document.querySelector('.qci-group--energy')?.classList.remove('qci-group--energy--hidden');
            document.querySelector('.qci-divider')?.classList.remove('qci-divider--hidden');
          }

          try {
            await saveTodayWellnessCheckin(user.uid, wellnessState);

            if (wellnessState.mood && wellnessState.energy) {
              recordMeaningfulEngagement(user.uid).catch(() => {});

              const mergedState = { ...viewState, wellness: { ...wellnessState } };
              hideReminderBannerIfDone(mergedState);

              // Apply ambient mood tint to the page background
              document.body.dataset.mood = wellnessState.mood;

              collapseAndResolveQci();
            }
          } catch {
            showToast('Save failed — try again', 'error');
          }
        });
      });

      document.getElementById('qciEditBtn')?.addEventListener('click', () => {
        const qci = document.getElementById('quickCheckin');
        if (!qci) return;

        wellnessState.mood      = '';
        wellnessState.energy    = '';
        viewState.wellness.mood   = '';
        viewState.wellness.energy = '';

        // Lift mood tint while editing
        delete document.body.dataset.mood;

        const fresh = document.createElement('div');
        fresh.innerHTML = renderQuickCheckin('', '');
        qci.replaceWith(fresh.firstElementChild);

        bindQci();
        refreshTodayUI({
          qci:            false,
          summary:        true,
          priorityActions: true,
          workout:        true,
          habits:         true
        });
      });
    }

    function handleHabitsUpdated(event) {
      const detail = event?.detail || {};
      if (detail.source === 'today-view') return;
      refreshHabitsStateFromSource();
    }

    document.getElementById('returnCardDismiss')?.addEventListener('click', () => {
      _returnDismissed = true;
      const card = document.getElementById('returnCard');
      if (card) {
        card.classList.add('return-card--dismissing');
        setTimeout(() => card.remove(), 350);
      }
    });

    window.addEventListener('grounded:habits-updated', handleHabitsUpdated);

    bindPriorityActions();
    bindStaticTiles();
    bindCanvasHabits();
    bindQci();
    bindReminderBanner();
    bindWeatherBriefingBanner();
    bindViewBriefingButton();

    document.getElementById('weatherForecastToggle')?.addEventListener('click', () => {
      const forecast = document.getElementById('weatherForecast');
      const toggle   = document.getElementById('weatherForecastToggle');
      if (!forecast || !toggle) return;
      const nowHidden = !forecast.hidden;
      forecast.hidden = nowHidden;
      toggle.textContent = nowHidden ? 'Show forecast' : 'Hide forecast';
      toggle.setAttribute('aria-expanded', String(!nowHidden));
    });

    container._groundedCleanup = () => {
      window.removeEventListener('grounded:habits-updated', handleHabitsUpdated);
      document.getElementById('ritualOverlay')?.remove();
      const navEl = document.querySelector('.bottom-nav');
      if (navEl) { navEl.style.opacity = ''; navEl.style.pointerEvents = ''; }
    };
  }
};

// ─── Module-level session state ───────────────────────────────────────────────
// All flags live outside init so they survive navigation away and back.

let _returnDismissed          = false;
let _reminderDismissed        = false;
let _weatherBriefingDismissed = false;

// Holds the computed briefing object for the entire session.
// Populated once on the first eligible app open; never cleared.
// Allows the "View briefing" button to function even after the auto-banner
// has been dismissed, and across navigations back to Today.
// Notification state is never touched by manual re-opens.
let _sessionWeatherBriefing = null;
