/**
 * services/usageSignals.js — Passive Signal Collection
 *
 * Collects passive behavioural signals for the state engine.
 * No user input. Never surfaces to the UI.
 *
 * Writes to: users/{userId}/dailySignals/{dateKey}
 *
 * Signals collected:
 *   - appOpenHour      — hour of first app open today
 *   - appOpenCount     — number of opens today
 *   - lastSeenAt       — ISO timestamp of last open
 *   - nightOpen        — boolean: opened during night window (00:00–05:00)
 */

import { db } from '../lib/firebase.js';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { getTodayKey } from '../utils.js';
import { isNightWindow } from './stateEngine.js';

// ─── Session guard (write once per JS session) ────────────────────────────────

let _signalWrittenThisSession = false;

/**
 * Record a passive app-open signal.
 * Merges into dailySignals/{todayKey} — safe to call multiple times,
 * but only fires a Firestore write once per JS session.
 *
 * @param {string} userId
 */
export async function recordAppOpen(userId) {
  if (_signalWrittenThisSession) return;
  _signalWrittenThisSession = true;

  const now     = new Date();
  const dateKey = getTodayKey();
  const ref     = doc(db, 'users', userId, 'dailySignals', dateKey);

  try {
    // Read current count so we can increment
    const snap = await getDoc(ref);
    const existing = snap.exists() ? snap.data() : {};
    const prevCount = typeof existing.appOpenCount === 'number' ? existing.appOpenCount : 0;

    await setDoc(ref, {
      dateKey,
      appOpenHour:   existing.appOpenHour ?? now.getHours(),
      appOpenCount:  prevCount + 1,
      lastSeenAt:    serverTimestamp(),
      nightOpen:     existing.nightOpen === true || isNightWindow(now),
    }, { merge: true });
  } catch {
    // Non-critical — swallow silently
  }
}

/**
 * Read today's daily signals document.
 * Returns a partial signals object — callers must handle missing keys.
 *
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getDailySignals(userId) {
  try {
    const snap = await getDoc(
      doc(db, 'users', userId, 'dailySignals', getTodayKey())
    );
    return snap.exists() ? snap.data() : {};
  } catch {
    return {};
  }
}
