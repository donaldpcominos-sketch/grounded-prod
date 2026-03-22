import { HABITS, getHabitLog, getHabitLogsRange, toggleHabit, computeStreaks, buildCalendarDays, getNWeeksAgoKey } from '../services/habits.js';
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

function getFillClass(pct, isFuture) {
  if (isFuture) return 'cal-dot--future';
  if (pct === 1)  return 'cal-dot--full';
  if (pct >= 0.7) return 'cal-dot--most';
  if (pct >= 0.4) return 'cal-dot--mid';
  if (pct > 0)    return 'cal-dot--low';
  return 'cal-dot--empty';
}

function getDayDoneCount(logsMap, dateKey) {
  const habits = logsMap[dateKey] || {};
  return HABITS.filter(h => habits[h.id] === true).length;
}

function allTodayHabitsDone(habits) {
  return HABITS.length > 0 && HABITS.every(h => habits[h.id] === true);
}

// ─── Render: habit toggle pills ───────────────────────────────────────────────

function renderHabitPills(habits, activeDate, isToday) {
  const dateLabel = isToday ? 'Today' : formatShortDate(activeDate);
  const allDone   = isToday && allTodayHabitsDone(habits);

  return `
    <div class="habits-pills-section" id="habitsPillsSection">
      <div class="habits-pills-header">
        <div class="habits-pills-header-left">
          <p class="habits-pills-date">${dateLabel}</p>
          ${allDone ? '<span class="habits-crown" aria-label="All habits complete" title="All done!">👑</span>' : ''}
        </div>
        ${!isToday ? '<p class="habits-pills-hint">Logging a past day</p>' : ''}
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
              <span class="habit-pill-check" aria-hidden="true">${done ? '\u2713' : ''}</span>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ─── Render: 4-week dot calendar ──────────────────────────────────────────────

function renderCalendar(calendarDays, logsMap, activeDate) {
  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const total = HABITS.length;

  return `
    <div class="habits-calendar-section">
      <div class="habits-calendar-header">
        <p class="habits-section-label">Last 4 weeks</p>
        <p class="habits-calendar-hint">Tap any day to log</p>
      </div>
      <div class="habits-cal-day-labels">
        ${DAY_LABELS.map(l => `<p class="habits-cal-day-label">${l}</p>`).join('')}
      </div>
      <div class="habits-cal-grid" id="habitsCalGrid">
        ${calendarDays.map(day => {
          const doneCount = getDayDoneCount(logsMap, day.dateKey);
          const pct = total > 0 ? doneCount / total : 0;
          const fillClass = getFillClass(pct, day.isFuture);
          const isActive = day.dateKey === activeDate;
          return `
            <button
              class="cal-dot ${fillClass}${isActive ? ' cal-dot--active' : ''}${day.isToday ? ' cal-dot--today' : ''}"
              data-cal-date="${day.dateKey}"
              aria-label="${formatDisplayDate(day.dateKey)}: ${doneCount} of ${total}"
              ${day.isFuture ? 'disabled' : ''}
            >
              <span class="cal-dot-day">${day.dayOfMonth}</span>
            </button>
          `;
        }).join('')}
      </div>
      <div class="habits-cal-legend">
        <div class="cal-legend-item"><div class="cal-legend-dot cal-dot--empty"></div><span>None</span></div>
        <div class="cal-legend-item"><div class="cal-legend-dot cal-dot--low"></div><span>Some</span></div>
        <div class="cal-legend-item"><div class="cal-legend-dot cal-dot--mid"></div><span>Half</span></div>
        <div class="cal-legend-item"><div class="cal-legend-dot cal-dot--most"></div><span>Most</span></div>
        <div class="cal-legend-item"><div class="cal-legend-dot cal-dot--full"></div><span>All \u2736</span></div>
      </div>
    </div>
  `;
}

// ─── Render: streaks ──────────────────────────────────────────────────────────

function renderStreaks(streaks) {
  return `
    <div class="habits-streaks-section" id="habitsStreaksSection">
      <p class="habits-section-label">Streaks</p>
      <div class="habits-streaks-list">
        ${HABITS.map(h => {
          const streak = streaks[h.id] || 0;
          return `
            <div class="habit-streak-row" data-streak-id="${h.id}">
              <span class="habit-streak-emoji">${h.emoji}</span>
              <span class="habit-streak-label">${h.label}</span>
              <div class="habit-streak-badge${streak > 0 ? ' habit-streak-badge--active' : ''}">
                ${streak > 0
                  ? `<span class="streak-flame">\uD83D\uDD25</span><span class="streak-num">${streak}</span>`
                  : `<span class="streak-zero">\u2014</span>`}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ─── Full view (initial paint only) ──────────────────────────────────────────

function renderView(habits, logsMap, streaks, calendarDays, activeDate, todayKey) {
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
              \u2190 Today
            </button>
          </div>
        </header>
        ${renderHabitPills(habits, activeDate, activeDate === todayKey)}
        ${renderCalendar(calendarDays, logsMap, activeDate)}
        ${renderStreaks(streaks)}
      </div>
    </main>
  `;
}

// ─── Surgical DOM updaters (no scroll jump) ────────────────────────────────────

function patchPill(habitId, done) {
  const btn = document.querySelector(`[data-habit-id="${habitId}"]`);
  if (!btn) return;
  btn.classList.toggle('habit-pill--done', done);
  btn.setAttribute('aria-pressed', String(done));
  const check = btn.querySelector('.habit-pill-check');
  if (check) check.textContent = done ? '\u2713' : '';
}

function patchCrown(habits, activeDate, todayKey) {
  if (activeDate !== todayKey) return;
  const header = document.querySelector('.habits-pills-header-left');
  if (!header) return;

  const existing = header.querySelector('.habits-crown');
  const allDone  = allTodayHabitsDone(habits);

  if (allDone && !existing) {
    const crown = document.createElement('span');
    crown.className = 'habits-crown habits-crown--animate';
    crown.setAttribute('aria-label', 'All habits complete');
    crown.textContent = '\uD83D\uDC51';
    header.appendChild(crown);
  } else if (!allDone && existing) {
    existing.remove();
  }
}

function patchCalDot(dateKey, logsMap) {
  const btn = document.querySelector(`[data-cal-date="${dateKey}"]`);
  if (!btn) return;
  const total = HABITS.length;
  const doneCount = getDayDoneCount(logsMap, dateKey);
  const pct = total > 0 ? doneCount / total : 0;
  const fillClass = getFillClass(pct, false);
  btn.classList.remove('cal-dot--empty', 'cal-dot--low', 'cal-dot--mid', 'cal-dot--most', 'cal-dot--full');
  btn.classList.add(fillClass);
  btn.setAttribute('aria-label', `${formatDisplayDate(dateKey)}: ${doneCount} of ${total}`);
}

function patchStreak(habitId, streak) {
  const row = document.querySelector(`[data-streak-id="${habitId}"]`);
  if (!row) return;
  const badge = row.querySelector('.habit-streak-badge');
  if (!badge) return;
  badge.className = `habit-streak-badge${streak > 0 ? ' habit-streak-badge--active' : ''}`;
  badge.innerHTML = streak > 0
    ? `<span class="streak-flame">\uD83D\uDD25</span><span class="streak-num">${streak}</span>`
    : `<span class="streak-zero">\u2014</span>`;
}

function rebuildPillsSection(habits, activeDate, todayKey) {
  const section = document.getElementById('habitsPillsSection');
  if (!section) return;
  const fresh = document.createElement('div');
  fresh.innerHTML = renderHabitPills(habits, activeDate, activeDate === todayKey);
  section.replaceWith(fresh.firstElementChild);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export const HabitsView = {
  async init(container, user) {
    container.innerHTML = '<div class="loading-state"><p>Loading habits\u2026</p></div>';

    const todayKey = getTodayKey();
    const startKey = getNWeeksAgoKey(4);

    const [todayHabits, logsMap] = await Promise.all([
      getHabitLog(user.uid, todayKey),
      getHabitLogsRange(user.uid, startKey, todayKey)
    ]);

    logsMap[todayKey] = { ...todayHabits };

    let activeDate    = todayKey;
    let activeHabits  = { ...todayHabits };
    let currentLogs   = { ...logsMap };
    let currentStreaks = computeStreaks(currentLogs, todayKey);
    const calDays     = buildCalendarDays(todayKey);

    // Initial full render — only time we set innerHTML on the container
    container.innerHTML = renderView(activeHabits, currentLogs, currentStreaks, calDays, activeDate, todayKey);

    document.getElementById('habitsBackBtn')?.addEventListener('click', () => {
      navigateTo('today');
    });

    bindPillEvents();
    bindCalEvents();

    function bindPillEvents() {
      document.querySelectorAll('[data-habit-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const habitId = btn.dataset.habitId;
          const current = activeHabits[habitId] === true;
          const newVal  = !current;

          // Optimistic surgical patch — scroll position untouched
          activeHabits[habitId] = newVal;
          currentLogs[activeDate] = { ...(currentLogs[activeDate] || {}), [habitId]: newVal };
          currentStreaks = computeStreaks(currentLogs, todayKey);

          patchPill(habitId, newVal);
          patchCrown(activeHabits, activeDate, todayKey);
          patchCalDot(activeDate, currentLogs);
          patchStreak(habitId, currentStreaks[habitId] || 0);

          try {
            await toggleHabit(user.uid, activeDate, habitId, newVal);
          } catch {
            // Rollback
            activeHabits[habitId] = current;
            currentLogs[activeDate][habitId] = current;
            currentStreaks = computeStreaks(currentLogs, todayKey);
            patchPill(habitId, current);
            patchCrown(activeHabits, activeDate, todayKey);
            patchCalDot(activeDate, currentLogs);
            patchStreak(habitId, currentStreaks[habitId] || 0);
            showToast('Save failed \u2014 try again', 'error');
          }
        });
      });
    }

    function bindCalEvents() {
      document.querySelectorAll('[data-cal-date]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const dateKey = btn.dataset.calDate;
          if (dateKey === activeDate) return;

          // Move active highlight
          document.querySelectorAll('[data-cal-date]').forEach(b => {
            b.classList.toggle('cal-dot--active', b.dataset.calDate === dateKey);
          });

          activeDate = dateKey;

          if (!currentLogs[dateKey]) {
            try {
              currentLogs[dateKey] = await getHabitLog(user.uid, dateKey);
            } catch {
              currentLogs[dateKey] = {};
            }
          }

          activeHabits = { ...(currentLogs[dateKey] || {}) };

          // Rebuild pills section only (small swap, not full page)
          rebuildPillsSection(activeHabits, activeDate, todayKey);
          bindPillEvents();

          // Scroll pills gently into view if they're offscreen
          setTimeout(() => {
            document.getElementById('habitsPillsSection')
              ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 60);
        });
      });
    }
  }
};
