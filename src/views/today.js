import { saveTodayWellnessCheckin } from '../services/wellness.js';
import { touchLastActive } from '../services/lastSeen.js';
import { getSuggestionsForEnergy } from '../data/nutrition.js';
import { getTodayDisplay, showToast } from '../utils.js';
import { getWeekSummary } from '../services/progress.js';
import { fetchWeather, getYesterdaySnapshot } from '../services/weather.js';
import { WEEKLY_SPLIT } from '../data/workouts.js';
import { HABITS } from '../services/habits.js';
import { navigateTo } from '../router.js';
import { getDailyState } from '../domain/dailyState.js';
import { getTodayRecommendations } from '../domain/recommendations.js';
import { getTodaySummary } from '../domain/summary.js';
import { getDayContext } from '../domain/dayContext.js';
import {
  getReminderDecision,
  getMeaningfulEngagement,
  classifyEngagementState,
  compareWeather,
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

// ─── Weather card ─────────────────────────────────────────────────────────────

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
    <div class="weather-card" id="weatherCard">
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
      <div class="weather-forecast">${forecastHtml}</div>
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
            <span class="qci-summary-chip">${m?.emoji || ''} ${m?.label || mood}</span>
            <span class="qci-summary-chip">${e?.emoji || ''} ${e?.label || energy}</span>
          </div>
          <button class="qci-edit-btn" id="qciEditBtn" aria-label="Edit check-in">Edit</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="qci-card" id="quickCheckin">
      <p class="qci-heading">How are you today?</p>
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
      <div class="qci-divider"></div>
      <div class="qci-group qci-group--energy">
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

function getPriorityActionsMeta(state) {
  const context = getDayContext(state);

  switch (context.tone) {
    case 'welcome-back':
      return { title: 'Start gently', subtitle: 'A few small suggestions to help you ease back in.' };
    case 'gentle-reset':
      return { title: 'Gentle reset', subtitle: 'A few simple suggestions to help steady the day.' };
    case 'check-in-first':
      return { title: 'Start here', subtitle: 'A quick check-in will help shape the rest of the day.' };
    case 'protect-momentum':
      return { title: 'Keep it steady', subtitle: 'You already have momentum this week — keep today realistic.' };
    case 'build-momentum':
      return { title: 'Keep the rhythm going', subtitle: 'A few well-placed actions could carry your momentum forward.' };
    case 'start-small':
      return { title: 'Start small', subtitle: 'One or two simple actions are enough to shift the day.' };
    case 'reset-week':
      return { title: 'Small reset', subtitle: 'A couple of grounded actions could help reset the tone of the week.' };
    case 'low-energy':
      return { title: 'Keep it light', subtitle: 'Focus on the essentials and let that be enough for today.' };
    case 'high-energy-move':
      return { title: 'Use the energy well', subtitle: 'A few intentional actions could make today feel really good.' };
    case 'steady-day':
    default:
      return { title: 'Priority actions', subtitle: 'A few gentle suggestions for today.' };
  }
}

function renderPriorityActions(recommendations, state) {
  if (!Array.isArray(recommendations) || recommendations.length === 0) return '';

  const meta = getPriorityActionsMeta(state);

  return `
    <section class="card" id="priorityActionsCard">
      <div class="card-row">
        <div>
          <p class="card-label">${meta.title}</p>
          <p class="card-body mt-1">${meta.subtitle}</p>
        </div>
      </div>

      <div class="mt-4">
        ${recommendations.map(rec => `
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
      </div>
    </section>
  `;
}

// ─── Nourishment card ─────────────────────────────────────────────────────────

function energyEmoji(energy) {
  return { low: '🌙', medium: '☀️', high: '⚡' }[energy] || '';
}

function renderNourishmentCard(energy) {
  const suggestions = getSuggestionsForEnergy(energy || 'medium', 3);
  const energyLabel = energy
    ? `${energyEmoji(energy)} ${energy.charAt(0).toUpperCase() + energy.slice(1)} energy`
    : 'Today';

  return `
    <div class="card" id="nourishmentCard">
      <div class="card-row">
        <div>
          <p class="card-label">Nourishment</p>
          <p class="card-body mt-1">Ideas to eat well today.</p>
        </div>
        <span class="badge">${energyLabel}</span>
      </div>
      <div class="nutrition-suggestions mt-4">
        ${suggestions.map(s => `
          <div class="nutrition-suggestion">
            <p class="nutrition-suggestion-label">${s.label}</p>
            <p class="nutrition-suggestion-desc">${s.desc}</p>
          </div>
        `).join('')}
      </div>
    </div>
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

function getHabitsProgressMeta(habitsState, habitsProgress) {
  const total    = habitsState?.totalCount ?? HABITS.length;
  const doneCount = habitsState?.completedCount ?? 0;

  const activeDays           = habitsProgress?.activeHabitsDays ?? 0;
  const perfectDays          = habitsProgress?.activePerfectHabitDays ?? 0;
  const perfectRate          = habitsProgress?.activePerfectHabitsCompletionRate ?? 0;
  const currentPerfectStreak = habitsProgress?.activePerfectHabitCurrentStreak ?? 0;
  const bestPerfectStreak    = habitsProgress?.activePerfectHabitBestStreak ?? 0;

  let headline = '';
  if (perfectDays === 7) {
    headline = '7/7 perfect days — golden week.';
  } else if (doneCount === total && total > 0) {
    headline = 'Perfect today — keep the streak alive.';
  } else if (currentPerfectStreak >= 3) {
    headline = `${currentPerfectStreak}-day perfect streak — beautiful rhythm.`;
  } else if (doneCount > 0) {
    headline = 'Nice start today — keep building toward a perfect day.';
  } else if (activeDays >= 4) {
    headline = 'Strong week so far — today could become another perfect day.';
  } else {
    headline = 'Start small today and build toward a perfect day.';
  }

  let streakNote = '';
  if (currentPerfectStreak > 0) {
    if (currentPerfectStreak < bestPerfectStreak) {
      const remaining = bestPerfectStreak - currentPerfectStreak;
      streakNote = `Perfect streak: ${currentPerfectStreak} day${currentPerfectStreak === 1 ? '' : 's'} · ${remaining} more to beat your best`;
    } else if (currentPerfectStreak === bestPerfectStreak && bestPerfectStreak > 0) {
      streakNote = `Perfect streak: ${currentPerfectStreak} day${currentPerfectStreak === 1 ? '' : 's'} · Matching your best`;
    } else {
      streakNote = `Perfect streak: ${currentPerfectStreak} day${currentPerfectStreak === 1 ? '' : 's'} · New best`;
    }
  } else if (bestPerfectStreak > 0) {
    streakNote = `Best perfect streak: ${bestPerfectStreak} day${bestPerfectStreak === 1 ? '' : 's'}`;
  }

  return {
    headline,
    stats: [
      `${activeDays}/7 active days`,
      `${perfectDays}/7 perfect days this week`
    ],
    streakNote,
    perfectDays,
    perfectRate
  };
}

function renderHabitsTile(habitsState, habitsProgress) {
  const doneCount = habitsState?.completedCount ?? 0;
  const total     = habitsState?.totalCount ?? HABITS.length;
  const allDone   = total > 0 && doneCount === total;

  const progressMeta  = getHabitsProgressMeta(habitsState, habitsProgress);
  const perfectProgress = progressMeta.perfectDays / 7;

  const innerCirc   = 87.96;
  const innerFilled = total > 0 ? (doneCount / total) * innerCirc : 0;

  const tileClasses = [
    'habits-entry-tile',
    progressMeta.perfectDays === 7 ? 'habits-entry-tile--gold' : ''
  ].join(' ');

  return `
    <button
      class="${tileClasses}"
      id="habitsTileBtn"
      aria-label="Open habits tracker"
      style="--perfect-progress:${perfectProgress}"
    >
      <div class="habits-tile-top">
        <div>
          <p class="habits-tile-eyebrow">Daily habits</p>
          <p class="habits-tile-count">${doneCount} <span>of ${total}</span></p>
        </div>

        <div class="habits-tile-right">
          <div class="habits-tile-ring">
            <svg width="42" height="42" viewBox="0 0 36 36" class="habits-ring-svg">
              <circle class="habits-ring-bg" cx="18" cy="18" r="14" fill="none"/>
              <circle
                class="habits-ring-fill"
                cx="18" cy="18" r="14" fill="none"
                stroke="${allDone ? '#5a7a5a' : 'var(--color-ink-2)'}"
                stroke-dasharray="${innerFilled.toFixed(2)} ${innerCirc.toFixed(2)}"
                stroke-dashoffset="0"
              />
            </svg>
            ${allDone
              ? '<span class="habits-ring-check">✓</span>'
              : `<span class="habits-ring-pct">${Math.round((doneCount / total) * 100)}%</span>`}
          </div>
          <span class="workout-tile-arrow">→</span>
        </div>
      </div>

      <div class="habits-tile-preview">
        ${(habitsState?.items || []).slice(0, 8).map(h => {
          const done = h.completed === true;
          return `<span class="habits-preview-dot${done ? ' habits-preview-dot--done' : ''}" aria-hidden="true">${h.emoji}</span>`;
        }).join('')}
        ${total > 8 ? `<span class="habits-preview-more">+${total - 8}</span>` : ''}
      </div>

      <div class="habits-tile-progress">
        <p class="habits-tile-note">${progressMeta.headline}</p>
        <div class="habits-tile-stats">
          ${progressMeta.stats.map(stat => `<span class="habits-tile-stat">${stat}</span>`).join('')}
        </div>
        ${progressMeta.streakNote
          ? `<p class="habits-tile-streak-note">${progressMeta.streakNote}</p>`
          : ''}
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

function renderView(user, state, returnMsg, weather, recommendations, weekSummary, reminderDecision, weatherBriefing, hasBriefing) {
  const firstName = user.displayName?.split(' ')[0] || 'there';

  return `
    <main class="view-scroll">
      <div class="view-inner">

<header class="page-header">
  <p class="eyebrow">Grounded</p>
  <div class="header-row">
    <div>
      <h1 class="page-title">Welcome, ${firstName}</h1>
      <p class="page-subtitle">${getTodayDisplay()}</p>
    </div>
    ${user.photoURL ? `<img src="${user.photoURL}" alt="${user.displayName || 'Profile'}" class="avatar" />` : ''}
  </div>
</header>

<p class="today-summary" id="todaySummary">
  ${getTodaySummary(state)}
</p>

        ${renderReturnCard(returnMsg)}
        ${renderWeatherBriefingBanner(weatherBriefing)}
        ${renderReminderBanner(reminderDecision)}
        ${renderPriorityActions(recommendations, state)}
        ${renderWeatherCard(weather, hasBriefing)}
        ${renderQuickCheckin(state.wellness.mood || '', state.wellness.energy || '')}

        <div class="card-stack">
          ${renderWorkoutTile(state.workout, state)}
          ${renderHabitsTile(state.habits, weekSummary)}
          ${renderNourishmentCard(state.wellness.energy || '')}
        </div>

        <p id="wellnessStatus" class="status-text mt-4 px-1"></p>

      </div>
    </main>
  `;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export const TodayView = {
  async init(container, user) {
    container.innerHTML = '<div class="loading-state"><p>Loading your dashboard…</p></div>';

    const [state, weather, weekSummary, notifData] = await Promise.all([
      getDailyState(user.uid),
      fetchWeather().catch(() => null),
      getWeekSummary(user.uid).catch(() => null),
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
        const yesterday  = getYesterdaySnapshot();
        const comparison = compareWeather(weather, yesterday);
        const built      = buildWeatherBriefingMessage(comparison, weather);
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

    const viewState = {
      ...state,
      wellness: { ...state.wellness },
      habits:   { ...state.habits },
    };

    let habitsWeekSummary = weekSummary;

    function getRecommendations() {
      return getTodayRecommendations(viewState);
    }

    container.innerHTML = renderView(
      user,
      viewState,
      returnMsg,
      weather,
      getRecommendations(),
      habitsWeekSummary,
      reminderDecision,
      autoShowBriefing,
      !!_sessionWeatherBriefing,
    );

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
          existing.classList.add('reminder-banner--dismissing'); // reuse animation class for a pulse
          setTimeout(() => existing.classList.remove('reminder-banner--dismissing'), 300);
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
      fresh.innerHTML = renderPriorityActions(getRecommendations(), viewState);
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
      fresh.innerHTML = renderHabitsTile(viewState.habits, habitsWeekSummary);
      const next = fresh.firstElementChild;

      if (next) {
        tile.replaceWith(next);
        bindStaticTiles();
      }
    }

    function rebuildNourishmentCard() {
      const card = document.getElementById('nourishmentCard');
      if (!card) return;
      const fresh = document.createElement('div');
      fresh.innerHTML = renderNourishmentCard(wellnessState.energy);
      card.replaceWith(fresh.firstElementChild);
    }

    function rebuildSummary() {
      const summary = document.getElementById('todaySummary');
      if (!summary) return;
      summary.textContent = getTodaySummary(viewState);
    }

    async function refreshHabitsStateFromSource() {
      const seq = ++habitsRefreshSeq;

      try {
        const freshState       = await getDailyState(user.uid);
        const freshWeekSummary = await getWeekSummary(user.uid);

        if (seq !== habitsRefreshSeq) return;

        viewState.habits  = freshState.habits;
        habitsWeekSummary = freshWeekSummary;

        if (freshState.habits?.completedCount > 0) {
          recordMeaningfulEngagement(user.uid).catch(() => {});
        }

        const mergedState = { ...viewState, habits: freshState.habits };
        hideReminderBannerIfDone(mergedState);

        rebuildHabitsTile();
        rebuildSummary();
        rebuildPriorityActions();
      } catch {
        // fail silently for cross-view refresh
      }
    }

    function refreshTodayUI(options = {}) {
      const {
        qci           = true,
        summary       = true,
        priorityActions = true,
        nourishment   = true,
        workout       = true,
        habits        = true
      } = options;

      if (qci)             rebuildQci();
      if (summary)         rebuildSummary();
      if (priorityActions) rebuildPriorityActions();
      if (nourishment)     rebuildNourishmentCard();
      if (workout)         rebuildWorkoutTile();
      if (habits)          rebuildHabitsTile();
    }

    function showQciTick() {
      const qci = document.getElementById('quickCheckin');
      if (!qci) return;
      qci.classList.add('qci-card--saved');
      setTimeout(() => qci.classList.remove('qci-card--saved'), 900);
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

          try {
            await saveTodayWellnessCheckin(user.uid, wellnessState);

            if (wellnessState.mood && wellnessState.energy) {
              recordMeaningfulEngagement(user.uid).catch(() => {});

              const mergedState = { ...viewState, wellness: { ...wellnessState } };
              hideReminderBannerIfDone(mergedState);

              showQciTick();
              setTimeout(() => refreshTodayUI(), 700);
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

        const fresh = document.createElement('div');
        fresh.innerHTML = renderQuickCheckin('', '');
        qci.replaceWith(fresh.firstElementChild);

        bindQci();
        refreshTodayUI({
          qci:            false,
          summary:        true,
          priorityActions: true,
          nourishment:    true,
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
    bindQci();
    bindReminderBanner();
    bindWeatherBriefingBanner();
    bindViewBriefingButton();

    container._groundedCleanup = () => {
      window.removeEventListener('grounded:habits-updated', handleHabitsUpdated);
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
