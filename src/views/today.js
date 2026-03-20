import { getTodayWellnessCheckin, saveTodayWellnessCheckin } from '../services/wellness.js';
import { getTodayJournalEntry } from '../services/journal.js';
import { touchLastActive, getLastActiveGap } from '../services/lastSeen.js';
import { getTodayNutritionLog, saveTodayNutritionLog } from '../services/nutrition.js';
import { getSuggestionsForEnergy } from '../data/nutrition.js';
import { getTodayDisplay, showToast } from '../utils.js';
import { fetchWeather } from '../services/weather.js';
import { WEEKLY_SPLIT } from '../data/workouts.js';
import { getTodayWorkoutSession } from '../services/workouts.js';
import { getHabitLog, computeStreaks, HABITS } from '../services/habits.js';
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

      <div class="weather-forecast">
        ${forecastHtml}
      </div>

      ${staleNote}
    </div>
  `;
}

// ─── Return message ───────────────────────────────────────────────────────────

function getReturnMessage(gapHours) {
  if (gapHours <= 48) return null;
  if (gapHours > 7 * 24) return { headline: `You've been away for a while.`, sub: `This is your space. Take your time — no catch-up needed.` };
  if (gapHours > 3 * 24) return { headline: `It's been a few days.`, sub: `Welcome back. No pressure — just checking in when you're ready.` };
  return { headline: `Good to see you again.`, sub: `It's been a couple of days. Start wherever feels right.` };
}

// ─── Quick check-in widget ────────────────────────────────────────────────────

const MOOD_OPTIONS   = [
  { value: 'calm',      label: 'Calm' },
  { value: 'flat',      label: 'Flat' },
  { value: 'good',      label: 'Good' },
  { value: 'stretched', label: 'Stretched' }
];

const ENERGY_OPTIONS = [
  { value: 'low',    label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high',   label: 'High' }
];

function moodEmoji(mood) {
  return { calm: '🌿', flat: '😶', good: '✨', stretched: '🌊' }[mood] || '';
}

function energyEmoji(energy) {
  return { low: '🌙', medium: '☀️', high: '⚡' }[energy] || '';
}

function renderQuickCheckin(mood, energy) {
  const bothSet = mood && energy;

  if (bothSet) {
    return `
      <div class="qci-card qci-card--summary" id="quickCheckin">
        <div class="qci-summary-row">
          <div class="qci-summary-values">
            <span class="qci-summary-item">${moodEmoji(mood)} <span class="qci-summary-label">${mood.charAt(0).toUpperCase() + mood.slice(1)}</span></span>
            <span class="qci-summary-sep">·</span>
            <span class="qci-summary-item">${energyEmoji(energy)} <span class="qci-summary-label">${energy.charAt(0).toUpperCase() + energy.slice(1)} energy</span></span>
          </div>
          <button class="qci-edit-btn" id="qciEditBtn" aria-label="Edit check-in">Edit</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="qci-card" id="quickCheckin">
      <p class="qci-heading">Quick check-in</p>

      <div class="qci-section">
        <p class="qci-label">Mood</p>
        <div class="qci-pills" role="group" aria-label="Mood">
          ${MOOD_OPTIONS.map(o => `
            <button type="button" class="qci-pill${mood === o.value ? ' qci-pill--selected' : ''}"
              data-qci-group="mood" data-value="${o.value}">${o.label}</button>
          `).join('')}
        </div>
      </div>

      <div class="qci-section qci-section--energy">
        <p class="qci-label">Energy</p>
        <div class="qci-pills" role="group" aria-label="Energy">
          ${ENERGY_OPTIONS.map(o => `
            <button type="button" class="qci-pill${energy === o.value ? ' qci-pill--selected' : ''}"
              data-qci-group="energy" data-value="${o.value}">${o.label}</button>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

// ─── Nutrition card ───────────────────────────────────────────────────────────

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
          ${nourished ? '✓ Nourished well today' : 'I nourished well today'}
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
    statusLine = `<span class="workout-tile-done workout-tile-done--alt">✓ ${savedSession.alternateLabel || 'Activity'} done</span>`;
  } else if (isDone) {
    statusLine = `<span class="workout-tile-done">✓ Done today</span>`;
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
        <span class="workout-tile-arrow">→</span>
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
          <div class="habits-tile-ring" style="--pct: ${pct}">
            <svg viewBox="0 0 36 36" class="habits-ring-svg">
              <circle class="habits-ring-bg" cx="18" cy="18" r="14"/>
              <circle class="habits-ring-fill" cx="18" cy="18" r="14"
                stroke-dasharray="${pct * 0.879} 100"
                stroke="${allDone ? '#5a7a5a' : 'var(--color-ink-2)'}"/>
            </svg>
            ${allDone ? `<span class="habits-ring-check">✓</span>` : `<span class="habits-ring-pct">${pct}%</span>`}
          </div>
          <span class="workout-tile-arrow">→</span>
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
        <button class="return-card-dismiss" id="returnCardDismiss" aria-label="Dismiss">✕</button>
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
            ${user.photoURL ? `
              <img src="${user.photoURL}" alt="${user.displayName || 'Profile'}" class="avatar" />
            ` : ''}
          </div>
        </header>

        ${renderReturnCard(returnMsg)}

        ${renderWeatherCard(weather)}

        ${renderQuickCheckin(wellness.mood || '', wellness.energy || '')}

        <div class="card-stack">

          ${renderWorkoutTile(savedSession)}

          ${renderHabitsTile(todayHabits)}

          ${renderNutritionCard(wellness.energy || '', nutritionLog)}

          <!-- Hydration -->
          <div class="card">
            <div class="card-row">
              <div>
                <p class="card-label">Hydration</p>
                <p class="card-body">Glasses of water today.</p>
              </div>
              <div class="stat-block">
                <p id="hydrationCount" class="stat-number">${wellness.hydrationGlasses || 0}</p>
                <p class="stat-unit">glasses</p>
              </div>
            </div>
            <div class="btn-row mt-4">
              <button id="decreaseHydrationBtn" class="btn-secondary flex-1">− Remove</button>
              <button id="increaseHydrationBtn" class="btn-primary flex-1">+ Add glass</button>
            </div>
          </div>

        </div>

        <p id="wellnessStatus" class="status-text mt-4 px-1"></p>

      </div>
    </main>
  `;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export const TodayView = {
  async init(container, user) {
    container.innerHTML = `<div class="loading-state"><p>Loading your dashboard…</p></div>`;

    const { getTodayKey } = await import('../utils.js');
    const todayKey = getTodayKey();

    const [wellness, , { gapHours }, nutritionLog, weather, savedSession, todayHabits] = await Promise.all([
      getTodayWellnessCheckin(user.uid),
      getTodayJournalEntry(user.uid),   // kept for completeness — unused on Today now
      getLastActiveGap(user.uid),
      getTodayNutritionLog(user.uid),
      fetchWeather().catch(() => null),
      getTodayWorkoutSession(user.uid).catch(() => null),
      getHabitLog(user.uid, todayKey).catch(() => ({}))
    ]);

    touchLastActive(user.uid);

    const returnMsg = _returnDismissed ? null : getReturnMessage(gapHours);

    container.innerHTML = renderView(user, wellness, returnMsg, nutritionLog, weather, savedSession, todayHabits);

    // ── State ──
    const wellnessState = {
      hydrationGlasses: wellness.hydrationGlasses || 0,
      mood:   wellness.mood   || '',
      energy: wellness.energy || ''
    };

    const nutritionState = {
      nourished: nutritionLog.nourished || false,
      note:      nutritionLog.note      || ''
    };

    const hydrationCountEl = document.getElementById('hydrationCount');
    const wellnessStatusEl = document.getElementById('wellnessStatus');

    // ── Return card dismiss ──
    document.getElementById('returnCardDismiss')?.addEventListener('click', () => {
      _returnDismissed = true;
      const card = document.getElementById('returnCard');
      if (card) {
        card.classList.add('return-card--dismissing');
        setTimeout(() => card.remove(), 350);
      }
    });

    // ── Workout tile → navigate to workouts ──
    document.getElementById('workoutTileBtn')?.addEventListener('click', () => {
      navigateTo('workouts');
    });

    // ── Habits tile → navigate to habits ──
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
            b.classList.toggle('qci-pill--selected', b.dataset.value === val);
          });

          try {
            await saveTodayWellnessCheckin(user.uid, wellnessState);
            if (wellnessState.mood && wellnessState.energy) {
              showQciTick();
              setTimeout(() => { rebuildQci(); rebuildNutritionCard(); }, 700);
            }
          } catch {
            showToast('Save failed — try again', 'error');
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
        toggleBtn.setAttribute('aria-pressed', nutritionState.nourished);
        toggleBtn.textContent = nutritionState.nourished ? '✓ Nourished well today' : 'I nourished well today';

        try {
          await saveTodayNutritionLog(user.uid, { nourished: nutritionState.nourished });
          if (nutritionState.nourished) showToast('Noted — well done 🌿', 'success', 1800);
        } catch {
          nutritionState.nourished = !nutritionState.nourished;
          toggleBtn.classList.toggle('nutrition-toggle--done', nutritionState.nourished);
          toggleBtn.setAttribute('aria-pressed', nutritionState.nourished);
          toggleBtn.textContent = nutritionState.nourished ? '✓ Nourished well today' : 'I nourished well today';
          showToast('Save failed — try again', 'error');
        }
      });

      let _noteDebounce = null;
      noteInput.addEventListener('input', () => {
        nutritionState.note = noteInput.value;
        clearTimeout(_noteDebounce);
        _noteDebounce = setTimeout(async () => {
          try { await saveTodayNutritionLog(user.uid, { note: nutritionState.note }); }
          catch { showToast('Note save failed — try again', 'error'); }
        }, 800);
      });

      noteInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); noteInput.blur(); }
      });
    }

    bindNutrition();

    // ── Wellness persistence ──
    async function persistWellness() {
      try {
        await saveTodayWellnessCheckin(user.uid, wellnessState);
        showToast('Saved', 'success', 1600);
      } catch {
        showToast('Save failed — tap to retry', 'error');
        wellnessStatusEl.textContent = '';
      }
    }

    // ── Hydration ──
    document.getElementById('increaseHydrationBtn').addEventListener('click', async () => {
      wellnessState.hydrationGlasses += 1;
      hydrationCountEl.textContent = wellnessState.hydrationGlasses;
      await persistWellness();
    });

    document.getElementById('decreaseHydrationBtn').addEventListener('click', async () => {
      wellnessState.hydrationGlasses = Math.max(0, wellnessState.hydrationGlasses - 1);
      hydrationCountEl.textContent = wellnessState.hydrationGlasses;
      await persistWellness();
    });
  }
};

let _returnDismissed = false;
