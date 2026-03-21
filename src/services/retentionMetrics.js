/**
 * services/retentionMetrics.js — Retention Metrics
 *
 * Phase 4 (Data): Derives lightweight retention metrics from event data
 * and writes enriched fields to dailyHistory.
 *
 * All functions are pure or near-pure — deterministic from inputs.
 * No ML. No randomness.
 */

import { STATES } from './stateEngine.js';

// ─── Gap hours ────────────────────────────────────────────────────────────────

/**
 * Derive gap hours between last open and current open.
 *
 * @param {string|null} lastOpenAt      — ISO timestamp of last open (or null)
 * @param {string|Date} currentOpenAt   — ISO timestamp or Date of current open
 * @returns {number} hours (0 if no previous open)
 */
export function deriveGapHours(lastOpenAt, currentOpenAt) {
  if (!lastOpenAt) return 0;
  try {
    const last    = new Date(lastOpenAt).getTime();
    const current = new Date(currentOpenAt).getTime();
    const diffMs  = current - last;
    if (diffMs < 0) return 0;
    return diffMs / (1000 * 60 * 60);
  } catch {
    return 0;
  }
}

// ─── Unprompted open ──────────────────────────────────────────────────────────

/**
 * Determine if the current open was unprompted (user opened without a notification).
 *
 * An open is unprompted when there was no notification open within
 * the given windowMinutes before the current open.
 *
 * @param {{
 *   lastNotificationOpenAt: string|null,
 *   currentOpenAt:          string|Date,
 *   windowMinutes?:         number,
 * }} params
 * @returns {boolean}
 */
export function deriveUnpromptedOpen({ lastNotificationOpenAt, currentOpenAt, windowMinutes = 30 }) {
  if (!lastNotificationOpenAt) return true; // Never received/opened a notification → unprompted

  try {
    const notifTime   = new Date(lastNotificationOpenAt).getTime();
    const currentTime = new Date(currentOpenAt).getTime();
    const windowMs    = windowMinutes * 60 * 1000;

    // If notification was opened within the window, this open is prompted
    return (currentTime - notifTime) > windowMs;
  } catch {
    return true;
  }
}

// ─── Daily retention snapshot ─────────────────────────────────────────────────

/**
 * Build a daily retention snapshot from the events collected for a day.
 *
 * @param {Array<{
 *   type:     string,
 *   at:       string,
 *   metadata: object,
 * }>} eventsForDay
 * @returns {object} enriched daily snapshot fields
 */
export function buildDailyRetentionSnapshot(eventsForDay) {
  const opens         = eventsForDay.filter(e => e.type === 'app_open');
  const sessions      = eventsForDay.filter(e => e.type === 'session_end');
  const notifOpens    = eventsForDay.filter(e => e.type === 'notification_open');

  const openCount     = opens.length;
  const openTimes     = opens.map(e => e.at).sort();
  const firstOpenTime = openTimes[0]  ?? null;
  const lastOpenTime  = openTimes[openTimes.length - 1] ?? null;

  // Session durations
  const durations        = sessions.map(e => e.metadata?.durationSeconds ?? 0).filter(d => d > 0);
  const totalDuration    = durations.reduce((acc, d) => acc + d, 0);
  const avgDuration      = durations.length > 0 ? Math.round(totalDuration / durations.length) : 0;

  const notificationOpened = notifOpens.length > 0;

  // Unprompted opens — opens with no preceding notification within 30 min
  const notifOpenTimes = notifOpens.map(e => e.at).sort();
  let unpromptedCount  = 0;
  for (const open of opens) {
    const recentNotif = notifOpenTimes.find(n => {
      const diff = (new Date(open.at) - new Date(n)) / (1000 * 60);
      return diff >= 0 && diff <= 30;
    });
    if (!recentNotif) unpromptedCount++;
  }

  return {
    openCount,
    firstOpenTime,
    lastOpenTime,
    totalSessionDuration:  totalDuration,
    avgSessionDuration:    avgDuration,
    notificationOpened,
    unpromptedOpenCount:   unpromptedCount,
  };
}

// ─── Flat day from metrics ────────────────────────────────────────────────────

/**
 * Derive whether this was likely a flat day from the daily snapshot.
 * Used for the flatDayCandidate field in dailyHistory.
 *
 * Flat day indicators:
 *   - Only one open (no return visit)
 *   - Short total session (< 90s)
 *   - No unprompted open
 *
 * @param {object} snapshot — output of buildDailyRetentionSnapshot
 * @returns {boolean}
 */
export function deriveFlatDayFromMetrics(snapshot) {
  const {
    openCount            = 0,
    totalSessionDuration = 0,
    unpromptedOpenCount  = 0,
  } = snapshot;

  return (
    openCount <= 1            &&
    totalSessionDuration < 90 &&
    unpromptedOpenCount === 0
  );
}
