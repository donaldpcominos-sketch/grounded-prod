import { HABITS, getHabits, getAllHabits, getHabitLog, getHabitLogsRange, toggleHabit, computeStreaks, buildCalendarDays, getNWeeksAgoKey, createHabit, updateHabitActive, updateHabit, updateHabitOrder } from '../services/habits.js';
import { getTodayKey, showToast } from '../utils.js';
import { navigateTo } from '../router.js';
import { Skeletons } from '../skeletons.js';

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
  if (pct === 1) return 'cal-dot--full';
  if (pct >= 0.7) return 'cal-dot--most';
  if (pct >= 0.4) return 'cal-dot--mid';
  if (pct > 0) return 'cal-dot--low';
  return 'cal-dot--empty';
}

function getDayDoneCount(logsMap, dateKey, habitDefs) {
  const habits = logsMap[dateKey] || {};
  return habitDefs.filter(h => isHabitDone(habits, h.id)).length;
}

function getSortedByStreak(streaks, habitDefs) {
  return [...habitDefs].sort((a, b) => (streaks[b.id] || 0) - (streaks[a.id] || 0));
}

function normalisedLabel(label) {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isHabitDone(habits, habitId) {
  const val = habits[habitId];
  if (val === true) return true;
  if (typeof val === 'object' && val !== null) {
    return val.completed === true;
  }
  return false;
}

function emitHabitsUpdated(detail = {}) {
  window.dispatchEvent(new CustomEvent('grounded:habits-updated', {
    detail: {
      source: 'habits-view',
      ...detail
    }
  }));
}

// ─── Render: habit toggle pills ───────────────────────────────────────────────

function renderHabitPills(habits, activeDate, isToday, habitDefs) {
  const dateLabel = isToday ? 'Today' : formatShortDate(activeDate);

  if (habitDefs.length === 0) {
    return `
      <div class="habits-pills-section" id="habitsPillsSection">
        <div class="habits-empty-state">
          <p class="habits-empty-icon">🌱</p>
          <p class="habits-empty-title">No habits yet</p>
          <p class="habits-empty-body">Tap Edit to add your first habit.</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="habits-pills-section" id="habitsPillsSection">
      <div class="habits-pills-header">
        <p class="habits-pills-date">${dateLabel}</p>
        ${!isToday ? '<p class="habits-pills-hint">Logging a past day</p>' : ''}
      </div>
      <div class="habits-pills-list">
        ${habitDefs.map((h, i) => {
          const done = isHabitDone(habits, h.id);
          return `
            <button
              class="habit-pill${done ? ' habit-pill--done' : ''}"
              data-habit-id="${h.id}"
              style="--habit-color: ${h.color}; animation-delay: ${i * 55}ms"
              aria-pressed="${done}"
              aria-label="${h.label}"
            >
              <span class="habit-pill-emoji">${h.emoji}</span>
              <span class="habit-pill-label">${h.label}</span>
              <span class="habit-pill-check" aria-hidden="true">${done ? '✓' : ''}</span>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ─── Render: 4-week dot calendar ──────────────────────────────────────────────

function renderCalendar(calendarDays, logsMap, activeDate, habitDefs) {
  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const total = habitDefs.length;

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
          const doneCount = getDayDoneCount(logsMap, day.dateKey, habitDefs);
          const pct = total > 0 ? doneCount / total : 0;
          const fillClass = getFillClass(pct, day.isFuture);
          const isActive = day.dateKey === activeDate;
          const isFull = fillClass === 'cal-dot--full';
          return `
            <button
              class="cal-dot ${fillClass}${isActive ? ' cal-dot--active' : ''}${day.isToday ? ' cal-dot--today' : ''}"
              data-cal-date="${day.dateKey}"
              aria-label="${formatDisplayDate(day.dateKey)}: ${doneCount} of ${total}${isFull ? ' — all done!' : ''}"
              ${day.isFuture ? 'disabled' : ''}
            >
              ${isFull
                ? `<span class="cal-dot-crown" aria-hidden="true">👑</span>`
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
        <div class="cal-legend-item"><div class="cal-legend-dot cal-dot--full"></div><span>All 👑</span></div>
      </div>
    </div>
  `;
}

// ─── Render: streaks (top 3 + expandable rest) ────────────────────────────────

function renderStreaks(streaks, habitDefs) {
  const sorted = getSortedByStreak(streaks, habitDefs);
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);
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
            ? `<span class="streak-flame">🔥</span><span class="streak-num">${streak}</span>`
            : `<span class="streak-zero">—</span>`}
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
            Show all <span class="streaks-toggle-arrow">↓</span>
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

// ─── Render: edit mode ────────────────────────────────────────────────────────

function renderEditSection(allHabits, editingHabitId = null) {
  const activeHabits = allHabits.filter(h => h.active);
  const inactiveHabits = allHabits.filter(h => !h.active);

  function editRow(h) {
    const isEditingRow = editingHabitId === h.id;

    if (isEditingRow) {
      return `
        <div class="habits-edit-row habits-edit-row--editing${!h.active ? ' habits-edit-row--inactive' : ''}" data-edit-id="${h.id}">
          <input
            type="text"
            class="habits-inline-emoji-input"
            data-edit-emoji-id="${h.id}"
            value="${h.emoji || ''}"
            maxlength="4"
            aria-label="Edit emoji for ${h.label}"
            autocomplete="off"
          />
          <input
            type="text"
            class="habits-inline-label-input"
            data-edit-label-id="${h.id}"
            value="${h.label || ''}"
            maxlength="40"
            aria-label="Edit name for ${h.label}"
            autocomplete="off"
          />
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn-primary" data-save-edit-id="${h.id}" aria-label="Save changes to ${h.label}">
              Save
            </button>
            <button class="habits-back-btn" data-cancel-edit-id="${h.id}" aria-label="Cancel editing ${h.label}">
              Cancel
            </button>
            <label class="habits-toggle-switch" aria-label="${h.active ? 'Deactivate' : 'Activate'} ${h.label}">
              <input
                type="checkbox"
                class="habits-toggle-input"
                data-toggle-id="${h.id}"
                ${h.active ? 'checked' : ''}
              />
              <span class="habits-toggle-track"></span>
            </label>
          </div>
        </div>
      `;
    }

    return `
      <div class="habits-edit-row${!h.active ? ' habits-edit-row--inactive' : ''}" data-edit-id="${h.id}">
        <div style="display:flex;align-items:center;gap:6px;">
          <button type="button" class="habits-reorder-btn" data-move-up="${h.id}" aria-label="Move ${h.label} up">↑</button>
          <button type="button" class="habits-reorder-btn" data-move-down="${h.id}" aria-label="Move ${h.label} down">↓</button>
        </div>
        <button
          class="habits-edit-main"
          type="button"
          data-start-edit-id="${h.id}"
          aria-label="Edit ${h.label}"
        >
          <span class="habits-edit-emoji">${h.emoji}</span>
          <span class="habits-edit-label">${h.label}</span>
        </button>
        <label class="habits-toggle-switch" aria-label="${h.active ? 'Deactivate' : 'Activate'} ${h.label}">
          <input
            type="checkbox"
            class="habits-toggle-input"
            data-toggle-id="${h.id}"
            ${h.active ? 'checked' : ''}
          />
          <span class="habits-toggle-track"></span>
        </label>
      </div>
    `;
  }

  return `
    <div class="habits-edit-section" id="habitsEditSection">
      <div class="habits-edit-hint">
        <p class="habits-edit-hint-text">Tap a habit to edit its name or emoji. Toggle habits on or off to control what appears on your daily log.</p>
      </div>

      <div class="habits-edit-list" id="habitsEditList">
        ${activeHabits.map(editRow).join('')}
        ${inactiveHabits.length > 0 ? `
          <p class="habits-edit-group-label">Inactive</p>
          ${inactiveHabits.map(editRow).join('')}
        ` : ''}
      </div>

      <div class="habits-add-form" id="habitsAddForm">
        <p class="habits-section-label" style="margin-top: 24px; margin-bottom: 10px;">Add a habit</p>
        <div class="habits-add-row">
          <input
            type="text"
            id="habitEmojiInput"
            class="habits-add-emoji-input"
            placeholder="😊"
            maxlength="4"
            aria-label="Habit emoji"
            autocomplete="off"
          />
          <input
            type="text"
            id="habitLabelInput"
            class="habits-add-label-input"
            placeholder="Habit name"
            maxlength="40"
            aria-label="Habit name"
            autocomplete="off"
          />
          <button class="btn-primary habits-add-btn" id="habitsAddBtn" aria-label="Add habit">
            Add
          </button>
        </div>
        <p class="habits-add-error" id="habitsAddError" hidden></p>
      </div>
    </div>
  `;
}

// ─── Full view ────────────────────────────────────────────────────────────────

function renderView(habits, logsMap, streaks, calendarDays, activeDate, todayKey, habitDefs, isEditing, allHabits, editingHabitId) {
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
            <div style="display:flex;gap:8px;align-items:center">
              <button
                class="habits-edit-toggle-btn${isEditing ? ' habits-edit-toggle-btn--active' : ''}"
                id="habitsEditToggleBtn"
                aria-pressed="${isEditing}"
              >
                ${isEditing ? 'Done' : 'Edit'}
              </button>
              <button class="habits-back-btn" id="habitsBackBtn" aria-label="Back to today">
                ← Today
              </button>
            </div>
          </div>
        </header>

        ${isEditing
          ? renderEditSection(allHabits, editingHabitId)
          : `
            ${renderHabitPills(habits, activeDate, activeDate === todayKey, habitDefs)}
            ${habitDefs.length > 0 ? renderCalendar(calendarDays, logsMap, activeDate, habitDefs) : ''}
            ${habitDefs.length > 0 ? renderStreaks(streaks, habitDefs) : ''}
          `
        }
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
  if (check) check.textContent = done ? '✓' : '';

  // Bounce animation when marking done
  if (done) {
    btn.classList.remove('habit-pill--popping');
    // Force reflow so animation replays even if triggered twice quickly
    void btn.offsetWidth;
    btn.classList.add('habit-pill--popping');
    setTimeout(() => btn.classList.remove('habit-pill--popping'), 400);
  }
}

function patchCalDot(dateKey, logsMap, habitDefs) {
  const btn = document.querySelector(`[data-cal-date="${dateKey}"]`);
  if (!btn) return;
  const total = habitDefs.length;
  const doneCount = getDayDoneCount(logsMap, dateKey, habitDefs);
  const pct = total > 0 ? doneCount / total : 0;
  const fillClass = getFillClass(pct, false);
  const isFull = fillClass === 'cal-dot--full';

  btn.classList.remove('cal-dot--empty', 'cal-dot--low', 'cal-dot--mid', 'cal-dot--most', 'cal-dot--full');
  btn.classList.add(fillClass);
  btn.setAttribute('aria-label', `${formatDisplayDate(dateKey)}: ${doneCount} of ${total}${isFull ? ' — all done!' : ''}`);

  if (isFull) {
    btn.innerHTML = `<span class="cal-dot-crown" aria-hidden="true">👑</span>`;
  } else {
    const dayNum = new Date(dateKey + 'T12:00:00').getDate();
    btn.innerHTML = `<span class="cal-dot-day">${dayNum}</span>`;
  }
}

function patchStreak(habitId, streak) {
  const row = document.querySelector(`[data-streak-id="${habitId}"]`);
  if (!row) return;
  const active = streak > 0;
  row.className = `habit-streak-row${active ? ' habit-streak-row--active' : ''}`;
  const badge = row.querySelector('.habit-streak-badge');
  if (!badge) return;
  badge.className = `habit-streak-badge${active ? ' habit-streak-badge--active' : ''}`;
  badge.innerHTML = active
    ? `<span class="streak-flame">🔥</span><span class="streak-num">${streak}</span>`
    : `<span class="streak-zero">—</span>`;
}

function rebuildPillsSection(habits, activeDate, todayKey, habitDefs) {
  const section = document.getElementById('habitsPillsSection');
  if (!section) return;
  const fresh = document.createElement('div');
  fresh.innerHTML = renderHabitPills(habits, activeDate, activeDate === todayKey, habitDefs);
  section.replaceWith(fresh.firstElementChild);
}

function rebuildStreaksSection(streaks, habitDefs) {
  const section = document.getElementById('habitsStreaksSection');
  if (!section) return;
  const fresh = document.createElement('div');
  fresh.innerHTML = renderStreaks(streaks, habitDefs);
  section.replaceWith(fresh.firstElementChild);
  bindStreaksToggle();
}

// ─── Streaks toggle ───────────────────────────────────────────────────────────

function bindStreaksToggle() {
  const btn = document.getElementById('streaksToggleBtn');
  const rest = document.getElementById('streaksRest');
  if (!btn || !rest) return;

  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    if (expanded) {
      rest.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = `Show all <span class="streaks-toggle-arrow">↓</span>`;
    } else {
      rest.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      btn.innerHTML = `Show less <span class="streaks-toggle-arrow">↑</span>`;
    }
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export const HabitsView = {
  async init(container, user) {
    container.innerHTML = Skeletons.habits();

    const todayKey = getTodayKey();
    const startKey = getNWeeksAgoKey(4);

    const [firestoreHabits, allFirestoreHabits, todayHabits, logsMap] = await Promise.all([
      getHabits(user.uid),
      getAllHabits(user.uid),
      getHabitLog(user.uid, todayKey),
      getHabitLogsRange(user.uid, startKey, todayKey)
    ]);

    let habitDefs = firestoreHabits.length > 0
      ? firestoreHabits
      : [];

    let allHabits = allFirestoreHabits.length > 0 ? allFirestoreHabits : HABITS.map(h => ({ ...h, active: true }));

    logsMap[todayKey] = { ...todayHabits };

    let activeDate = todayKey;
    let activeHabits = { ...todayHabits };
    let currentLogs = { ...logsMap };
    let currentStreaks = computeStreaks(currentLogs, todayKey, habitDefs);
    const calDays = buildCalendarDays(todayKey);
    let isEditing = false;
    let editingHabitId = null;

    function renderAndBind() {
      container.innerHTML = renderView(
        activeHabits,
        currentLogs,
        currentStreaks,
        calDays,
        activeDate,
        todayKey,
        habitDefs,
        isEditing,
        allHabits,
        editingHabitId
      );
      bindAll();
    }

    renderAndBind();

    function bindAll() {
      document.getElementById('habitsBackBtn')?.addEventListener('click', () => {
        navigateTo('today');
      });

      document.getElementById('habitsEditToggleBtn')?.addEventListener('click', () => {
        isEditing = !isEditing;
        editingHabitId = null;
        renderAndBind();
      });

      if (isEditing) {
        bindEditEvents();
      } else {
        bindPillEvents();
        bindCalEvents();
        bindStreaksToggle();
      }
    }

    function bindReorderButtons() {
      document.querySelectorAll('[data-move-up]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          moveHabit(btn.dataset.moveUp, -1);
        });
      });

      document.querySelectorAll('[data-move-down]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          moveHabit(btn.dataset.moveDown, 1);
        });
      });
    }

    function bindToggleInputs() {
      document.querySelectorAll('[data-toggle-id]').forEach(input => {
        input.addEventListener('change', async () => {
          const habitId = input.dataset.toggleId;
          const active = input.checked;

          const row = document.querySelector(`[data-edit-id="${habitId}"]`);
          if (row) row.style.opacity = active ? '1' : '0.45';

          try {
            await updateHabitActive(user.uid, habitId, active);

            allHabits = allHabits.map(h =>
              h.id === habitId ? { ...h, active } : h
            );
            habitDefs = allHabits.filter(h => h.active);
            currentStreaks = computeStreaks(currentLogs, todayKey, habitDefs);

            rebuildEditList();

            emitHabitsUpdated({
              type: 'definition-active-changed',
              habitId,
              active
            });
          } catch {
            input.checked = !active;
            if (row) row.style.opacity = '';
            showToast('Save failed — try again', 'error');
          }
        });
      });
    }

    function bindStartEditButtons() {
      document.querySelectorAll('[data-start-edit-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          editingHabitId = btn.dataset.startEditId;
          rebuildEditList();
        });
      });
    }

    function bindCancelEditButtons() {
      document.querySelectorAll('[data-cancel-edit-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          editingHabitId = null;
          rebuildEditList();
        });
      });
    }

    function bindSaveEditButtons() {
      document.querySelectorAll('[data-save-edit-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const habitId = btn.dataset.saveEditId;
          const labelInput = document.querySelector(`[data-edit-label-id="${habitId}"]`);
          const emojiInput = document.querySelector(`[data-edit-emoji-id="${habitId}"]`);

          const newLabel = labelInput?.value?.trim() || '';
          const newEmoji = emojiInput?.value?.trim() || '⭐';

          if (!newLabel) {
            showToast('Please enter a habit name', 'error');
            labelInput?.focus();
            return;
          }

          const normalised = normalisedLabel(newLabel);
          const isDuplicate = allHabits.some(h =>
            h.id !== habitId && normalisedLabel(h.label) === normalised
          );

          if (isDuplicate) {
            showToast('You already have a habit with that name', 'error');
            labelInput?.select();
            return;
          }

          btn.disabled = true;

          try {
            await updateHabit(user.uid, habitId, {
              label: newLabel,
              emoji: newEmoji
            });

            allHabits = allHabits.map(h =>
              h.id === habitId
                ? { ...h, label: newLabel, emoji: newEmoji }
                : h
            );

            habitDefs = allHabits.filter(h => h.active);
            currentStreaks = computeStreaks(currentLogs, todayKey, habitDefs);
            editingHabitId = null;

            rebuildEditList();
            showToast('Habit updated', 'success');

            emitHabitsUpdated({
              type: 'definition-updated',
              habitId
            });
          } catch {
            showToast('Could not update habit — try again', 'error');
          } finally {
            btn.disabled = false;
          }
        });
      });
    }

    function bindInlineEditInputs() {
      document.querySelectorAll('[data-edit-label-id]').forEach(input => {
        input.addEventListener('keydown', e => {
          const habitId = input.dataset.editLabelId;
          if (e.key === 'Enter') {
            e.preventDefault();
            document.querySelector(`[data-save-edit-id="${habitId}"]`)?.click();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            editingHabitId = null;
            rebuildEditList();
          }
        });
      });

      document.querySelectorAll('[data-edit-emoji-id]').forEach(input => {
        input.addEventListener('keydown', e => {
          const habitId = input.dataset.editEmojiId;
          if (e.key === 'Enter') {
            e.preventDefault();
            document.querySelector(`[data-save-edit-id="${habitId}"]`)?.click();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            editingHabitId = null;
            rebuildEditList();
          }
        });
      });
    }

    async function moveHabit(habitId, direction) {
      const index = allHabits.findIndex(h => h.id === habitId);
      if (index === -1) return;

      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= allHabits.length) return;

      const updated = [...allHabits];
      [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];

      const updatedWithOrder = updated.map((h, i) => ({
        ...h,
        sortOrder: i
      }));

      const updates = updatedWithOrder.map(h => ({
        id: h.id,
        sortOrder: h.sortOrder
      }));

      allHabits = updatedWithOrder;
      habitDefs = allHabits.filter(h => h.active);

      rebuildEditList();

      try {
        await updateHabitOrder(user.uid, updates);

        emitHabitsUpdated({
          type: 'definition-reordered'
        });
      } catch {
        showToast('Reorder failed — try again', 'error');
      }
    }

    function rebuildEditList() {
      const listEl = document.getElementById('habitsEditList');
      if (!listEl) return;

      const fresh = document.createElement('div');
      fresh.innerHTML = renderEditSection(allHabits, editingHabitId);
      const newList = fresh.querySelector('#habitsEditList');

      if (newList) {
        listEl.replaceWith(newList);
        bindToggleInputs();
        bindStartEditButtons();
        bindCancelEditButtons();
        bindSaveEditButtons();
        bindInlineEditInputs();
        bindReorderButtons();

        if (editingHabitId) {
          setTimeout(() => {
            document.querySelector(`[data-edit-label-id="${editingHabitId}"]`)?.focus();
          }, 0);
        }
      }
    }

    function bindEditEvents() {
      bindToggleInputs();
      bindStartEditButtons();
      bindCancelEditButtons();
      bindSaveEditButtons();
      bindInlineEditInputs();
      bindReorderButtons();

      document.getElementById('habitsAddBtn')?.addEventListener('click', handleAddHabit);

      document.getElementById('habitLabelInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAddHabit();
        }
      });
    }

    async function handleAddHabit() {
      const labelInput = document.getElementById('habitLabelInput');
      const emojiInput = document.getElementById('habitEmojiInput');
      const errorEl = document.getElementById('habitsAddError');
      const btn = document.getElementById('habitsAddBtn');

      const label = labelInput?.value?.trim() || '';
      const emoji = emojiInput?.value?.trim() || '⭐';

      if (!label) {
        showAddError(errorEl, 'Please enter a habit name.');
        labelInput?.focus();
        return;
      }

      const normalised = normalisedLabel(label);
      const isDuplicate = allHabits.some(h => normalisedLabel(h.label) === normalised);
      if (isDuplicate) {
        showAddError(errorEl, 'You already have a habit with that name.');
        labelInput?.select();
        return;
      }

      clearAddError(errorEl);
      if (btn) btn.disabled = true;

      try {
        const newHabit = await createHabit(user.uid, { label, emoji });

        allHabits = [...allHabits, newHabit];
        habitDefs = allHabits.filter(h => h.active);
        currentStreaks = computeStreaks(currentLogs, todayKey, habitDefs);

        if (labelInput) labelInput.value = '';
        if (emojiInput) emojiInput.value = '';

        rebuildEditList();

        showToast('Habit added', 'success');

        emitHabitsUpdated({
          type: 'definition-created',
          habitId: newHabit.id
        });

        setTimeout(() => labelInput?.focus(), 50);
      } catch {
        showToast('Could not add habit — try again', 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    function showAddError(errorEl, message) {
      if (!errorEl) return;
      errorEl.textContent = message;
      errorEl.hidden = false;
    }

    function clearAddError(errorEl) {
      if (!errorEl) return;
      errorEl.textContent = '';
      errorEl.hidden = true;
    }

    function bindPillEvents() {
      document.querySelectorAll('[data-habit-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const habitId = btn.dataset.habitId;
          const current = isHabitDone(activeHabits, habitId);
          const newVal = !current;

          activeHabits[habitId] = {
            completed: newVal,
            labelSnapshot: activeHabits[habitId]?.labelSnapshot ?? null,
            emojiSnapshot: activeHabits[habitId]?.emojiSnapshot ?? null
          };

          const habitMeta = habitDefs.find(h => h.id === habitId);

          currentLogs[activeDate] = {
            ...(currentLogs[activeDate] || {}),
            [habitId]: {
              completed: newVal,
              labelSnapshot: habitMeta?.label || null,
              emojiSnapshot: habitMeta?.emoji || null
            }
          };

          const prevStreaks = { ...currentStreaks };
          currentStreaks = computeStreaks(currentLogs, todayKey, habitDefs);

          patchPill(habitId, newVal);
          patchCalDot(activeDate, currentLogs, habitDefs);

          // All-done celebration when every habit is ticked for today
          if (newVal && activeDate === todayKey) {
            const doneCount = habitDefs.filter(h => isHabitDone(currentLogs[todayKey] || {}, h.id)).length;
            if (doneCount === habitDefs.length && habitDefs.length > 0) {
              const section = document.getElementById('habitsPillsSection');
              if (section) {
                section.classList.remove('habits-pills-section--celebrating');
                void section.offsetWidth;
                section.classList.add('habits-pills-section--celebrating');
                setTimeout(() => section.classList.remove('habits-pills-section--celebrating'), 800);
              }
            }
          }

          const rankChanged = getSortedByStreak(currentStreaks, habitDefs).map(h => h.id).join()
            !== getSortedByStreak(prevStreaks, habitDefs).map(h => h.id).join();

          if (rankChanged) {
            rebuildStreaksSection(currentStreaks, habitDefs);
          } else {
            patchStreak(habitId, currentStreaks[habitId] || 0);
          }

          try {
            await toggleHabit(
              user.uid,
              activeDate,
              habitId,
              newVal,
              {
                label: habitMeta?.label,
                emoji: habitMeta?.emoji
              }
            );

            emitHabitsUpdated({
              type: 'log-toggled',
              habitId,
              dateKey: activeDate,
              completed: newVal
            });
          } catch {
            activeHabits[habitId] = current
              ? {
                  completed: true,
                  labelSnapshot: habitMeta?.label || null,
                  emojiSnapshot: habitMeta?.emoji || null
                }
              : {
                  completed: false,
                  labelSnapshot: habitMeta?.label || null,
                  emojiSnapshot: habitMeta?.emoji || null
                };

            currentLogs[activeDate][habitId] = {
              completed: current,
              labelSnapshot: habitMeta?.label || null,
              emojiSnapshot: habitMeta?.emoji || null
            };

            currentStreaks = computeStreaks(currentLogs, todayKey, habitDefs);
            patchPill(habitId, current);
            patchCalDot(activeDate, currentLogs, habitDefs);
            rebuildStreaksSection(currentStreaks, habitDefs);
            showToast('Save failed — try again', 'error');
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

          rebuildPillsSection(activeHabits, activeDate, todayKey, habitDefs);
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