// src/views/workouts.js

import { buildSession, getWeekPlan, DAY_NAMES, DAY_SHORT, WEEKLY_SPLIT } from '../data/workouts.js';
import { getTodayWorkoutSession, saveWorkoutSession, completeWorkoutSession, getWorkoutStreak, getBannedExercises, banExercise } from '../services/workouts.js';
import { pickByDaySeed, getDaySeed } from '../utils.js';

// ─── State ────────────────────────────────────────────────────────────────────

let state = {
  screen: 'plan',
  mode: null,
  session: null,
  currentIndex: 0,
  skipped: new Set(),
  done: new Set(),
  savedSession: null,
  streak: 0,
  hadGraceDay: false,
  graceDayUsedOn: null,
  graceDayDismissed: false,
  bannedExercises: [],
  user: null,
  container: null,
  overlay: null
};

function setState(patch) {
  Object.assign(state, patch);
  render();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTodayDayOfWeek() { return new Date().getDay(); }

function getTypeTag(type) {
  return { lower:'Glutes', upper:'Upper', full:'Full Body', 'cardio-core':'Cardio', recovery:'Mobility' }[type] || type;
}

function getTypeColor(type) {
  return { lower:'tag--warm', upper:'tag--cool', full:'tag--neutral', 'cardio-core':'tag--green', recovery:'tag--soft' }[type] || 'tag--neutral';
}

function getIntensityDots(intensity) {
  const count = { low:1, medium:2, high:3 }[intensity] || 1;
  return Array.from({length:3}, (_,i) =>
    `<span class="intensity-dot ${i < count ? 'intensity-dot--on' : ''}"></span>`
  ).join('');
}

function getSubstituteOptions(exercise) {
  const today = getTodayDayOfWeek();
  const split = WEEKLY_SPLIT[today];
  const allPools = [...split.pool, ...(split.corePool || [])];
  const sessionIds = new Set(state.session.exercises.map(e => e.id));
  const banned = new Set(state.bannedExercises);
  const sameMusc = allPools.filter(e => e.id !== exercise.id && !sessionIds.has(e.id) && !banned.has(e.id) && e.muscle === exercise.muscle);
  const diffMusc = allPools.filter(e => e.id !== exercise.id && !sessionIds.has(e.id) && !banned.has(e.id) && e.muscle !== exercise.muscle);
  return [...sameMusc, ...diffMusc].slice(0, 3);
}

// ─── Streak helpers ───────────────────────────────────────────────────────────

function getStreakBadgeCopy(streak) {
  if (streak <= 0) return null;
  if (streak === 1) return 'First session done.';
  if (streak >= 3 && streak < 7) return 'Building momentum.';
  if (streak >= 7) return 'One week strong.';
  return null; // streak 2 — no copy yet, just the badge number
}

// ─── Screen: Plan ─────────────────────────────────────────────────────────────

function renderPlan() {
  const today = getTodayDayOfWeek();
  const todaySplit = WEEKLY_SPLIT[today];
  const weekPlan = getWeekPlan();
  const alreadyDone = state.savedSession?.status === 'complete';
  const inProgress = state.savedSession && state.savedSession.status !== 'complete';
  const streakCopy = getStreakBadgeCopy(state.streak);

  // Grace day banner: shown once per session if streak was preserved by a grace day
  const showGraceBanner = state.hadGraceDay && !state.graceDayDismissed;

  return `
    <main class="view-scroll">
      <div class="view-inner">
        <header class="page-header">
          <p class="eyebrow">Grounded</p>
          <div class="header-row">
            <div>
              <h1 class="page-title">Workouts</h1>
              <p class="page-subtitle">${DAY_NAMES[today]} · ${todaySplit.label}</p>
            </div>
            ${state.streak > 0 ? `
              <div class="streak-badge-wrap">
                <div class="streak-badge">
                  <span class="streak-flame">🔥</span>
                  <span class="streak-count">${state.streak}</span>
                </div>
                ${streakCopy ? `<p class="streak-badge-copy">${streakCopy}</p>` : ''}
              </div>
            ` : ''}
          </div>
        </header>

        ${showGraceBanner ? `
          <div class="grace-banner" id="graceBanner">
            <div class="grace-banner-content">
              <p class="grace-banner-title">Welcome back. Streak preserved.</p>
              <p class="grace-banner-body">Missing one day never breaks your momentum here.</p>
            </div>
            <button class="grace-banner-dismiss" id="graceDismissBtn" aria-label="Dismiss">✕</button>
          </div>
        ` : ''}

        <section class="card card--today-workout">
          <div class="workout-focus-row">
            <span class="tag ${getTypeColor(todaySplit.type)}">${getTypeTag(todaySplit.type)}</span>
            ${alreadyDone ? '<span class="tag tag--done">✓ Done</span>' : ''}
          </div>
          <h2 class="card-title mt-2">${todaySplit.label}</h2>
          <p class="workout-focus-label">${todaySplit.focus}</p>
          ${alreadyDone ? `
            <div class="done-state mt-4">
              <p class="done-message">You trained today. Well done.</p>
              <button class="btn-secondary mt-3 w-full" id="redoBtn">Train again anyway</button>
            </div>
          ` : inProgress ? `
            <p class="card-body mt-2">You have a session in progress.</p>
            <div class="btn-row mt-4">
              <button class="btn-primary flex-1" id="resumeBtn">Resume session</button>
              <button class="btn-secondary" id="newSessionBtn">Start new</button>
            </div>
          ` : `
            <p class="card-body mt-2">Choose your session length to begin.</p>
            <div class="mode-cards mt-4">
              <button class="mode-card" id="quickBtn">
                <p class="mode-card-time">20 min</p>
                <p class="mode-card-label">Quick reset</p>
                <p class="mode-card-desc">Focused, shorter sets</p>
              </button>
              <button class="mode-card" id="standardBtn">
                <p class="mode-card-time">35–45 min</p>
                <p class="mode-card-label">Standard</p>
                <p class="mode-card-desc">Full session, full benefit</p>
              </button>
            </div>
          `}
        </section>

        <section class="card mt-3">
          <p class="card-label">This week</p>
          <div class="week-strip mt-3">
            ${weekPlan.map(day => `
              <div class="week-day ${day.isToday ? 'week-day--today' : ''}">
                <p class="week-day-name">${DAY_SHORT[day.day]}</p>
                <div class="week-day-dot ${getTypeColor(day.type)}"></div>
                <p class="week-day-focus">${getTypeTag(day.type)}</p>
              </div>
            `).join('')}
          </div>
        </section>

        <section class="card mt-3">
          <p class="card-label">Today&#39;s focus</p>
          <div class="focus-list mt-3">
            ${todaySplit.pool.slice(0, 3).map(ex => `
              <div class="focus-item">
                <div>
                  <p class="focus-name">${ex.name}</p>
                  <p class="focus-muscle">${ex.muscle}</p>
                </div>
                <div class="intensity-dots">${getIntensityDots(ex.intensity)}</div>
              </div>
            `).join('')}
            <p class="focus-more">+ more exercises in your session</p>
          </div>
        </section>
      </div>
    </main>
  `;
}

function bindPlanEvents() {
  const alreadyDone = state.savedSession?.status === 'complete';
  const inProgress = state.savedSession && state.savedSession.status !== 'complete';

  // Grace day dismiss
  document.getElementById('graceDismissBtn')?.addEventListener('click', () => {
    setState({ graceDayDismissed: true });
  });

  if (alreadyDone) {
    document.getElementById('redoBtn')?.addEventListener('click', () => { state.savedSession = null; render(); });
    return;
  }
  if (inProgress) {
    document.getElementById('resumeBtn')?.addEventListener('click', () => resumeSession());
    document.getElementById('newSessionBtn')?.addEventListener('click', () => { state.savedSession = null; render(); });
    return;
  }
  document.getElementById('quickBtn')?.addEventListener('click', () => startSession('quick'));
  document.getElementById('standardBtn')?.addEventListener('click', () => startSession('standard'));
}

// ─── Session start / resume ───────────────────────────────────────────────────

async function startSession(mode) {
  const today = getTodayDayOfWeek();
  const seed = getDaySeed();
  let session = buildSession(today, mode, seed);
  session.exercises = session.exercises.filter(e => !state.bannedExercises.includes(e.id));

  const sessionData = {
    mode, type: session.type, label: session.label, focus: session.focus,
    exerciseIds: session.exercises.map(e => e.id),
    estimatedTime: session.estimatedTime,
    status: 'in-progress',
    completedExercises: [], skippedExercises: []
  };

  await saveWorkoutSession(state.user.uid, sessionData);
  state.session = session;
  state.mode = mode;
  state.currentIndex = 0;
  state.done = new Set();
  state.skipped = new Set();
  state.savedSession = sessionData;
  state.overlay = null;
  setState({ screen: 'session' });
}

async function resumeSession() {
  const saved = state.savedSession;
  const today = getTodayDayOfWeek();
  const seed = getDaySeed();
  let session = buildSession(today, saved.mode, seed);
  session.exercises = session.exercises.filter(e => !state.bannedExercises.includes(e.id));
  const doneIds = new Set(saved.completedExercises || []);
  const skippedIds = new Set(saved.skippedExercises || []);
  const firstPending = session.exercises.findIndex(e => !doneIds.has(e.id) && !skippedIds.has(e.id));
  state.session = session;
  state.mode = saved.mode;
  state.currentIndex = firstPending >= 0 ? firstPending : 0;
  state.done = doneIds;
  state.skipped = skippedIds;
  state.overlay = null;
  setState({ screen: 'session' });
}

// ─── Screen: Session ──────────────────────────────────────────────────────────

function renderSession() {
  const { session, currentIndex, done, skipped, overlay } = state;
  const exercises = session.exercises;
  const total = exercises.length;
  const ex = exercises[currentIndex];
  const isDone = done.has(ex.id);
  const isSkipped = skipped.has(ex.id);
  const progressPct = Math.round((done.size / total) * 100);
  const hasNext = currentIndex < total - 1;
  const hasPrev = currentIndex > 0;
  const allHandled = exercises.every(e => done.has(e.id) || skipped.has(e.id));

  return `
    <div class="session-shell">
      <div class="session-topbar">
        <button class="btn-back" id="backBtn">← Plan</button>
        <div class="session-progress-wrap">
          <div class="progress-bar">
            <div class="progress-fill" style="width:${progressPct}%"></div>
          </div>
          <p class="progress-label">${done.size} of ${total} done</p>
        </div>
      </div>

      <div class="ex-card-wrap">
        <div class="ex-card ${isDone ? 'ex-card--done' : ''}">
          <div class="ex-card-accent">
            <span class="ex-card-index">${String(currentIndex + 1).padStart(2, '0')}</span>
            <span class="tag ${getTypeColor(session.type)}">${ex.equipment.split(' ')[0]}</span>
          </div>
          <div class="ex-card-body">
            <div>
              <h2 class="ex-name">${ex.name}</h2>
              <p class="ex-muscle">${ex.muscle}</p>
            </div>

            <div class="ex-stats mt-4">
              <div class="ex-stat">
                <p class="ex-stat-val">${ex.sets}</p>
                <p class="ex-stat-lbl">sets</p>
              </div>
              <div class="ex-stat-div"></div>
              <div class="ex-stat">
                <p class="ex-stat-val">${ex.reps}</p>
                <p class="ex-stat-lbl">reps</p>
              </div>
              <div class="ex-stat-div"></div>
              <div class="ex-stat">
                <p class="ex-stat-val">${ex.tempo}</p>
                <p class="ex-stat-lbl">tempo</p>
              </div>
            </div>

            <div class="ex-cue mt-4">
              <p class="cue-text">${ex.cue}</p>
            </div>

            ${isDone ? `<div class="ex-done-pill mt-4">✓ Complete</div>` : ''}
            ${isSkipped ? `<div class="ex-skip-pill mt-4">Skipped</div>` : ''}
          </div>
        </div>
      </div>

      <div class="session-controls">
        ${allHandled ? `
          <button class="btn-primary w-full" id="finishBtn">Complete session →</button>
        ` : `
          <div class="control-row">
            <button class="ctrl-btn ctrl-btn--ghost" id="prevBtn" ${!hasPrev ? 'disabled' : ''}>←</button>
            ${isDone
              ? `<button class="ctrl-btn ctrl-btn--undone" id="undoneBtn">Undo</button>`
              : `<button class="ctrl-btn ctrl-btn--done" id="doneBtn">Done ✓</button>`
            }
            <button class="ctrl-btn ctrl-btn--ghost" id="nextBtn" ${!hasNext ? 'disabled' : ''}>→</button>
          </div>
          <div class="control-row-sub mt-2">
            <button class="ctrl-sub-btn" id="skipBtn">Skip</button>
            <button class="ctrl-sub-btn" id="subBtn">Substitute</button>
          </div>
        `}
      </div>

      ${overlay === 'skip' ? renderSkipOverlay(ex) : ''}
      ${overlay === 'substitute' ? renderSubstituteOverlay(ex) : ''}
    </div>
  `;
}

function renderSkipOverlay(ex) {
  return `
    <div class="overlay-backdrop" id="overlayBackdrop">
      <div class="overlay-sheet">
        <p class="overlay-title">Skip this exercise?</p>
        <p class="overlay-subtitle">${ex.name}</p>
        <div class="overlay-options mt-4">
          <button class="overlay-opt" id="skipOnceBtn">
            <p class="overlay-opt-title">Skip for today</p>
            <p class="overlay-opt-desc">Move past it this session only</p>
          </button>
          <button class="overlay-opt overlay-opt--warn" id="skipForeverBtn">
            <p class="overlay-opt-title">Never suggest again</p>
            <p class="overlay-opt-desc">Remove from all future workouts</p>
          </button>
        </div>
        <button class="btn-secondary w-full mt-3" id="overlayCancel">Cancel</button>
      </div>
    </div>
  `;
}

function renderSubstituteOverlay(ex) {
  const options = getSubstituteOptions(ex);
  return `
    <div class="overlay-backdrop" id="overlayBackdrop">
      <div class="overlay-sheet">
        <p class="overlay-title">Substitute exercise</p>
        <p class="overlay-subtitle">Replacing: ${ex.name}</p>
        ${options.length === 0 ? `
          <p class="overlay-empty mt-4">No alternatives available right now.</p>
        ` : `
          <div class="overlay-options mt-4">
            ${options.map(opt => `
              <button class="overlay-opt" data-sub-id="${opt.id}">
                <p class="overlay-opt-title">${opt.name}</p>
                <p class="overlay-opt-desc">${opt.muscle} · ${opt.sets} sets × ${opt.reps}</p>
              </button>
            `).join('')}
          </div>
        `}
        <button class="btn-secondary w-full mt-3" id="overlayCancel">Cancel</button>
      </div>
    </div>
  `;
}

function bindSessionEvents() {
  const { session, currentIndex, done, skipped } = state;
  const exercises = session.exercises;
  const ex = exercises[currentIndex];
  const allHandled = exercises.every(e => done.has(e.id) || skipped.has(e.id));

  document.getElementById('backBtn')?.addEventListener('click', () => setState({ screen: 'plan' }));

  if (allHandled) {
    document.getElementById('finishBtn')?.addEventListener('click', () => finishSession());
    return;
  }

  document.getElementById('prevBtn')?.addEventListener('click', () => {
    if (currentIndex > 0) setState({ currentIndex: currentIndex - 1, overlay: null });
  });
  document.getElementById('nextBtn')?.addEventListener('click', () => {
    if (currentIndex < exercises.length - 1) setState({ currentIndex: currentIndex + 1, overlay: null });
  });
  document.getElementById('doneBtn')?.addEventListener('click', async () => {
    const newDone = new Set(done);
    newDone.add(ex.id);
    state.done = newDone;
    const next = exercises.findIndex((e, i) => i > currentIndex && !newDone.has(e.id) && !skipped.has(e.id));
    state.currentIndex = next >= 0 ? next : currentIndex;
    await persistSessionProgress();
    render();
  });
  document.getElementById('undoneBtn')?.addEventListener('click', async () => {
    const newDone = new Set(done);
    newDone.delete(ex.id);
    state.done = newDone;
    await persistSessionProgress();
    render();
  });
  document.getElementById('skipBtn')?.addEventListener('click', () => setState({ overlay: 'skip' }));
  document.getElementById('subBtn')?.addEventListener('click', () => setState({ overlay: 'substitute' }));

  if (state.overlay) {
    document.getElementById('overlayCancel')?.addEventListener('click', () => setState({ overlay: null }));
    document.getElementById('overlayBackdrop')?.addEventListener('click', e => {
      if (e.target.id === 'overlayBackdrop') setState({ overlay: null });
    });

    if (state.overlay === 'skip') {
      document.getElementById('skipOnceBtn')?.addEventListener('click', async () => {
        const newSkipped = new Set(skipped);
        newSkipped.add(ex.id);
        state.skipped = newSkipped;
        const next = exercises.findIndex((e, i) => i > currentIndex && !done.has(e.id) && !newSkipped.has(e.id));
        state.currentIndex = next >= 0 ? next : currentIndex;
        state.overlay = null;
        await persistSessionProgress();
        render();
      });
      document.getElementById('skipForeverBtn')?.addEventListener('click', async () => {
        const newSkipped = new Set(skipped);
        newSkipped.add(ex.id);
        state.skipped = newSkipped;
        await banExercise(state.user.uid, ex.id);
        state.bannedExercises = [...state.bannedExercises, ex.id];
        const next = exercises.findIndex((e, i) => i > currentIndex && !done.has(e.id) && !newSkipped.has(e.id));
        state.currentIndex = next >= 0 ? next : currentIndex;
        state.overlay = null;
        await persistSessionProgress();
        render();
      });
    }

    if (state.overlay === 'substitute') {
      document.querySelectorAll('[data-sub-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const subId = btn.dataset.subId;
          const split = WEEKLY_SPLIT[getTodayDayOfWeek()];
          const allPool = [...split.pool, ...(split.corePool || [])];
          const subEx = allPool.find(e => e.id === subId);
          if (!subEx) return;
          const newExercises = [...exercises];
          newExercises[currentIndex] = subEx;
          state.session = { ...session, exercises: newExercises };
          state.overlay = null;
          await persistSessionProgress();
          render();
        });
      });
    }
  }
}

async function persistSessionProgress() {
  await saveWorkoutSession(state.user.uid, {
    ...state.savedSession,
    completedExercises: [...state.done],
    skippedExercises: [...state.skipped],
    exerciseIds: state.session.exercises.map(e => e.id)
  });
}

async function finishSession() {
  const sessionData = {
    ...state.savedSession,
    completedExercises: [...state.done],
    skippedExercises: [...state.skipped],
    exerciseCount: state.session.exercises.length
  };
  await completeWorkoutSession(state.user.uid, sessionData);
  state.savedSession = { ...sessionData, status: 'complete' };
  state.streak += 1;
  // Completing a session clears the grace day banner (it was already preserved)
  state.graceDayDismissed = true;
  setState({ screen: 'complete' });
}

// ─── Screen: Complete ─────────────────────────────────────────────────────────

function renderComplete() {
  const { session, done, skipped, streak } = state;
  const messages = [
    "That&#39;s the work done. Your body will thank you.",
    "Strong session. Rest and nourish well today.",
    "You showed up. That&#39;s the most important part.",
    "Consistent effort, beautiful results.",
    "Done and done. Now go be kind to yourself."
  ];
  const message = pickByDaySeed(messages);
  const streakCopy = getStreakBadgeCopy(streak);

  return `
    <main class="view-scroll">
      <div class="view-inner">
        <div class="complete-screen">
          <div class="complete-icon">✦</div>
          <h1 class="complete-title">Session complete</h1>
          <p class="complete-message">${message}</p>

          <div class="complete-stats mt-6">
            <div class="complete-stat">
              <p class="complete-stat-value">${done.size}</p>
              <p class="complete-stat-label">Done</p>
            </div>
            ${skipped.size > 0 ? `
              <div class="complete-stat-divider"></div>
              <div class="complete-stat">
                <p class="complete-stat-value">${skipped.size}</p>
                <p class="complete-stat-label">Skipped</p>
              </div>
            ` : ''}
            ${streak > 0 ? `
              <div class="complete-stat-divider"></div>
              <div class="complete-stat">
                <p class="complete-stat-value">${streak} 🔥</p>
                <p class="complete-stat-label">Streak</p>
              </div>
            ` : ''}
          </div>

          ${streakCopy ? `<p class="complete-streak-copy mt-3">${streakCopy}</p>` : ''}

          <div class="complete-exercise-recap mt-6">
            ${session.exercises.map(ex => `
              <div class="recap-row">
                <span class="recap-check">${done.has(ex.id) ? '✓' : skipped.has(ex.id) ? '–' : '·'}</span>
                <span class="recap-name ${skipped.has(ex.id) ? 'recap-name--skipped' : ''}">${ex.name}</span>
                <span class="recap-sets">${ex.sets} × ${ex.reps}</span>
              </div>
            `).join('')}
          </div>

          <button class="btn-primary w-full mt-6" id="doneBtn">Back to workouts</button>
        </div>
      </div>
    </main>
  `;
}

function bindCompleteEvents() {
  document.getElementById('doneBtn')?.addEventListener('click', () => setState({ screen: 'plan' }));
}

// ─── Render dispatcher ────────────────────────────────────────────────────────

function render() {
  if (!state.container) return;
  switch (state.screen) {
    case 'plan':     state.container.innerHTML = renderPlan();     bindPlanEvents();     break;
    case 'session':  state.container.innerHTML = renderSession();  bindSessionEvents();  break;
    case 'complete': state.container.innerHTML = renderComplete(); bindCompleteEvents(); break;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export const WorkoutsView = {
  async init(container, user) {
    container.innerHTML = '<div class="loading-state"><p>Loading your workout\u2026</p></div>';
    const [savedSession, streakResult, bannedExercises] = await Promise.all([
      getTodayWorkoutSession(user.uid),
      getWorkoutStreak(user.uid),
      getBannedExercises(user.uid)
    ]);

    // streakResult is now { streak, hadGraceDay, graceDayUsedOn }
    const { streak, hadGraceDay, graceDayUsedOn } = streakResult;

    state = {
      screen: 'plan', mode: savedSession?.mode || null,
      session: null, currentIndex: 0,
      done: new Set(savedSession?.completedExercises || []),
      skipped: new Set(savedSession?.skippedExercises || []),
      savedSession, streak, hadGraceDay, graceDayUsedOn,
      graceDayDismissed: false,
      bannedExercises, user, container, overlay: null
    };
    render();
  }
};
