/**
 * services/historyStore.js — Daily History Snapshot Store
 *
 * Phase 3: Writes one lightweight snapshot per day capturing resolved state
 * and passive usage signals. Reads recent snapshots for pattern derivation.
 *
 * Writes to: users/{userId}/dailyHistory/{dateKey}
 * Reads:     users/{userId}/dailyHistory/{dateKey} (last 7 days)
 *
 * Schema per document:
 *   dateKey         string   — "YYYY-MM-DD"
 *   resolvedState   string   — SURVIVAL | LOW_CAPACITY | STABLE
 *   habitsDoneRatio number   — 0.0–1.0
 *   gapHours        number   — hours since last active
 *   nightOpen       boolean  — opened during night window
 *   appOpenCount    number   — opens logged today
 *   writtenAt       timestamp
 *
 * Rules:
 * - One write per day (merge: true — safe to call multiple times)
 * - Read at most 7 documents per session
 * - Never blocks render
 */

import { db } from '../lib/firebase.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getTodayKey } from '../utils.js';

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Persist today's resolved state and signals as a daily snapshot.
 * Called fire-and-forget from today.js after state resolution.
 *
 * @param {string} userId
 * @param {{ resolvedState: string, habitsDoneRatio: number, gapHours: number, nightOpen: boolean, appOpenCount: number }} snapshot
 */
export async function writeDailySnapshot(userId, snapshot) {
  const dateKey = getTodayKey();
  try {
    await setDoc(
      doc(db, 'users', userId, 'dailyHistory', dateKey),
      {
        dateKey,
        resolvedState:   snapshot.resolvedState   ?? null,
        habitsDoneRatio: snapshot.habitsDoneRatio  ?? null,
        gapHours:        snapshot.gapHours         ?? null,
        nightOpen:       snapshot.nightOpen        ?? false,
        appOpenCount:    snapshot.appOpenCount      ?? 1,
        writtenAt:       serverTimestamp(),
      },
      { merge: true }
    );
  } catch {
    // Non-critical
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Read the last N days of daily history snapshots (not including today).
 * Returns an array of snapshot objects, oldest-first.
 * Missing days are skipped — callers must handle sparse data.
 *
 * @param {string} userId
 * @param {number} [daysBack=7]
 * @returns {Promise<Array<object>>}
 */
export async function getRecentHistory(userId, daysBack = 7) {
  const results = [];
  const now = new Date();

  for (let i = 1; i <= daysBack; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    try {
      const snap = await getDoc(doc(db, 'users', userId, 'dailyHistory', key));
      if (snap.exists()) results.push(snap.data());
    } catch {
      // Skip — non-critical
    }
  }

  // Return oldest-first
  return results.reverse();
}
