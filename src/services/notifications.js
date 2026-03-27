// src/services/notifications.js
// Handles FCM token registration, permission requests, and notification preferences.
//
// Preferences are stored at: users/{userId}/preferences/notifications
//
// On first read:
//   - If the document exists, return it merged over defaults (always complete).
//   - If it does not exist, seed the full default shape to Firestore immediately
//     (migrating any legacy user-doc values), then return it.
//
// Granular save helpers always use { merge: true } against a document that is
// guaranteed to be fully seeded on first load, so no partial shape can accumulate.

import { db } from '../lib/firebase.js';
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';

// ─── Single source of truth for the preferences shape ─────────────────────────

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
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function prefsRef(userId) {
  return doc(db, 'users', userId, 'preferences', 'notifications');
}

// Always return a complete preferences object regardless of what is stored.
function normalise(stored) {
  return { ...DEFAULT_NOTIFICATION_PREFS, ...stored };
}

// Write the full document to Firestore — never a partial shape.
// Uses plain setDoc (no merge) so the document is always fully formed.
async function seedPrefs(userId, prefs, fcmToken = null) {
  await setDoc(prefsRef(userId), {
    ...DEFAULT_NOTIFICATION_PREFS,
    ...prefs,
    fcmToken,
    updatedAt: serverTimestamp(),
  });
}

// ─── FCM token ────────────────────────────────────────────────────────────────
// Dynamically imported to keep the main bundle lean for users who never
// enable notifications.

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
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function requestPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return await Notification.requestPermission();
}

// ─── Load preferences ─────────────────────────────────────────────────────────
// Always returns a full, normalised preferences object.
// Auto-creates the Firestore document on first visit — no manual setup needed.

export async function loadNotificationPrefs(userId) {
  try {
    const snap = await getDoc(prefsRef(userId));

    if (snap.exists()) {
      // Document already exists. Normalise in case new fields have been added
      // to DEFAULT_NOTIFICATION_PREFS since this user's document was created.
      return normalise(snap.data());
    }

    // ── Document does not exist yet ──
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
      // Legacy read failure is non-fatal — proceed with pure defaults.
    }

    // Seed the full document to Firestore immediately so the next read
    // finds a complete document and no other path needs to handle missing docs.
    const prefs = normalise(migrated);
    await seedPrefs(userId, prefs);
    return prefs;

  } catch {
    // Firestore unavailable — return in-memory defaults so the UI still renders.
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

// ─── Granular save helpers ────────────────────────────────────────────────────
// The document is guaranteed to be fully seeded by loadNotificationPrefs before
// any of these are called. All helpers use { merge: true } so only the changed
// fields are written and all other fields are preserved intact.

export async function saveMasterEnabled(userId, enabled) {
  // Fetch FCM token when enabling so it is always current.
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
