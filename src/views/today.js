/**
 * today.js — Grounded Today View (Adaptive 3-State)
 *
 * Single emotional surface. No navigation. No choices. No reveal.
 * States: SURVIVAL | LOW_CAPACITY | STABLE
 * Default: LOW_CAPACITY. Works at 3AM. No user input required.
 *
 * Phase 2: state resolution delegated to stateEngine.js.
 *          Presence layer, usage signals, and weekly reflection
 *          are invoked fire-and-forget after render.
 */

import { getLastActiveGap, touchLastActive } from '../services/lastSeen.js';
import { getTodayWellnessCheckin }           from '../services/wellness.js';
import { getHabitLog, HABITS }               from '../services/habits.js';
import { getTodayWorkoutSession }            from '../services/workouts.js';
import { getTodayKey, getTodayDisplay }      from '../utils.js';
import { db }                                from '../lib/firebase.js';
import { doc, setDoc, serverTimestamp }      from 'firebase/firestore';

// ─── Phase 2 services ─────────────────────────────────────────────────────────

import {
  resolveAndPersistState,
  isNightWindow,
  STATES,
} from '../services/stateEngine.js';

import { recordAppOpen }                     from '../services/usageSignals.js';
import { evaluatePresence }                  from '../services/presenceEngine.js';
import {
  sendPresenceNotification,
  maybeSendNightNotification,
}                                            from '../services/notificationService.js';
import { maybeGenerateWeeklyReflection }     from '../services/reflectionEngine.js';

// ─── Re-exports (backward compatibility) ─────────────────────────────────────
// Other modules that import TODAY_STATES or isNightWindow from today.js
// continue to work without changes.

export const TODAY_STATES = STATES;
export { isNightWindow };

// ─── Copy ─────────────────────────────────────────────────────────────────────
// Fixed strings per state. Guidance is embedded in reassurance — not separate.

const COPY = {
  [STATES.SURVIVAL]: {
    headline:    'Today is a survival day',
    reassurance: 'Nothing about today needs to be perfect.',
    status:      'Today has been reduced.',
  },
  [STATES.LOW_CAPACITY]: {
    headline:    'Take it gently today',
    reassurance: 'One small thing is enough. A short stretch might help.',
    status:      'Only what matters is kept.',
  },
  [STATES.STABLE]: {
    headline:    'You might have a little more space today',
    reassurance: 'If it feels right, a bit of fresh air could help.',
    status:      'A little more space is here.',
  },
};

const NIGHT_COPY = {
  headline:    'Still here with you',
  reassurance: 'Nothing needs doing. Rest if you can.',
  status:      null,
};

// ─── Analytics ────────────────────────────────────────────────────────────────

async function logTodayEvent(userId, event, meta = {}) {
  try {
    const key = `${getTodayKey()}_${Date.now()}`;
    await setDoc(
      doc(db, 'users', userId, 'todayEvents', key),
      { event, ts: serverTimestamp(), ...meta }
    );
  } catch {
    // Non-critical — swallow silently
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────

/**
 * Render the Today surface.
 *
 * @param {{ state: string, isNight: boolean }} opts
 * @returns {string}
 */
export function renderToday({ state, isNight }) {
  const copy = isNight ? NIGHT_COPY : COPY[state];

  // Date shown in LOW_CAPACITY and STABLE only — not in SURVIVAL or night
  const showDate = !isNight && state !== STATES.SURVIVAL;

  return `
    <main class="view-scroll today-surface${isNight ? ' today-surface--night' : ''}">
      <div class="view-inner today-inner">

        <header class="today-header">
          ${showDate ? `<p class="today-eyebrow">${getTodayDisplay()}</p>` : ''}
          <h1 class="today-headline">${copy.headline}</h1>
          <p class="today-reassurance">${copy.reassurance}</p>
          ${copy.status ? `<p class="today-status">${copy.status}</p>` : ''}
        </header>

      </div>
    </main>
  `;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export const TodayView = {
  async init(container, user) {
    container.innerHTML = '<div class="loading-state"><p>\u2026</p></div>';

    const now      = new Date();
    const todayKey = getTodayKey();

    // Critical path — needed for state resolution
    const [
      { gapHours },
      todayHabits,
    ] = await Promise.all([
      getLastActiveGap(user.uid),
      getHabitLog(user.uid, todayKey).catch(() => ({})),
    ]);

    // Fire-and-forget reads — warm caches without blocking render
    getTodayWellnessCheckin(user.uid).catch(() => null);
    getTodayWorkoutSession(user.uid).catch(() => null);

    // Touch lastActive (once per session, debounced inside)
    touchLastActive(user.uid);

    // Phase 2: record passive usage signal (once per session)
    recordAppOpen(user.uid).catch(() => null);

    // Legacy analytics
    logTodayEvent(user.uid, 'app_open', { hour: now.getHours() });

    // Compute habits ratio for state engine
    const habitsDoneRatio = HABITS.length > 0
      ? HABITS.filter(h => todayHabits[h.id] === true).length / HABITS.length
      : 0;

    // Phase 2: resolve state via engine (smoothing + persistence included)
    // SURVIVAL fires immediately from night window — no smoothing gate applied.
    const { state, isNight } = await resolveAndPersistState(
      user.uid,
      { gapHours, habitsDoneRatio },
      now
    );

    // ── Render immediately ────────────────────────────────────────────────────
    container.innerHTML = renderToday({ state, isNight });

    logTodayEvent(user.uid, 'today_render', { state, isNight });

    // ── Phase 2: presence layer — all fire-and-forget, never re-renders ───────

    // Night open: SURVIVAL triggers immediately, no suppression gate
    if (isNight) {
      maybeSendNightNotification(user.uid).catch(() => null);
    } else {
      // Non-night presence evaluation (suppression-aware)
      evaluatePresence(user.uid, { gapHours, state, nightOpen: false }, now)
        .then(trigger => {
          if (trigger) {
            sendPresenceNotification(user.uid, trigger, state).catch(() => null);
          }
        })
        .catch(() => null);
    }

    // Weekly reflection — runs Sundays only, once per week
    maybeGenerateWeeklyReflection(user.uid).catch(() => null);
  },
};
