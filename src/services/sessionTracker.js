/**
 * services/sessionTracker.js — Session Tracker
 *
 * Phase 4 (Data): Tracks session start/end and duration.
 * In-memory only — no async I/O in the hot path.
 * Duration is derived from timestamps, not intervals.
 *
 * Rules:
 *   - startSession() called once on app open
 *   - endSession() called on visibilitychange (hidden)
 *   - Duration exported to analytics + daily snapshot
 */

import { trackEvent } from './analytics.js';

// ─── Session state ────────────────────────────────────────────────────────────

let _sessionStartAt = null;
let _sessionUserId  = null;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Mark session start. Records timestamp and fires session_start event.
 *
 * @param {string} userId
 */
export function startSession(userId) {
  _sessionStartAt = Date.now();
  _sessionUserId  = userId;

  // Fire-and-forget — non-blocking
  trackEvent(userId, 'session_start', {}, { dedupeKey: `session_start_${_sessionStartAt}` }).catch(() => null);

  // Bind end-of-session on page hide
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', _onVisibilityChange, { once: true });
  }
}

/**
 * Mark session end. Writes duration to analytics.
 */
export function endSession() {
  if (!_sessionStartAt || !_sessionUserId) return;

  const duration = getCurrentSessionDuration();
  trackEvent(_sessionUserId, 'session_end', { durationSeconds: duration }).catch(() => null);

  _sessionStartAt = null;
  _sessionUserId  = null;
}

/**
 * Get the current session duration in seconds.
 * Returns 0 if session has not been started.
 *
 * @returns {number}
 */
export function getCurrentSessionDuration() {
  if (!_sessionStartAt) return 0;
  return Math.round((Date.now() - _sessionStartAt) / 1000);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function _onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    endSession();
  }
}
