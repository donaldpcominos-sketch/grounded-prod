import { HABITS, getHabitLog, getHabitLogsRange, toggleHabit, computeStreaks, buildCalendarDays, getDateKey, getNWeeksAgoKey } from '../services/habits.js';
import { getTodayKey, showToast } from '../utils.js';
import { navigateTo } from '../router.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDisplayDate(dateKey) {
  const d = new Date(dateKey + 'T12:00:00');
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatShortDate(dateKey) {
  const d = new Date(dateKey + 'T12:00:00');
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

// ─── Render: habit toggle pills ───────────────────────────────────────────────

function renderHabitPills(habits, activeDate, isToday) {
  const dateLabel = isToday ? 'Today' : formatShortDate(activeDate);
  return `
    <div class="habits-pills-section">
      <div class="habits-pills-header">
        <p class="habits-pills-date">${dateLabel}</p>
        ${!isToday ? `<p class="habits-pills-hint">Logging for a past day</p>` : ''}
      </div>
      <div class="habits-pills-list">
        ${HABITS.map(h => {
          const done = habits[h.id] === true;
          return `
            <button
              class="habit-pill${done ? ' habit-pill--done' : ''}"
              data-habit-id="${h.id}"
              style="--habit-color: ${h.color}"
              aria-pressed="${done}"
              aria-label="${h.label}"
            >
              <span class="habit-pill-emoji">${h.emoji}</span>
              <span class="habit-pill-label">${h.label}</span>
              <span class="habit-pill-check">${done ? '✓' : ''}</span>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ─── Render: 4-week dot calendar ──────────────────────────────────────────────

function renderCalendar(calendarDays, logsMap, activeDate, todayKey) {
  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return `
    <div class="habits-calendar-section">
      <div class="habits-calendar-header">
        <p class="habits-section-label">Last 4 weeks</p>
        <p class="habits-calendar-hint">Tap a day to log</p>
      </div>

      <div class="habits-cal-day-labels">
        ${DAY_LABELS.map(l => `<p class="habits-cal-day-label">${l}</p>`).join('')}
      </div>

      <div class="habits-cal-grid">
        ${calendarDays.map(day => {
          const habits = logsMap[day.dateKey] || {};
          const totalDone = HABITS.filter(h => habits[h.id] === true).length;
          const total = HABITS.length;
          const pct = total > 0 ? totalDone / total : 0;
          const isActive = day.dateKey === activeDate;
          const isFuture = day.isFuture;

          // Fill level class
          let fillClass = 'cal-dot--empty';
          if (!isFuture) {
            if (pct >= 0.8) fillClass = 'cal-dot--full';
            else if (pct >= 0.5) fillClass = 'cal-dot--high';
            else if (pct >= 0.2) fillClass = 'cal-dot--mid';
            else if (pct > 0) fillClass = 'cal-dot--low';
          }

          return `
            <button
              class="cal-dot ${fillClass}${isActive ? ' cal-dot--active' : ''}${day.isToday ? ' cal-dot--today' : ''}${isFuture ? ' cal-dot--future' : ''}"
              data-cal-date="${day.dateKey}"
              aria-label="${formatDisplayDate(day.dateKey)}: ${totalDone} of ${total} habits"
              ${isFuture ? 'disabled' : ''}
            >
              <span class="cal-dot-day">${day.dayOfMonth}</span>
            </button>
          `;
        }).join('')}
      </div>

      <div class="habits-cal-legend">
        <div class="cal-legend-item"><div class="cal-legend-dot cal-dot--empty"></div><p>None</p></div>
        <div class="cal-legend-item"><div class="cal-legend-dot cal-dot--low"></div><p>Some</p></div>
        <div class="cal-legend-item"><div class="cal-legend-dot cal-dot--mid"></div><p>Half</p></div>
        <div class="cal-legend-item"><div class="cal-legend-dot cal-dot--high"></div><p>Most</p></div>
        <div class="cal-legend-item"><div class="cal-legend-dot cal-dot--full"></div><p>All</p></div>
      </div>
    </div>
  `;
}

// ─── Render: streaks ──────────────────────────────────────────────────────────

function renderStreaks(streaks) {
  return `
    <div class="habits-streaks-section">
      <p class="habits-section-label">Streaks</p>
      <div class="habits-streaks-list">
        ${HABITS.map(h => {
          const streak = streaks[h.id] || 0;
          return `
            <div class="habit-streak-row">
              <span class="habit-streak-emoji">${h.emoji}</span>
              <span class="habit-streak-label">${h.label}</span>
              <div class="habit-streak-badge${streak > 0 ? ' habit-streak-badge--active' : ''}">
                ${streak > 0 ? `<span class="streak-flame">🔥</span><span class="streak-num">${streak}</span>` : `<span class="streak-zero">—</span>`}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ─── Render: full view ────────────────────────────────────────────────────────

function renderView(todayHabits, logsMap, streaks, calendarDays, activeDate, todayKey) {
  const isToday = activeDate === todayKey;
  return `
    <main class="view-scroll">
      <div class="view-inner">

        <header class="page-header">
          <p class="eyebrow">Grounded</p>
          <div class="header-row">
            <div>
              <h1 class="page-title">Habits</h1>
              <p class="page-subtitle">${formatDisplayDate(todayKey)}</p>
            </div>
            <button class="habits-back-btn" id="habitsBackBtn" aria-label="Back to today">
              ← Today
            </button>
          </div>
        </header>

        ${renderHabitPills(todayHabits, activeDate, isToday)}
        ${renderCalendar(calendarDays, logsMap, activeDate, todayKey)}
        ${renderStreaks(streaks)}

      </div>
    </main>
  `;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export const HabitsView = {
  async init(container, user) {
    container.innerHTML = `<div class="loading-state"><p>Loading habits…</p></div>`;

    const todayKey = getTodayKey();
    const startKey = getNWeeksAgoKey(4);

    const [todayHabits, logsMap] = await Promise.all([
      getHabitLog(user.uid, todayKey),
      getHabitLogsRange(user.uid, startKey, todayKey)
    ]);

    // Ensure today is in the map
    logsMap[todayKey] = todayHabits;

    const streaks    = computeStreaks(logsMap, todayKey);
    const calDays    = buildCalendarDays(todayKey);

    // ── Module-level state ──
    let activeDate    = todayKey;
    let activeHabits  = { ...todayHabits };
    let currentLogs   = { ...logsMap };
    let currentStreaks = { ...streaks };

    function rebuild() {
      const isToday = activeDate === todayKey;
      container.innerHTML = renderView(activeHabits, currentLogs, currentStreaks, calDays, activeDate, todayKey);
      bindEvents();
    }

    function bindEvents() {

      // ── Back button ──
      document.getElementById('habitsBackBtn')?.addEventListener('click', () => {
        navigateTo('today');
      });

      // ── Habit pill toggles ──
      document.querySelectorAll('[data-habit-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const habitId = btn.dataset.habitId;
          const current = activeHabits[habitId] === true;
          const newVal  = !current;

          // Optimistic update
          activeHabits[habitId] = newVal;
          currentLogs[activeDate] = { ...(currentLogs[activeDate] || {}), [habitId]: newVal };
          currentStreaks = computeStreaks(currentLogs, todayKey);
          rebuild();

          try {
            await toggleHabit(user.uid, activeDate, habitId, newVal);
          } catch {
            // Rollback
            activeHabits[habitId] = current;
            currentLogs[activeDate][habitId] = current;
            currentStreaks = computeStreaks(currentLogs, todayKey);
            rebuild();
            showToast('Save failed — try again', 'error');
          }
        });
      });

      // ── Calendar day taps ──
      document.querySelectorAll('[data-cal-date]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const dateKey = btn.dataset.calDate;
          if (dateKey === activeDate) return;

          activeDate = dateKey;

          // Load that day's log if we don't have it yet
          if (!currentLogs[dateKey]) {
            try {
              const log = await getHabitLog(user.uid, dateKey);
              currentLogs[dateKey] = log;
            } catch {
              currentLogs[dateKey] = {};
            }
          }

          activeHabits = { ...(currentLogs[dateKey] || {}) };
          rebuild();

          // Scroll pills into view
          setTimeout(() => {
            document.querySelector('.habits-pills-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 60);
        });
      });
    }

    rebuild();
  }
};
