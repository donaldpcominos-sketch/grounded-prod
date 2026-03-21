/**
 * services/reflectionEngine.js — Weekly Reflection Engine
 *
 * 7-day aggregation of daily signals. Generates observational reflections.
 * No stats, no analytics tone, no CTA. Delivered at most once per week.
 *
 * Reads:  users/{userId}/dailySignals/{dateKey}
 * Writes: users/{userId}/reflections/{weekKey}
 *         users/{userId}/presence/config  (lastReflectionKey)
 */

import { db } from '../lib/firebase.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getTodayKey } from '../utils.js';
import { STATES } from './stateEngine.js';
import { shouldFireWeeklyReflection } from './presenceEngine.js';
import { sendReflectionNotification } from './notificationService.js';

// ─── Reflection copy ──────────────────────────────────────────────────────────
//
// Two lines maximum per category. No variation beyond that.
// No expressive phrasing. No subject performing an action.
// Direct, minimal, non-interpretive.

const REFLECTION_TEMPLATES = {
  mostlySurvival: [
    'It\'s been heavy.',
    'Things have been hard.',
  ],
  mixed: [
    'It\'s been uneven.',
    'It\'s shifted a bit.',
  ],
  mostlyStable: [
    'There\'s been more space.',
    'Things have been steadier.',
  ],
  default: [
    'Time has passed.',
  ],
};

// Minimal alternation — not content rotation, just avoids exact repetition.
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Returns an ISO-ish week key like "2025-W03".
 */
function getWeekKey(now = new Date()) {
  const d = new Date(now);
  const day = d.getDay() || 7; // make Sunday = 7
  d.setDate(d.getDate() - day + 1); // move to Monday
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
 * Choose an observational reflection sentence based on the week's signal pattern.
 * No counts, no percentages, no analytics language.
 * Exported so notificationService can receive the text directly.
 *
 * @param {Array} weekSignals
 * @returns {string}
 */
export function generateReflection(weekSignals) {
  if (weekSignals.length === 0) return pickRandom(REFLECTION_TEMPLATES.default);

  const states = weekSignals.map(s => s.resolvedState).filter(Boolean);
  if (states.length === 0) return pickRandom(REFLECTION_TEMPLATES.default);

  const total         = states.length;
  const survivalCount = states.filter(s => s === STATES.SURVIVAL).length;
  const stableCount   = states.filter(s => s === STATES.STABLE).length;

  if (survivalCount / total >= 0.5) return pickRandom(REFLECTION_TEMPLATES.mostlySurvival);
  if (stableCount   / total >= 0.5) return pickRandom(REFLECTION_TEMPLATES.mostlyStable);

  return pickRandom(REFLECTION_TEMPLATES.mixed);
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
    // Write the reflection document
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

    // Update last reflection key so we don't resend this week
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
 * Run the weekly reflection pipeline if today is Sunday and one hasn't
 * been sent this week yet.
 *
 * Call from today.js init — fire-and-forget, never blocks render.
 *
 * @param {string} userId
 */
export async function maybeGenerateWeeklyReflection(userId) {
  try {
    const lastKey = await getLastReflectionKey(userId);
    if (!shouldFireWeeklyReflection(lastKey)) return;

    const weekSignals = await aggregateWeekSignals(userId);
    const text        = generateReflection(weekSignals);
    const weekKey     = getWeekKey();

    await saveReflection(userId, weekKey, text, weekSignals.length);

    // Pass generated text directly into notification body — no placeholder copy
    await sendReflectionNotification(userId, text);
  } catch {
    // Non-critical — never surfaces to user
  }
}
