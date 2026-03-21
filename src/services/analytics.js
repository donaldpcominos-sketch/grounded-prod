/**
 * services/analytics.js — Analytics Event Tracker
 *
 * Phase 4 (Data): Lightweight event tracking for retention visibility.
 * Fire-and-forget. Never blocks render. Never surfaces to the user.
 *
 * Events tracked:
 *   app_open, session_start, session_end,
 *   notification_sent, notification_open, today_rendered
 *
 * Writes to: users/{uid}/events/{eventId}
 *
 * Schema:
 *   type      string   — event name
 *   at        string   — ISO timestamp
 *   dateKey   string   — YYYY-MM-DD
 *   source    string   — 'app' | 'notification' | 'system'
 *   metadata  object   — event-specific fields
 */

import { db }                                  from '../lib/firebase.js';
import { doc, setDoc, serverTimestamp }        from 'firebase/firestore';
import { getTodayKey }                         from '../utils.js';

// ─── Session guard ────────────────────────────────────────────────────────────

// Prevent double-writing the same event type within a session
const _writtenEvents = new Set();

// ─── Core event writer ────────────────────────────────────────────────────────

/**
 * Track a named event with optional metadata.
 * Fire-and-forget — does not await in callers.
 *
 * @param {string} userId
 * @param {string} eventName
 * @param {object} [payload]
 * @param {{ source?: string, dedupeKey?: string }} [options]
 */
export async function trackEvent(userId, eventName, payload = {}, options = {}) {
  const { source = 'app', dedupeKey } = options;

  // Optional per-session deduplication
  if (dedupeKey) {
    if (_writtenEvents.has(dedupeKey)) return;
    _writtenEvents.add(dedupeKey);
  }

  try {
    const now     = new Date();
    const eventId = `${getTodayKey()}_${eventName}_${now.getTime()}`;

    await setDoc(
      doc(db, 'users', userId, 'events', eventId),
      {
        type:     eventName,
        at:       now.toISOString(),
        dateKey:  getTodayKey(),
        source,
        metadata: payload,
        ts:       serverTimestamp(),
      }
    );
  } catch {
    // Non-critical — swallow silently
  }
}
