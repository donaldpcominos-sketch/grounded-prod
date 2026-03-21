/**
 * services/stateEngine.js — State Engine v2
 *
 * Passive signal collection, state inference, smoothing, confidence thresholds.
 * Called from today.js. Writes to users/{userId}/todayState/{dateKey}.
 * No user input. No ML. Rules-based only.
 *
 * State hierarchy (conservative):
 *   SURVIVAL      — immediate: night window OR hard absence signal
 *   LOW_CAPACITY  — default when evidence is weak
 *   STABLE        — requires multiple positive signals + smoothing
 */

import { db } from '../lib/firebase.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getTodayKey } from '../utils.js';

// ─── Constants ────────────────────────────────────────────────────────────────

export const STATES = Object.freeze({
  SURVIVAL:     'SURVIVAL',
  LOW_CAPACITY: 'LOW_CAPACITY',
  STABLE:       'STABLE',
});

// Confidence thresholds — STABLE requires passing all three
const STABLE_THRESHOLDS = {
  minHabitRatio:    0.6,   // at least 60% of habits done
  maxGapHours:      36,    // seen within 1.5 days
  minSmoothScore:   1,     // at least 1 previous stable/low_capacity day in last 3
};

// Night window: 00:00–05:00
const NIGHT_HOUR_START = 0;
const NIGHT_HOUR_END   = 5;

// Absence thresholds
const SURVIVAL_GAP_HOURS     = 5 * 24;  // 5 days unseen → SURVIVAL
const LOW_CAPACITY_GAP_HOURS = 2 * 24;  // 2 days unseen → LOW_CAPACITY floor

// ─── Night window ─────────────────────────────────────────────────────────────

export function isNightWindow(now = new Date()) {
  const h = now.getHours();
  return h >= NIGHT_HOUR_START && h < NIGHT_HOUR_END;
}

// ─── Smoothing: read last N daily states ─────────────────────────────────────

async function getRecentStates(userId, daysBack = 3) {
  const results = [];
  const now = new Date();
  for (let i = 1; i <= daysBack; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    try {
      const snap = await getDoc(doc(db, 'users', userId, 'todayState', key));
      if (snap.exists()) {
        results.push(snap.data().state || STATES.LOW_CAPACITY);
      }
    } catch {
      // Non-critical — treat as no data
    }
  }
  return results;
}

/**
 * Smoothing score: count of recent days that were not SURVIVAL.
 * Used to prevent STABLE from snapping on after a hard run.
 */
function computeSmoothScore(recentStates) {
  return recentStates.filter(s => s !== STATES.SURVIVAL).length;
}

// ─── Core inference ───────────────────────────────────────────────────────────

/**
 * Infer state from passive signals.
 *
 * @param {{
 *   gapHours: number,
 *   habitsDoneRatio: number,
 *   smoothScore: number,
 * }} signals
 * @param {Date} now
 * @returns {string} STATES value
 */
export function inferState(signals, now = new Date()) {
  const { gapHours = 0, habitsDoneRatio = 0, smoothScore = 0 } = signals;

  // SURVIVAL — immediate triggers
  if (isNightWindow(now))                 return STATES.SURVIVAL;
  if (gapHours >= SURVIVAL_GAP_HOURS)     return STATES.SURVIVAL;

  // LOW_CAPACITY floor from absence
  if (gapHours >= LOW_CAPACITY_GAP_HOURS) return STATES.LOW_CAPACITY;

  // STABLE — requires multiple positive signals AND smoothing
  if (
    habitsDoneRatio >= STABLE_THRESHOLDS.minHabitRatio &&
    gapHours       <  STABLE_THRESHOLDS.maxGapHours    &&
    smoothScore    >= STABLE_THRESHOLDS.minSmoothScore
  ) {
    return STATES.STABLE;
  }

  return STATES.LOW_CAPACITY;
}

// ─── Firestore: read/write todayState ────────────────────────────────────────

/**
 * Read the cached todayState for today (if it exists and is recent enough).
 * Returns null if missing or stale (> 4 hours old).
 */
export async function getCachedTodayState(userId) {
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'todayState', getTodayKey()));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (!data.computedAt) return null;
    const age = Date.now() - data.computedAt.toDate().getTime();
    if (age > 4 * 60 * 60 * 1000) return null; // stale after 4h
    return data.state || null;
  } catch {
    return null;
  }
}

/**
 * Write the resolved state to todayState and dailySignals.
 *
 * todayState/{dateKey}   — current state + metadata
 * dailySignals/{dateKey} — passive signal snapshot for aggregation
 */
export async function writeTodayState(userId, state, signals = {}) {
  const dateKey = getTodayKey();
  const now = new Date();

  // Write resolved state
  try {
    await setDoc(
      doc(db, 'users', userId, 'todayState', dateKey),
      {
        state,
        computedAt: serverTimestamp(),
        hour: now.getHours(),
        isNight: isNightWindow(now),
        ...( signals.gapHours     !== undefined && { gapHours:        signals.gapHours }),
        ...( signals.habitsDoneRatio !== undefined && { habitsDoneRatio: signals.habitsDoneRatio }),
      },
      { merge: true }
    );
  } catch {
    // Non-critical
  }

  // Write daily signals snapshot (additive — never overwrites prior keys)
  try {
    await setDoc(
      doc(db, 'users', userId, 'dailySignals', dateKey),
      {
        dateKey,
        lastUpdated: serverTimestamp(),
        gapHours:         signals.gapHours         ?? null,
        habitsDoneRatio:  signals.habitsDoneRatio   ?? null,
        resolvedState:    state,
      },
      { merge: true }
    );
  } catch {
    // Non-critical
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Compute and persist today's state from raw signals.
 *
 * @param {string} userId
 * @param {{ gapHours: number, habitsDoneRatio: number }} rawSignals
 * @param {Date} [now]
 * @returns {Promise<{ state: string, isNight: boolean }>}
 */
export async function resolveAndPersistState(userId, rawSignals, now = new Date()) {
  // Fetch smoothing context in background (non-blocking for initial render)
  let smoothScore = 0;
  try {
    const recent = await getRecentStates(userId, 3);
    smoothScore = computeSmoothScore(recent);
  } catch {
    smoothScore = 0;
  }

  const signals = { ...rawSignals, smoothScore };
  const state   = inferState(signals, now);
  const isNight = isNightWindow(now);

  // Fire-and-forget persist
  writeTodayState(userId, state, rawSignals).catch(() => null);

  return { state, isNight, signals };
}
