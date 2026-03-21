/**
 * services/reflectionEngine.js — Weekly Reflection Engine
 *
 * 7-day aggregation of daily signals. Generates observational reflections.
 * No stats, no analytics tone, no CTA. Delivered at most once per week.
 *
 * Reads:  users/{userId}/dailySignals/{dateKey}
 * Writes: users/{userId}/reflections/{weekKey}
 *         users/{userId}/presence/config  (lastReflectionKey)
 *
 * Phase 3:
 * - maybeGenerateWeeklyReflection accepts { continuityTag, tone } context
 * - generateReflection uses continuityTag as primary selection signal
 * - All selection is deterministic — no randomness
 */

import { db } from '../lib/firebase.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getTodayKey } from '../utils.js';
import { STATES } from './stateEngine.js';
import { CONTINUITY_TAGS } from './patternEngine.js';
import { shouldFireWeeklyReflection } from './presenceEngine.js';
import { sendReflectionNotification } from './notificationService.js';

// ─── Reflection copy ──────────────────────────────────────────────────────────

const REFLECTION_BY_TAG = {
  [CONTINUITY_TAGS.SUSTAINED_HARD]:   'It\'s been a heavy week.',
  [CONTINUITY_TAGS.IMPROVING]:        'It\'s been a little lighter.',
  [CONTINUITY_TAGS.DECLINING]:        'It\'s been an uneven week.',
  [CONTINUITY_TAGS.SUSTAINED_STABLE]: 'It\'s been a steadier week.',
  [CONTINUITY_TAGS.NEUTRAL]:          'Another week has passed.',
};

const REFLECTION_BY_SIGNAL = {
  mostlySurvival: 'It\'s been a heavy week.',
  mostlyStable:   'It\'s been a steadier week.',
  mixed:          'It\'s been an uneven week.',
  default:        'Another week has passed.',
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getWeekKey(now = new Date()) {
  const d = new Date(now);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getLast7DateKeys(now = new Date()) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

// ─── Signal aggregation ───────────────────────────────────────────────────────

async function aggregateWeekSignals(userId) {
  const keys    = getLast7DateKeys();
  const results = [];

  for (const key of keys) {
    try {
      const snap = await getDoc(doc(db, 'users', userId, 'dailySignals', key));
      if (snap.exists()) results.push(snap.data());
    } catch {
      // Skip missing days — non-critical
    }
  }

  return results;
}

// ─── Reflection generation ────────────────────────────────────────────────────

/**
 * @param {Array} weekSignals
 * @param {{ continuityTag?: string }} [context]
 * @returns {string}
 */
export function generateReflection(weekSignals, context = {}) {
  const tag = context.continuityTag;

  // Primary: tag-based — skip NEUTRAL to allow signal-based resolution below
  if (tag && tag !== CONTINUITY_TAGS.NEUTRAL && REFLECTION_BY_TAG[tag]) {
    return REFLECTION_BY_TAG[tag];
  }

  // Fallback: signal ratio
  if (weekSignals.length === 0) return REFLECTION_BY_SIGNAL.default;

  const states = weekSignals.map(s => s.resolvedState).filter(Boolean);
  if (states.length === 0) return REFLECTION_BY_SIGNAL.default;

  const total         = states.length;
  const survivalCount = states.filter(s => s === STATES.SURVIVAL).length;
  const stableCount   = states.filter(s => s === STATES.STABLE).length;

  if (survivalCount / total >= 0.5) return REFLECTION_BY_SIGNAL.mostlySurvival;
  if (stableCount   / total >= 0.5) return REFLECTION_BY_SIGNAL.mostlyStable;

  return REFLECTION_BY_SIGNAL.mixed;
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

async function getLastReflectionKey(userId) {
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'presence', 'config'));
    return snap.exists() ? (snap.data().lastReflectionKey || null) : null;
  } catch {
    return null;
  }
}

async function saveReflection(userId, weekKey, text, signalCount) {
  const dateKey = getTodayKey();
  try {
    await setDoc(
      doc(db, 'users', userId, 'reflections', weekKey),
      {
        weekKey,
        text,
        dayCount:  signalCount,
        dateKey,
        createdAt: serverTimestamp(),
      }
    );
    await setDoc(
      doc(db, 'users', userId, 'presence', 'config'),
      { lastReflectionKey: dateKey },
      { merge: true }
    );
  } catch {
    // Non-critical
  }
}

// ─── Main entry ───────────────────────────────────────────────────────────────

/**
 * @param {string} userId
 * @param {{ continuityTag?: string, tone?: string }} [context]
 */
export async function maybeGenerateWeeklyReflection(userId, context = {}) {
  try {
    const lastKey = await getLastReflectionKey(userId);
    if (!shouldFireWeeklyReflection(lastKey)) return;

    const weekSignals = await aggregateWeekSignals(userId);
    const text        = generateReflection(weekSignals, context);
    const weekKey     = getWeekKey();

    await saveReflection(userId, weekKey, text, weekSignals.length);
    await sendReflectionNotification(userId, text);
  } catch {
    // Non-critical — never surfaces to user
  }
}
