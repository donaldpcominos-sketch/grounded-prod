// src/services/notifications.js
// Handles FCM token registration, permission requests, notification preferences,
// and notification runtime state.
//
// Preferences path:   users/{userId}/preferences/notifications
// Runtime state path: users/{userId}/notificationState/current
//
// On first read of either document, if it does not exist, the full default
// shape is written to Firestore automatically — no manual setup required.
//
// This file owns persistence and normalisation only.
// All decision logic lives in src/domain/notifications.js.

import { db } from '../lib/firebase.js';
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';

// ─── Preferences: source of truth for shape ───────────────────────────────────

export const DEFAULT_NOTIFICATION_PREFS = {
  masterEnabled:       false,
  reminderEnabled:     false,
  reminderTime:        '08:00',
  reminderWindowStart: '07:00',
  reminderWindowEnd:   '10:00',
  quietHoursEnabled:   false,
  quietHoursStart:     '21:00',
  quietHoursEnd:       '07:00',
  nudgesEnabled:       false,
  // Weather briefing — shown in-app on first open after weatherTime each day.
  weatherEnabled:      false,
  weatherTime:         '07:30',
};

// ─── Notification runtime state: source of truth for shape ────────────────────

export const DEFAULT_NOTIFICATION_STATE = {
  lastDailyReminderSentAt:    null,
  lastNudgeSentAt:            null,
  lastOpenedAt:               null,
  lastMeaningfulEngagementAt: null,
  lastWeatherBriefingSentAt:  null,
};

// ─── Firestore refs ───────────────────────────────────────────────────────────

function prefsRef(userId) {
  return doc(db, 'users', userId, 'preferences', 'notifications');
}

function stateRef(userId) {
  return doc(db, 'users', userId, 'notificationState', 'current');
}

// ─── Internal normalisation ───────────────────────────────────────────────────

function normalisePrefs(stored) {
  return { ...DEFAULT_NOTIFICATION_PREFS, ...stored };
}

// Convert Firestore Timestamp fields to JS Dates (or null) so domain logic
// is never exposed to Firestore SDK types.
function normaliseState(stored) {
  function toDate(val) {
    if (!val) return null;
    if (val instanceof Date) return val;
    if (typeof val.toDate === 'function') return val.toDate();
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  return {
    lastDailyReminderSentAt:    toDate(stored?.lastDailyReminderSentAt),
    lastNudgeSentAt:            toDate(stored?.lastNudgeSentAt),
    lastOpenedAt:               toDate(stored?.lastOpenedAt),
    lastMeaningfulEngagementAt: toDate(stored?.lastMeaningfulEngagementAt),
    lastWeatherBriefingSentAt:  toDate(stored?.lastWeatherBriefingSentAt),
  };
}

// ─── Internal seed helpers ────────────────────────────────────────────────────

async function seedPrefs(userId, prefs, fcmToken = null) {
  await setDoc(prefsRef(userId), {
    ...DEFAULT_NOTIFICATION_PREFS,
    ...prefs,
    fcmToken,
    updatedAt: serverTimestamp(),
  });
}

async function seedState(userId) {
  await setDoc(stateRef(userId), {
    ...DEFAULT_NOTIFICATION_STATE,
    updatedAt: serverTimestamp(),
  });
}

// ─── FCM token ────────────────────────────────────────────────────────────────

async function getFCMToken() {
  try {
    const { getMessaging, getToken } = await import('firebase/messaging');
    const { getApps } = await import('firebase/app');
    const app = getApps()[0];
    const messaging = getMessaging(app);
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.warn('VITE_FIREBASE_VAPID_KEY not set — FCM token unavailable');
      return null;
    }
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: await navigator.serviceWorker.ready,
    });
    return token || null;
  } catch (err) {
    console.warn('FCM getToken failed:', err);
    return null;
  }
}

// ─── Permission helpers ───────────────────────────────────────────────────────

export function notificationsSupported() {
  return (
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function getPermissionState() {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return await Notification.requestPermission();
}

// ─── Load preferences ─────────────────────────────────────────────────────────

export async function loadNotificationPrefs(userId) {
  try {
    const snap = await getDoc(prefsRef(userId));

    if (snap.exists()) {
      return normalisePrefs(snap.data());
    }

    // Check for legacy fields on the user doc and migrate them.
    let migrated = {};
    try {
      const userSnap = await getDoc(doc(db, 'users', userId));
      if (userSnap.exists()) {
        const u = userSnap.data();
        if (u.reminderEnabled !== undefined || u.reminderTime !== undefined) {
          migrated = {
            masterEnabled:   u.reminderEnabled === true,
            reminderEnabled: u.reminderEnabled === true,
            reminderTime:    u.reminderTime || DEFAULT_NOTIFICATION_PREFS.reminderTime,
          };
        }
      }
    } catch {
      // Non-fatal — proceed with pure defaults.
    }

    const prefs = normalisePrefs(migrated);
    await seedPrefs(userId, prefs);
    return prefs;

  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

// ─── Load notification runtime state ─────────────────────────────────────────

export async function loadNotificationState(userId) {
  try {
    const snap = await getDoc(stateRef(userId));

    if (snap.exists()) {
      return normaliseState(snap.data());
    }

    await seedState(userId);
    return { ...DEFAULT_NOTIFICATION_STATE };

  } catch {
    return { ...DEFAULT_NOTIFICATION_STATE };
  }
}

// ─── Convenience: load prefs and state in parallel ───────────────────────────
// Saves callers from orchestrating two parallel fetches themselves.
// Returns { prefs, notifState }.

export async function loadNotificationData(userId) {
  const [prefs, notifState] = await Promise.all([
    loadNotificationPrefs(userId),
    loadNotificationState(userId),
  ]);
  return { prefs, notifState };
}

// ─── Save notification runtime state ─────────────────────────────────────────

export async function saveNotificationState(userId, fields) {
  await setDoc(stateRef(userId), {
    ...fields,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// ─── Convenience state writers ────────────────────────────────────────────────

export async function recordDailyReminderSent(userId) {
  await saveNotificationState(userId, {
    lastDailyReminderSentAt: serverTimestamp(),
  });
}

export async function recordNudgeSent(userId) {
  await saveNotificationState(userId, {
    lastNudgeSentAt: serverTimestamp(),
  });
}

export async function recordAppOpened(userId) {
  await saveNotificationState(userId, {
    lastOpenedAt: serverTimestamp(),
  });
}

export async function recordMeaningfulEngagement(userId) {
  await saveNotificationState(userId, {
    lastMeaningfulEngagementAt: serverTimestamp(),
  });
}

export async function recordWeatherBriefingSent(userId) {
  await saveNotificationState(userId, {
    lastWeatherBriefingSentAt: serverTimestamp(),
  });
}

// ─── Preferences: granular save helpers ──────────────────────────────────────

export async function saveMasterEnabled(userId, enabled) {
  const token = enabled ? await getFCMToken() : null;
  await setDoc(prefsRef(userId), {
    masterEnabled: enabled,
    fcmToken:      token,
    updatedAt:     serverTimestamp(),
  }, { merge: true });
}

export async function saveReminderEnabled(userId, enabled) {
  await setDoc(prefsRef(userId), {
    reminderEnabled: enabled,
    updatedAt:       serverTimestamp(),
  }, { merge: true });
}

export async function saveReminderTime(userId, time) {
  await setDoc(prefsRef(userId), {
    reminderTime: time,
    updatedAt:    serverTimestamp(),
  }, { merge: true });
}

export async function saveReminderWindow(userId, windowStart, windowEnd) {
  await setDoc(prefsRef(userId), {
    reminderWindowStart: windowStart,
    reminderWindowEnd:   windowEnd,
    updatedAt:           serverTimestamp(),
  }, { merge: true });
}

export async function saveQuietHours(userId, enabled, quietStart, quietEnd) {
  await setDoc(prefsRef(userId), {
    quietHoursEnabled: enabled,
    quietHoursStart:   quietStart,
    quietHoursEnd:     quietEnd,
    updatedAt:         serverTimestamp(),
  }, { merge: true });
}

export async function saveNudgesEnabled(userId, enabled) {
  await setDoc(prefsRef(userId), {
    nudgesEnabled: enabled,
    updatedAt:     serverTimestamp(),
  }, { merge: true });
}

export async function saveWeatherEnabled(userId, enabled) {
  await setDoc(prefsRef(userId), {
    weatherEnabled: enabled,
    updatedAt:      serverTimestamp(),
  }, { merge: true });
}

export async function saveWeatherTime(userId, time) {
  await setDoc(prefsRef(userId), {
    weatherTime: time,
    updatedAt:   serverTimestamp(),
  }, { merge: true });
}
