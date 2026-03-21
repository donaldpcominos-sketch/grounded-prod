/**
 * services/notificationService.js — Notification Service
 *
 * Single-line notifications only. No title/body split — one sentence, nothing more.
 * No CTA. No destinations. No app self-reference. No implied return.
 * Suppression enforced by presenceEngine.
 *
 * Phase 3: absence notifications use tone to lower pressure when sustained
 * difficulty is present (GENTLE tone). Distinction is meaningful — not cosmetic.
 * All other triggers and tone combinations use Phase 2 copy unchanged.
 */

import { getPermissionState } from './notifications.js';
import { TRIGGER_TYPES, logNotificationSent } from './presenceEngine.js';
import { STATES } from './stateEngine.js';
import { TONES } from './toneEngine.js';

// ─── Notification copy ────────────────────────────────────────────────────────

const NOTIFICATION_COPY = {
  [TRIGGER_TYPES.NIGHT_OPEN]: {
    body:       'Nothing needs doing.',
    gentleBody: 'Nothing needs doing.',
    silent:     true,
  },
  [TRIGGER_TYPES.LONG_ABSENCE]: {
    body:       'Nothing is expected from you.',
    gentleBody: 'There\'s no expectation on you.',
    silent:     false,
  },
  [TRIGGER_TYPES.RETURN_AFTER_ABSENCE]: {
    body:       'Nothing is expected from you.',
    gentleBody: 'There\'s no expectation on you.',
    silent:     false,
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

// ─── Copy selection ───────────────────────────────────────────────────────────

/**
 * @param {string} triggerType
 * @param {{ tone?: string }} [context]
 * @returns {{ body: string, silent: boolean } | null}
 */
function resolveCopy(triggerType, context = {}) {
  const template = NOTIFICATION_COPY[triggerType];
  if (!template) return null;

  const isGentle = context.tone === TONES.GENTLE;
  const body     = (isGentle && template.gentleBody) ? template.gentleBody : template.body;

  return { body, silent: template.silent };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {string} userId
 * @param {string} triggerType
 * @param {string} [state]
 * @param {{ continuityTag?: string, tone?: string }} [context]
 */
export async function sendPresenceNotification(userId, triggerType, state = null, context = {}) {
  const copy = resolveCopy(triggerType, context);
  if (!copy) return;
  await dispatch(userId, triggerType, copy.body, copy.silent);
}

/**
 * @param {string} userId
 * @param {string} reflectionText
 */
export async function sendReflectionNotification(userId, reflectionText) {
  if (!reflectionText) return;
  await dispatch(userId, TRIGGER_TYPES.WEEKLY_REFLECTION, reflectionText, false);
}

/**
 * @param {string} userId
 */
export async function maybeSendNightNotification(userId) {
  await sendPresenceNotification(userId, TRIGGER_TYPES.NIGHT_OPEN, STATES.SURVIVAL);
}
