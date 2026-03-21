/**
 * services/presenceEngine.js — Presence Layer
 *
 * Rules-based trigger evaluation and suppression logic.
 * Determines whether a notification should be sent — not the notification itself.
 *
 * Triggers evaluated:
 *   NIGHT_OPEN     — app opened between 00:00–05:00
 *   LONG_ABSENCE   — gap > 5 days
 *   RETURN_AFTER_ABSENCE — gap 2–5 days, first open today
 *   WEEKLY_REFLECTION — scheduled, once per week
 *
 * Suppression rules:
 *   - Never more than 1 notification in 24h
 *   - Never more than 2 in any 7-day window
 *   - SURVIVAL state suppresses non-NIGHT triggers
 *   - Notification log checked before any trigger fires
 */

import { db } from '../lib/firebase.js';
import { doc, getDoc, collection, query, where, getDocs, serverTimestamp, addDoc } from 'firebase/firestore';
import { getTodayKey } from '../utils.js';
import { STATES, isNightWindow } from './stateEngine.js';

// ─── Trigger types ────────────────────────────────────────────────────────────

export const TRIGGER_TYPES = Object.freeze({
  NIGHT_OPEN:              'NIGHT_OPEN',
  LONG_ABSENCE:            'LONG_ABSENCE',
  RETURN_AFTER_ABSENCE:    'RETURN_AFTER_ABSENCE',
  WEEKLY_REFLECTION:       'WEEKLY_REFLECTION',
});

// ─── Suppression config ───────────────────────────────────────────────────────

const SUPPRESSION = {
  maxPer24h:  1,
  maxPer7d:   2,
  cooldownMs: 23 * 60 * 60 * 1000,  // 23h minimum between notifications
};

// ─── Read notification log ────────────────────────────────────────────────────

/**
 * Read recent notification log entries.
 * @param {string} userId
 * @param {number} daysBack
 * @returns {Promise<Array>}
 */
async function getRecentNotificationLog(userId, daysBack = 7) {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);

    const ref = collection(db, 'users', userId, 'notificationLog');
    const q   = query(ref, where('sentAt', '>=', cutoff));
    const snap = await getDocs(q);

    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

// ─── Suppression check ────────────────────────────────────────────────────────

/**
 * Returns true if suppression rules prevent a notification from firing.
 * @param {Array} recentLog
 * @param {Date} now
 * @returns {boolean}
 */
function isSuppressed(recentLog, now = new Date()) {
  const last24h = now.getTime() - 24 * 60 * 60 * 1000;
  const last7d  = now.getTime() - 7  * 24 * 60 * 60 * 1000;

  const in24h = recentLog.filter(e => {
    const ts = e.sentAt?.toDate ? e.sentAt.toDate().getTime() : 0;
    return ts > last24h;
  });

  const in7d = recentLog.filter(e => {
    const ts = e.sentAt?.toDate ? e.sentAt.toDate().getTime() : 0;
    return ts > last7d;
  });

  if (in24h.length >= SUPPRESSION.maxPer24h) return true;
  if (in7d.length  >= SUPPRESSION.maxPer7d)  return true;

  // Cooldown: check last sent
  if (recentLog.length > 0) {
    const sorted = [...recentLog].sort((a, b) => {
      const ta = a.sentAt?.toDate ? a.sentAt.toDate().getTime() : 0;
      const tb = b.sentAt?.toDate ? b.sentAt.toDate().getTime() : 0;
      return tb - ta;
    });
    const lastTs = sorted[0].sentAt?.toDate ? sorted[0].sentAt.toDate().getTime() : 0;
    if (now.getTime() - lastTs < SUPPRESSION.cooldownMs) return true;
  }

  return false;
}

// ─── Trigger evaluation ───────────────────────────────────────────────────────

/**
 * Evaluate which trigger (if any) should fire given current signals.
 *
 * @param {{
 *   gapHours: number,
 *   state: string,
 *   nightOpen: boolean,
 *   lastReflectionKey: string|null,
 * }} context
 * @param {Date} [now]
 * @returns {string|null} trigger type or null
 */
export function evaluateTrigger(context, now = new Date()) {
  const { gapHours = 0, state, nightOpen = false } = context;

  // Night open — highest priority, fires regardless of state
  if (nightOpen && isNightWindow(now)) {
    return TRIGGER_TYPES.NIGHT_OPEN;
  }

  // Long absence — fire even in SURVIVAL
  if (gapHours >= 5 * 24) {
    return TRIGGER_TYPES.LONG_ABSENCE;
  }

  // Non-survival triggers are suppressed when state is SURVIVAL
  if (state === STATES.SURVIVAL) return null;

  // Return after absence
  if (gapHours >= 2 * 24 && gapHours < 5 * 24) {
    return TRIGGER_TYPES.RETURN_AFTER_ABSENCE;
  }

  return null;
}

// ─── Weekly reflection trigger ────────────────────────────────────────────────

/**
 * Check if the weekly reflection trigger should fire.
 * Fires on Sunday (day 0), once per week, if not already sent this week.
 *
 * @param {string|null} lastReflectionKey  — dateKey of last reflection sent
 * @param {Date} [now]
 * @returns {boolean}
 */
export function shouldFireWeeklyReflection(lastReflectionKey, now = new Date()) {
  if (now.getDay() !== 0) return false; // Sunday only

  if (!lastReflectionKey) return true;

  // Check if already sent this week
  const todayKey = getTodayKey();
  const [ty, tm, td] = todayKey.split('-').map(Number);
  const today = new Date(ty, tm - 1, td);

  const [ry, rm, rd] = lastReflectionKey.split('-').map(Number);
  const lastDate = new Date(ry, rm - 1, rd);

  const diffDays = (today - lastDate) / (1000 * 60 * 60 * 24);
  return diffDays >= 7;
}

// ─── Presence config (optional, from Firestore) ───────────────────────────────

/**
 * Load optional presence config from users/{userId}/presence/config.
 * Falls back to defaults if missing.
 *
 * @param {string} userId
 * @returns {Promise<{ notificationsEnabled: boolean }>}
 */
export async function loadPresenceConfig(userId) {
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'presence', 'config'));
    if (!snap.exists()) return { notificationsEnabled: true };
    return { notificationsEnabled: snap.data().notificationsEnabled !== false };
  } catch {
    return { notificationsEnabled: true };
  }
}

// ─── Log notification ─────────────────────────────────────────────────────────

/**
 * Write a notification log entry.
 * @param {string} userId
 * @param {string} triggerType
 * @param {string} channel  — 'push' | 'silent'
 */
export async function logNotificationSent(userId, triggerType, channel = 'push') {
  try {
    await addDoc(
      collection(db, 'users', userId, 'notificationLog'),
      {
        trigger:  triggerType,
        channel,
        dateKey:  getTodayKey(),
        sentAt:   serverTimestamp(),
      }
    );
  } catch {
    // Non-critical
  }
}

// ─── Main: should notify? ─────────────────────────────────────────────────────

/**
 * Full presence evaluation — suppression-aware.
 * Returns the trigger to act on, or null.
 *
 * @param {string} userId
 * @param {object} context — signals from state engine
 * @param {Date}   [now]
 * @returns {Promise<string|null>}
 */
export async function evaluatePresence(userId, context, now = new Date()) {
  // Check suppression first (cheap exit)
  const recentLog = await getRecentNotificationLog(userId, 7);
  if (isSuppressed(recentLog, now)) return null;

  const trigger = evaluateTrigger(context, now);
  return trigger;
}
