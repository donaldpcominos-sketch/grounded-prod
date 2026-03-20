import { getTodayWellnessCheckin, saveTodayWellnessCheckin } from '../services/wellness.js';
import { getTodayJournalEntry } from '../services/journal.js';
import { touchLastActive, getLastActiveGap } from '../services/lastSeen.js';
import { getTodayNutritionLog, saveTodayNutritionLog } from '../services/nutrition.js';
import { getSuggestionsForEnergy } from '../data/nutrition.js';
import { getTodayDisplay, showToast } from '../utils.js';
import { fetchWeather } from '../services/weather.js';
import { WEEKLY_SPLIT } from '../data/workouts.js';
import { getTodayWorkoutSession } from '../services/workouts.js';
import { getHabitLog, HABITS } from '../services/habits.js';
import { navigateTo } from '../router.js';

// ─── Weather card ─────────────────────────────────────────────────────────────

function uvBadgeClass(uv) {
  if (uv >= 8) return 'weather-uv-badge weather-uv-badge--extreme';
  if (uv >= 4) return 'weather-uv-badge weather-uv-badge--high';
  return 'weather-uv-badge';
}

function renderWeatherCard(weather) {
  if (!weather) {
    return `
      <div class="weather-card" id="weatherCard">
        <p class="card-label">Weather</p>
        <p class="card-body mt-1" style="color:var(--color-ink-4);">Unavailable \u2014 check your connection.</p>
      </div>
    `;
  }

  const { currentTemp, currentEmoji, currentDesc, currentUv, forecast, walkWindow, fromCache, cacheAgeMs } = weather;

  const staleNote = fromCache
    ? `<p class="weather-stale-note">Offline \u2014 last updated ${Math.round(cacheAgeMs / 60000)} min ago</p>`
    : '';

  const forecastHtml = (forecast || []).map(d => `
    <div class="weather-forecast-day">
      <p class="forecast-label">${d.label}</p>
      <p class="forecast-emoji">${d.emoji}</p>
      <p class="forecast-temps">${d.high}&deg; <span>${d.low}&deg;</span></p>
    </div>
  `).join('');

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
    </div>
  `;
}

// ─── Return message ───────────────────────────────────────────────────────────

function getReturnMessage(gapHours) {
  if (gapHours <= 48) return null;
  if (gapHours > 7 * 24) return { headline: `You've been away for a while.`, sub: `This is your space. Take your time \u2014 no catch-up needed.` };
  if (gapHours > 3 * 24) return { headline: `It's been a few days.`, sub: `Welcome back. No pressure \u2014 just checking in when you're ready.` };
  return { headline: `Good to see you again.`, sub: `It's been a couple of days. Start wherever feels right.` };
}

// ─── Quick check-in ───────────────────────────────────────────────────────────
// Redesigned: large emoji-button grid, no text labels, much warmer feel

const MOOD_OPTIONS = [
  { value: 'calm',      emoji: '🌿', label: 'Calm'      },
  { value: 'good',      emoji: '✨', label: 'Good'      },
  { value: 'flat',      emoji: '😶', label: 'Flat'      },
  { value: 'stretched', emoji: '🌊', label: 'Stretched' }
];

const ENERGY_OPTIONS = [
  { value: 'low',    emoji: '🌙', label: 'Low'    },
  { value: 'medium', emoji: '☀️', label: 'Medium' },
  { value: 'high',   emoji: '⚡', label: 'High'   }
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

// ─── Nutrition card ───────────────────────────────────────────────────────────

function energyEmoji(energy) {
  return { low: '🌙', medium: '☀️', high: '⚡' }[energy] || '';
}

function renderNutritionCard(energy, nutritionLog) {
  const suggestions = getSuggestionsForEnergy(energy || 'medium', 3);
  const { nourished, note } = nutritionLog;

  const energyLabel = energy
    ? `${energyEmoji(energy)} ${energy.charAt(0).toUpperCase() + energy.slice(1)} energy`
    : 'Today';

  return `
    <div class="card nutrition-card" id="nutritionCard">
      <div class="card-row">
        <div>
          <p class="card-label">Nourishment</p>
          <p class="card-body mt-1">Gentle nudges, not tracking.</p>
        </div>
        <span class="badge nutrition-badge">${energyLabel}</span>
      </div>

      <div class="nutrition-suggestions mt-4">
        ${suggestions.map(s => `
          <div class="nutrition-suggestion">
            <p class="nutrition-suggestion-label">${s.label}</p>
            <p class="nutrition-suggestion-desc">${s.desc}</p>
          </div>
        `).join('')}
      </div>

      <div class="nutrition-actions mt-4">
        <button
          type="button"
          id="nourishedToggleBtn"
          class="nutrition-toggle${nourished ? ' nutrition-toggle--done' : ''}"
          aria-pressed="${nourished}"
        >
          ${nourished ? '\u2713 Nourished well today' : 'I nourished well today'}
        </button>
      </div>

      <input
        type="text"
        id="nutritionNoteInput"
        class="nutrition-note-input mt-3"
        placeholder="What did you eat? (optional)"
        value="${note ? note.replace(/"/g, '&quot;') : ''}"
        maxlength="120"
      />
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

function renderWorkoutTile(savedSession) {
  const today = new Date().getDay();
  const split = WEEKLY_SPLIT[today];
  if (!split) return '';

  const isDone = savedSession?.status === 'complete';
  const isAlternate = savedSession?.type === 'alternate';

  let statusLine = '';
  if (isDone && isAlternate) {
    statusLine = `<span class="workout-tile-done workout-tile-done--alt">\u2713 ${savedSession.alternateLabel || 'Activity'} done</span>`;
  } else if (isDone) {
    statusLine = `<span class="workout-tile-done">\u2713 Done today</span>`;
  }

  return `
    <button class="workout-tile" id="workoutTileBtn" aria-label="Go to workouts">
      <div class="workout-tile-left">
        <p class="workout-tile-eyebrow">Today&#39;s workout</p>
        <p class="workout-tile-label">${split.label}</p>
        <p class="workout-tile-focus">${split.focus}</p>
      </div>
      <div class="workout-tile-right">
        <span class="tag ${getTypeColor(split.type)}">${getTypeTag(split.type)}</span>
        ${statusLine}
        <span class="workout-tile-arrow">\u2192</span>
      </div>
    </button>
  `;
}

// ─── Habits entry tile ────────────────────────────────────────────────────────

function renderHabitsTile(todayHabits) {
  const doneCount = HABITS.filter(h => todayHabits[h.id] === true).length;
  const total     = HABITS.length;
  const allDone   = doneCount === total;
  const pct       = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const previewHabits = HABITS.slice(0, 5);

  return `
    <button class="habits-entry-tile" id="habitsTileBtn" aria-label="Open habits tracker">
      <div class="habits-tile-top">
        <div>
          <p class="habits-tile-eyebrow">Daily habits</p>
          <p class="habits-tile-count">${doneCount} <span>of ${total}</span></p>
        </div>
        <div class="habits-tile-right">
          <div class="habits-tile-ring">
            <svg viewBox="0 0 36 36" class="habits-ring-svg">
              <circle class="habits-ring-bg" cx="18" cy="18" r="14"/>
              <circle class="habits-ring-fill" cx="18" cy="18" r="14"
                stroke-dasharray="${(pct * 0.879).toFixed(1)} 100"
                stroke="${allDone ? '#5a7a5a' : 'var(--color-ink-2)'}"/>
            </svg>
            ${allDone
              ? '<span class="habits-ring-check">\u2713</span>'
              : `<span class="habits-ring-pct">${pct}%</span>`}
          </div>
          <span class="workout-tile-arrow">\u2192</span>
        </div>
      </div>
      <div class="habits-tile-preview">
        ${previewHabits.map(h => {
          const done = todayHabits[h.id] === true;
          return `<span class="habits-preview-dot${done ? ' habits-preview-dot--done' : ''}" style="--habit-color:${h.color}" aria-hidden="true">${h.emoji}</span>`;
        }).join('')}
        ${total > 5 ? `<span class="habits-preview-more">+${total - 5}</span>` : ''}
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
        <button class="return-card-dismiss" id="returnCardDismiss" aria-label="Dismiss">\u2715</button>
      </div>
    </div>
  `;
}

function renderView(user, wellness, returnMsg, nutritionLog, weather, savedSession, todayHabits) {
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

        ${renderReturnCard(returnMsg)}
        ${renderWeatherCard(weather)}
        ${renderQuickCheckin(wellness.mood || '', wellness.energy || '')}

        <div class="card-stack">
          ${renderWorkoutTile(savedSession)}
          ${renderHabitsTile(todayHabits)}
          ${renderNutritionCard(wellness.energy || '', nutritionLog)}
        </div>

        <p id="wellnessStatus" class="status-text mt-4 px-1"></p>

      </div>
    </main>
  `;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export const TodayView = {
  async init(container, user) {
    container.innerHTML = '<div class="loading-state"><p>Loading your dashboard\u2026</p></div>';

    const { getTodayKey } = await import('../utils.js');
    const todayKey = getTodayKey();

    const [wellness, , { gapHours }, nutritionLog, weather, savedSession, todayHabits] = await Promise.all([
      getTodayWellnessCheckin(user.uid),
      getTodayJournalEntry(user.uid),
      getLastActiveGap(user.uid),
      getTodayNutritionLog(user.uid),
      fetchWeather().catch(() => null),
      getTodayWorkoutSession(user.uid).catch(() => null),
      getHabitLog(user.uid, todayKey).catch(() => ({}))
    ]);

    touchLastActive(user.uid);

    const returnMsg = _returnDismissed ? null : getReturnMessage(gapHours);

    container.innerHTML = renderView(user, wellness, returnMsg, nutritionLog, weather, savedSession, todayHabits);

    const wellnessState = {
      mood:   wellness.mood   || '',
      energy: wellness.energy || ''
    };

    const nutritionState = {
      nourished: nutritionLog.nourished || false,
      note:      nutritionLog.note      || ''
    };

    const wellnessStatusEl = document.getElementById('wellnessStatus');

    // ── Return card ──
    document.getElementById('returnCardDismiss')?.addEventListener('click', () => {
      _returnDismissed = true;
      const card = document.getElementById('returnCard');
      if (card) {
        card.classList.add('return-card--dismissing');
        setTimeout(() => card.remove(), 350);
      }
    });

    // ── Workout tile ──
    document.getElementById('workoutTileBtn')?.addEventListener('click', () => {
      navigateTo('workouts');
    });

    // ── Habits tile ──
    document.getElementById('habitsTileBtn')?.addEventListener('click', () => {
      navigateTo('habits');
    });

    // ── Quick check-in ──
    function rebuildQci() {
      const qci = document.getElementById('quickCheckin');
      if (!qci) return;
      const fresh = document.createElement('div');
      fresh.innerHTML = renderQuickCheckin(wellnessState.mood, wellnessState.energy);
      qci.replaceWith(fresh.firstElementChild);
      bindQci();
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
          wellnessState[group] = val;

          document.querySelectorAll(`[data-qci-group="${group}"]`).forEach(b => {
            b.classList.toggle('qci-btn--selected', b.dataset.value === val);
            b.setAttribute('aria-pressed', b.dataset.value === val);
          });

          try {
            await saveTodayWellnessCheckin(user.uid, wellnessState);
            if (wellnessState.mood && wellnessState.energy) {
              showQciTick();
              setTimeout(() => {
                rebuildQci();
                rebuildNutritionCard();
              }, 700);
            }
          } catch {
            showToast('Save failed \u2014 try again', 'error');
          }
        });
      });

      document.getElementById('qciEditBtn')?.addEventListener('click', () => {
        const qci = document.getElementById('quickCheckin');
        if (!qci) return;
        const fresh = document.createElement('div');
        fresh.innerHTML = renderQuickCheckin('', '');
        qci.replaceWith(fresh.firstElementChild);
        bindQci();
      });
    }

    bindQci();

    // ── Nutrition card ──
    function rebuildNutritionCard() {
      const card = document.getElementById('nutritionCard');
      if (!card) return;
      const fresh = document.createElement('div');
      fresh.innerHTML = renderNutritionCard(wellnessState.energy, nutritionState);
      card.replaceWith(fresh.firstElementChild);
      bindNutrition();
    }

    function bindNutrition() {
      const toggleBtn = document.getElementById('nourishedToggleBtn');
      const noteInput = document.getElementById('nutritionNoteInput');
      if (!toggleBtn || !noteInput) return;

      toggleBtn.addEventListener('click', async () => {
        nutritionState.nourished = !nutritionState.nourished;
        toggleBtn.classList.toggle('nutrition-toggle--done', nutritionState.nourished);
        toggleBtn.setAttribute('aria-pressed', String(nutritionState.nourished));
        toggleBtn.textContent = nutritionState.nourished ? '\u2713 Nourished well today' : 'I nourished well today';

        try {
          await saveTodayNutritionLog(user.uid, { nourished: nutritionState.nourished });
          if (nutritionState.nourished) showToast('Noted \u2014 well done \uD83C\uDF3F', 'success', 1800);
        } catch {
          nutritionState.nourished = !nutritionState.nourished;
          toggleBtn.classList.toggle('nutrition-toggle--done', nutritionState.nourished);
          toggleBtn.setAttribute('aria-pressed', String(nutritionState.nourished));
          toggleBtn.textContent = nutritionState.nourished ? '\u2713 Nourished well today' : 'I nourished well today';
          showToast('Save failed \u2014 try again', 'error');
        }
      });

      let _noteDebounce = null;
      noteInput.addEventListener('input', () => {
        nutritionState.note = noteInput.value;
        clearTimeout(_noteDebounce);
        _noteDebounce = setTimeout(async () => {
          try { await saveTodayNutritionLog(user.uid, { note: nutritionState.note }); }
          catch { showToast('Note save failed \u2014 try again', 'error'); }
        }, 800);
      });
      noteInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); noteInput.blur(); }
      });
    }

    bindNutrition();
  }
};

let _returnDismissed = false;
