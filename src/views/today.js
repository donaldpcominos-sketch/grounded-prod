/**
 * today.js — Grounded Today View (Adaptive 3-State)
 *
 * Single emotional surface. No navigation. No choices. No reveal.
 * States: SURVIVAL | LOW_CAPACITY | STABLE
 * Default: LOW_CAPACITY. Works at 3AM. No user input required.
 */

import { getLastActiveGap, touchLastActive } from '../services/lastSeen.js';
import { getTodayWellnessCheckin } from '../services/wellness.js';
import { getHabitLog, HABITS } from '../services/habits.js';
import { getTodayWorkoutSession } from '../services/workouts.js';
import { getTodayKey, getTodayDisplay } from '../utils.js';
import { db } from '../lib/firebase.js';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

// ─── State machine ─────────────────────────────────────────────────────────────

export const TODAY_STATES = Object.freeze({
  SURVIVAL:     'SURVIVAL',
  LOW_CAPACITY: 'LOW_CAPACITY',
  STABLE:       'STABLE',
});

/**
 * Returns true if current time is in the night window (00:00–05:00).
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isNightWindow(now = new Date()) {
  const h = now.getHours();
  return h >= 0 && h < 5;
}

/**
 * Infer Today state from passive signals only.
 * Default is LOW_CAPACITY. STABLE requires clear positive engagement.
 * SURVIVAL for night window and strong absence signals.
 *
 * @param {{ gapHours: number, habitsDoneRatio: number }} signals
 * @param {Date} [now]
 * @returns {string} TODAY_STATES value
 */
export function inferTodayState(signals, now = new Date()) {
  const { gapHours = 0, habitsDoneRatio = 0 } = signals;

  if (isNightWindow(now))      return TODAY_STATES.SURVIVAL;
  if (gapHours > 5 * 24)      return TODAY_STATES.SURVIVAL;
  if (gapHours > 2 * 24)      return TODAY_STATES.LOW_CAPACITY;
  if (habitsDoneRatio >= 0.6)  return TODAY_STATES.STABLE;

  return TODAY_STATES.LOW_CAPACITY;
}

// ─── Copy ─────────────────────────────────────────────────────────────────────
// Fixed strings per state. Guidance is embedded in reassurance — not separate.

const COPY = {
  [TODAY_STATES.SURVIVAL]: {
    headline:    'Today is a survival day',
    reassurance: 'Nothing about today needs to be perfect.',
  },
  [TODAY_STATES.LOW_CAPACITY]: {
    headline:    'Take it gently today',
    reassurance: 'One small thing is enough. A short stretch might help.',
  },
  [TODAY_STATES.STABLE]: {
    headline:    'You might have a little more space today',
    reassurance: 'If it feels right, a bit of fresh air could help.',
  },
};

const NIGHT_COPY = {
  headline:    'Still here with you',
  reassurance: 'Nothing needs doing. Rest if you can.',
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

// ─── Cached daily state ───────────────────────────────────────────────────────

async function writeCachedTodayState(userId, state) {
  try {
    await setDoc(
      doc(db, 'users', userId, 'todayState', getTodayKey()),
      { state, computedAt: serverTimestamp() },
      { merge: true }
    );
  } catch {
    // Non-critical
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
  const showDate = !isNight && state !== TODAY_STATES.SURVIVAL;

  return `
    <main class="view-scroll today-surface${isNight ? ' today-surface--night' : ''}">
      <div class="view-inner today-inner">

        <header class="today-header">
          ${showDate ? `<p class="today-eyebrow">${getTodayDisplay()}</p>` : ''}
          <h1 class="today-headline">${copy.headline}</h1>
          <p class="today-reassurance">${copy.reassurance}</p>
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

    const [
      { gapHours },
      todayHabits,
    ] = await Promise.all([
      getLastActiveGap(user.uid),
      getHabitLog(user.uid, todayKey).catch(() => ({})),
    ]);

    // Fire-and-forget — do not block render
    getTodayWellnessCheckin(user.uid).catch(() => null);
    getTodayWorkoutSession(user.uid).catch(() => null);

    touchLastActive(user.uid);
    logTodayEvent(user.uid, 'app_open', { hour: now.getHours() });

    const habitsDoneRatio = HABITS.length > 0
      ? HABITS.filter(h => todayHabits[h.id] === true).length / HABITS.length
      : 0;

    const state   = inferTodayState({ gapHours, habitsDoneRatio }, now);
    const isNight = isNightWindow(now);

    writeCachedTodayState(user.uid, state);

    container.innerHTML = renderToday({ state, isNight });

    logTodayEvent(user.uid, 'today_render', { state, isNight });
  },
};
