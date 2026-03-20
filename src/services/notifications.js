// src/services/notifications.js
// Handles FCM token registration, permission requests, and reminder preferences.

import { db } from '../lib/firebase.js';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

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
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  const result = await Notification.requestPermission();
  return result;
}

// ─── FCM token ───────────────────────────────────────────────────────────────
// We use the Firebase Messaging SDK dynamically to avoid bloating the
// main bundle for users who never enable notifications.

async function getFCMToken() {
  try {
    const { getMessaging, getToken } = await import('firebase/messaging');
    const { initializeApp, getApps } = await import('firebase/app');

    // Re-use the already-initialised app
    const app = getApps()[0];
    const messaging = getMessaging(app);

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.warn('VITE_FIREBASE_VAPID_KEY is not set — FCM token unavailable');
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

// ─── Firestore helpers ────────────────────────────────────────────────────────

export async function loadReminderPrefs(userId) {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (!snap.exists()) return { enabled: false, time: '08:00' };
    const d = snap.data();
    return {
      enabled: d.reminderEnabled === true,
      time: d.reminderTime || '08:00',
    };
  } catch {
    return { enabled: false, time: '08:00' };
  }
}

export async function saveReminderEnabled(userId, enabled, time) {
  const token = enabled ? await getFCMToken() : null;

  await setDoc(doc(db, 'users', userId), {
    reminderEnabled: enabled,
    reminderTime: time,
    fcmToken: token,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function saveReminderTime(userId, time, currentlyEnabled) {
  if (!currentlyEnabled) return;
  await setDoc(doc(db, 'users', userId), {
    reminderTime: time,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
