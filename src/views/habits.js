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

// Returns habits sorted by streak descending
function getSortedByStreak(streaks) {
  return [...HABITS].sort((a, b) => (streaks[b.id] || 0) - (streaks[a.id] || 0));
}

// ─── Render: habit toggle pills ───────────────────────────────────────────────

function renderHabitPills(habits, activeDate, isToday) {
  const dateLabel = isToday ? 'Today' : formatShortDate(activeDate);
  return `
    <div class="habits-pills-section" id="habitsPillsSection">
      <div class="habits-pills-header">
        <p class="habits-pills-date">${dateLabel}</p>
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
          const isFull = fillClass === 'cal-dot--full';
          return `
            <button
              class="cal-dot ${fillClass}${isActive ? ' cal-dot--active' : ''}${day.isToday ? ' cal-dot--today' : ''}"
              data-cal-date="${day.dateKey}"
              aria-label="${formatDisplayDate(day.dateKey)}: ${doneCount} of ${total}${isFull ? ' \u2014 all done!' : ''}"
              ${day.isFuture ? 'disabled' : ''}
            >
              ${isFull
                ? `<span class="cal-dot-crown" aria-hidden="true">\uD83D\uDC51</span>`
                : `<span class="cal-dot-day">${day.dayOfMonth}</span>`
              }
            </button>
          `;
        }).join('')}
      </div>
      <div class="habits-cal-legend">
        <div class="cal-legend-item"><div class="cal-legend-dot cal-dot--empty"></div><span>None</span></div>
        <div class="cal-legend-item"><div class="cal-legend-dot cal-dot--low"></div><span>Some</span></div>
        <div class="cal-legend-item"><div class="cal-legend-dot cal-dot--mid"></div><span>Half</span></div>
        <div class="cal-legend-item"><div class="cal-legend-dot cal-dot--most"></div><span>Most</span></div>
        <div class="cal-legend-item"><div class="cal-legend-dot cal-dot--full"></div><span>All \uD83D\uDC51</span></div>
      </div>
    </div>
  `;
}

// ─── Render: streaks (top 3 + expandable rest) ────────────────────────────────

function renderStreaks(streaks) {
  const sorted = getSortedByStreak(streaks);
  const top3   = sorted.slice(0, 3);
  const rest   = sorted.slice(3);
  const hasRest = rest.length > 0;

  function streakRow(h) {
    const streak = streaks[h.id] || 0;
    const active = streak > 0;
    return `
      <div class="habit-streak-row${active ? ' habit-streak-row--active' : ''}" data-streak-id="${h.id}">
        <span class="habit-streak-emoji">${h.emoji}</span>
        <span class="habit-streak-label">${h.label}</span>
        <div class="habit-streak-badge${active ? ' habit-streak-badge--active' : ''}">
          ${active
            ? `<span class="streak-flame">\uD83D\uDD25</span><span class="streak-num">${streak}</span>`
            : `<span class="streak-zero">\u2014</span>`}
        </div>
      </div>
    `;
  }

  return `
    <div class="habits-streaks-section" id="habitsStreaksSection">
      <p class="habits-section-label">Streaks</p>
      <div class="habits-streaks-list">
        ${top3.map(streakRow).join('')}
        ${hasRest ? `
          <div class="streaks-rest" id="streaksRest" hidden>
            ${rest.map(streakRow).join('')}
          </div>
          <button class="streaks-toggle-btn" id="streaksToggleBtn" aria-expanded="false">
            Show all <span class="streaks-toggle-arrow">\u2193</span>
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

// ─── Full view ────────────────────────────────────────────────────────────────

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

// ─── Surgical DOM updaters ─────────────────────────────────────────────────────

function patchPill(habitId, done) {
  const btn = document.querySelector(`[data-habit-id="${habitId}"]`);
  if (!btn) return;
  btn.classList.toggle('habit-pill--done', done);
  btn.setAttribute('aria-pressed', String(done));
  const check = btn.querySelector('.habit-pill-check');
  if (check) check.textContent = done ? '\u2713' : '';
}

function patchCalDot(dateKey, logsMap) {
  const btn = document.querySelector(`[data-cal-date="${dateKey}"]`);
  if (!btn) return;
  const total = HABITS.length;
  const doneCount = getDayDoneCount(logsMap, dateKey);
  const pct = total > 0 ? doneCount / total : 0;
  const fillClass = getFillClass(pct, false);
  const isFull = fillClass === 'cal-dot--full';

  btn.classList.remove('cal-dot--empty', 'cal-dot--low', 'cal-dot--mid', 'cal-dot--most', 'cal-dot--full');
  btn.classList.add(fillClass);
  btn.setAttribute('aria-label', `${formatDisplayDate(dateKey)}: ${doneCount} of ${total}${isFull ? ' \u2014 all done!' : ''}`);

  if (isFull) {
    btn.innerHTML = `<span class="cal-dot-crown" aria-hidden="true">\uD83D\uDC51</span>`;
  } else {
    const dayNum = new Date(dateKey + 'T12:00:00').getDate();
    btn.innerHTML = `<span class="cal-dot-day">${dayNum}</span>`;
  }
}

function patchStreak(habitId, streak) {
  // Update whichever row currently exists in the DOM for this habit
  const row = document.querySelector(`[data-streak-id="${habitId}"]`);
  if (!row) return;
  const active = streak > 0;
  row.className = `habit-streak-row${active ? ' habit-streak-row--active' : ''}`;
  const badge = row.querySelector('.habit-streak-badge');
  if (!badge) return;
  badge.className = `habit-streak-badge${active ? ' habit-streak-badge--active' : ''}`;
  badge.innerHTML = active
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

function rebuildStreaksSection(streaks) {
  const section = document.getElementById('habitsStreaksSection');
  if (!section) return;
  const fresh = document.createElement('div');
  fresh.innerHTML = renderStreaks(streaks);
  section.replaceWith(fresh.firstElementChild);
  bindStreaksToggle();
}

// ─── Streaks toggle ───────────────────────────────────────────────────────────

function bindStreaksToggle() {
  const btn  = document.getElementById('streaksToggleBtn');
  const rest = document.getElementById('streaksRest');
  if (!btn || !rest) return;

  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    const arrow    = btn.querySelector('.streaks-toggle-arrow');
    if (expanded) {
      rest.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = `Show all <span class="streaks-toggle-arrow">\u2193</span>`;
    } else {
      rest.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      btn.innerHTML = `Show less <span class="streaks-toggle-arrow">\u2191</span>`;
    }
  });
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

    container.innerHTML = renderView(activeHabits, currentLogs, currentStreaks, calDays, activeDate, todayKey);

    document.getElementById('habitsBackBtn')?.addEventListener('click', () => {
      navigateTo('today');
    });

    bindPillEvents();
    bindCalEvents();
    bindStreaksToggle();

    function bindPillEvents() {
      document.querySelectorAll('[data-habit-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const habitId = btn.dataset.habitId;
          const current = activeHabits[habitId] === true;
          const newVal  = !current;

          activeHabits[habitId] = newVal;
          currentLogs[activeDate] = { ...(currentLogs[activeDate] || {}), [habitId]: newVal };
          const prevStreaks = { ...currentStreaks };
          currentStreaks = computeStreaks(currentLogs, todayKey);

          patchPill(habitId, newVal);
          patchCalDot(activeDate, currentLogs);

          // If streak rank order changed, rebuild streaks section; otherwise patch in place
          const rankChanged = getSortedByStreak(currentStreaks).map(h => h.id).join()
            !== getSortedByStreak(prevStreaks).map(h => h.id).join();
          if (rankChanged) {
            rebuildStreaksSection(currentStreaks);
          } else {
            patchStreak(habitId, currentStreaks[habitId] || 0);
          }

          try {
            await toggleHabit(user.uid, activeDate, habitId, newVal);
          } catch {
            activeHabits[habitId] = current;
            currentLogs[activeDate][habitId] = current;
            currentStreaks = computeStreaks(currentLogs, todayKey);
            patchPill(habitId, current);
            patchCalDot(activeDate, currentLogs);
            rebuildStreaksSection(currentStreaks);
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

          rebuildPillsSection(activeHabits, activeDate, todayKey);
          bindPillEvents();

          setTimeout(() => {
            document.getElementById('habitsPillsSection')
              ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 60);
        });
      });
    }
  }
};
