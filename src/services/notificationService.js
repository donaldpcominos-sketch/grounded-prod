/**
 * services/notificationService.js — Notification Service
 *
 * Single-line notifications only. No title/body split — one sentence, nothing more.
 * No CTA. No destinations. No app self-reference. No implied return.
 * Suppression enforced by presenceEngine.
 */

import { getPermissionState } from './notifications.js';
import { TRIGGER_TYPES, logNotificationSent } from './presenceEngine.js';
import { STATES } from './stateEngine.js';

// ─── Notification copy ────────────────────────────────────────────────────────
//
// One sentence per trigger. Title is always empty — body carries the full message.
// LONG_ABSENCE and RETURN_AFTER_ABSENCE use identical copy: no conceptual distinction.
// WEEKLY_REFLECTION has no static copy — text is injected from reflectionEngine.

const NOTIFICATION_COPY = {
  [TRIGGER_TYPES.NIGHT_OPEN]: {
    body:   'Nothing needs doing.',
    silent: true,
  },
  [TRIGGER_TYPES.LONG_ABSENCE]: {
    body:   'Nothing is expected from you today.',
    silent: false,
  },
  [TRIGGER_TYPES.RETURN_AFTER_ABSENCE]: {
    body:   'Nothing is expected from you today.',
    silent: false,
  },
};

// ─── Core dispatch ────────────────────────────────────────────────────────────

async function dispatch(userId, triggerType, body, silent = false) {
  const permission = getPermissionState();

  if (permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker?.ready;
      if (reg?.showNotification) {
        await reg.showNotification('', {
          body,
          icon:   '/icons/icon-192.png',
          badge:  '/icons/badge-72.png',
          tag:    triggerType,
          silent,
          data:   { trigger: triggerType },
        });
      }
    } catch (err) {
      console.warn('[notificationService] push failed:', err);
    }
  }

  const channel = permission === 'granted' ? 'push' : 'silent';
  await logNotificationSent(userId, triggerType, channel);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {string} userId
 * @param {string} triggerType
 * @param {string} [state]
 */
export async function sendPresenceNotification(userId, triggerType, state = null) {
  const copy = NOTIFICATION_COPY[triggerType];
  if (!copy) return;
  await dispatch(userId, triggerType, copy.body, copy.silent);
}

/**
 * Weekly reflection — reflection text is the entire message.
 * @param {string} userId
 * @param {string} reflectionText
 */
export async function sendReflectionNotification(userId, reflectionText) {
  if (!reflectionText) return;
  await dispatch(userId, TRIGGER_TYPES.WEEKLY_REFLECTION, reflectionText, false);
}

/**
 * Night open — SURVIVAL, no suppression gate.
 * @param {string} userId
 */
export async function maybeSendNightNotification(userId) {
  await sendPresenceNotification(userId, TRIGGER_TYPES.NIGHT_OPEN, STATES.SURVIVAL);
}
