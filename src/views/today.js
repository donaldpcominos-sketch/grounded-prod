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
 *
 * Phase 3: continuityTag resolved from stateEngine and passed into renderToday.
 *          Copy varies deterministically by state × continuityTag.
 *          Layout, structure, and element count are unchanged.
 *          Daily history snapshot written fire-and-forget.
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

import { recordAppOpen, getDailySignals }    from '../services/usageSignals.js';
import { evaluatePresence }                  from '../services/presenceEngine.js';
import {
  sendPresenceNotification,
  maybeSendNightNotification,
}                                            from '../services/notificationService.js';
import { maybeGenerateWeeklyReflection }     from '../services/reflectionEngine.js';

// ─── Phase 3 services ─────────────────────────────────────────────────────────

import { writeDailySnapshot }                from '../services/historyStore.js';
import { CONTINUITY_TAGS }                   from '../services/patternEngine.js';

// ─── Re-exports (backward compatibility) ─────────────────────────────────────

export const TODAY_STATES = STATES;
export { isNightWindow };

// ─── Copy map ─────────────────────────────────────────────────────────────────
//
// Structure: COPY[state][continuityTag] → { headline, reassurance, status }
//
// Rules:
//   - headline, reassurance, status only — no new elements, no new concepts
//   - NEUTRAL entries are Phase 2 copy exactly (no regression for new users)
//   - No suggestion-based language. No forward-motion framing.
//   - No implied expectation or improvement.
//   - Everything reads as: this is enough as it is.

const COPY = {

  // ── SURVIVAL ──────────────────────────────────────────────────────────────

  [STATES.SURVIVAL]: {
    [CONTINUITY_TAGS.SUSTAINED_HARD]: {
      headline:    'Today is a survival day',
      reassurance: 'There\'s nothing that needs doing right now.',
      status:      'Today has been reduced.',
    },
    [CONTINUITY_TAGS.IMPROVING]: {
      headline:    'Today is a survival day',
      reassurance: 'Nothing about today needs to be perfect.',
      status:      'Today has been reduced.',
    },
    [CONTINUITY_TAGS.DECLINING]: {
      headline:    'Today is a survival day',
      reassurance: 'Nothing about today needs to be perfect.',
      status:      'Today has been reduced.',
    },
    [CONTINUITY_TAGS.SUSTAINED_STABLE]: {
      headline:    'Today is a survival day',
      reassurance: 'Nothing about today needs to be perfect.',
      status:      'Today has been reduced.',
    },
    [CONTINUITY_TAGS.NEUTRAL]: {
      headline:    'Today is a survival day',
      reassurance: 'Nothing about today needs to be perfect.',
      status:      'Today has been reduced.',
    },
  },

  // ── LOW_CAPACITY ──────────────────────────────────────────────────────────

  [STATES.LOW_CAPACITY]: {
    [CONTINUITY_TAGS.SUSTAINED_HARD]: {
      headline:    'Take it gently today',
      reassurance: 'One small thing is enough.',
      status:      'Only what matters is kept.',
    },
    [CONTINUITY_TAGS.IMPROVING]: {
      headline:    'Take it gently today',
      reassurance: 'One small thing is enough.',
      status:      'Only what matters is kept.',
    },
    [CONTINUITY_TAGS.DECLINING]: {
      headline:    'Take it gently today',
      reassurance: 'One small thing is enough.',
      status:      'Only what matters is kept.',
    },
    [CONTINUITY_TAGS.SUSTAINED_STABLE]: {
      headline:    'Take it gently today',
      reassurance: 'One small thing is enough.',
      status:      'Only what matters is kept.',
    },
    [CONTINUITY_TAGS.NEUTRAL]: {
      headline:    'Take it gently today',
      reassurance: 'One small thing is enough.',
      status:      'Only what matters is kept.',
    },
  },

  // ── STABLE ────────────────────────────────────────────────────────────────

  [STATES.STABLE]: {
    [CONTINUITY_TAGS.SUSTAINED_HARD]: {
      headline:    'You might have a little more space today',
      reassurance: 'There\'s a little more room here.',
      status:      'A little more space is here.',
    },
    [CONTINUITY_TAGS.IMPROVING]: {
      headline:    'There\'s a little more space today',
      reassurance: 'There\'s a little more room here.',
      status:      'A little more space is here.',
    },
    [CONTINUITY_TAGS.DECLINING]: {
      headline:    'You might have a little more space today',
      reassurance: 'There\'s a little more room here.',
      status:      'A little more space is here.',
    },
    [CONTINUITY_TAGS.SUSTAINED_STABLE]: {
      headline:    'There\'s a bit of space here',
      reassurance: 'This is enough as it is.',
      status:      'A little more space is here.',
    },
    [CONTINUITY_TAGS.NEUTRAL]: {
      headline:    'You might have a little more space today',
      reassurance: 'There\'s a little more room here.',
      status:      'A little more space is here.',
    },
  },
};

const NIGHT_COPY = {
  headline:    'Still here with you',
  reassurance: 'Nothing needs doing. Rest if you can.',
  status:      null,
};

// ─── Copy resolution ──────────────────────────────────────────────────────────

/**
 * Resolve the correct copy block from state × continuityTag.
 * Falls back: exact match → NEUTRAL for that state → safe hardcoded default.
 * Never throws.
 *
 * @param {string} state
 * @param {string} continuityTag
 * @returns {{ headline: string, reassurance: string, status: string|null }}
 */
function resolveCopy(state, continuityTag) {
  return (
    COPY[state]?.[continuityTag] ??
    COPY[state]?.[CONTINUITY_TAGS.NEUTRAL] ??
    { headline: 'Take it gently today', reassurance: 'One small thing is enough.', status: null }
  );
}

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
 * Phase 3: accepts continuityTag to resolve contextual copy.
 * Layout is unchanged — same three elements, same structure.
 *
 * @param {{ state: string, isNight: boolean, continuityTag?: string }} opts
 * @returns {string}
 */
export function renderToday({ state, isNight, continuityTag = CONTINUITY_TAGS.NEUTRAL }) {
  const copy = isNight
    ? NIGHT_COPY
    : resolveCopy(state, continuityTag);

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

    // Phase 2+3: resolve state via engine (smoothing + persistence + continuity included)
    const { state, isNight, continuityTag, tone } = await resolveAndPersistState(
      user.uid,
      { gapHours, habitsDoneRatio },
      now
    );

    // ── Render immediately ────────────────────────────────────────────────────
    container.innerHTML = renderToday({ state, isNight, continuityTag });

    logTodayEvent(user.uid, 'today_render', { state, isNight, continuityTag });

    // ── Phase 3: write daily history snapshot ─────────────────────────────────
    (async () => {
      try {
        const signals = await getDailySignals(user.uid);
        await writeDailySnapshot(user.uid, {
          resolvedState:   state,
          habitsDoneRatio,
          gapHours,
          nightOpen:       isNight,
          appOpenCount:    signals.appOpenCount ?? 1,
        });
      } catch {
        // Non-critical
      }
    })();

    // ── Phase 2: presence layer — all fire-and-forget, never re-renders ───────

    if (isNight) {
      maybeSendNightNotification(user.uid).catch(() => null);
    } else {
      evaluatePresence(
        user.uid,
        { gapHours, state, nightOpen: false, continuityTag, tone },
        now
      )
        .then(trigger => {
          if (trigger) {
            sendPresenceNotification(user.uid, trigger, state, { continuityTag, tone }).catch(() => null);
          }
        })
        .catch(() => null);
    }

    // Weekly reflection — runs Sundays only, once per week
    maybeGenerateWeeklyReflection(user.uid, { continuityTag, tone }).catch(() => null);
  },
};
