// functions/scheduleDailyReminders.js
// Firebase Cloud Function — scheduled push notification sender.
//
// Runs every hour via Cloud Scheduler.
// Queries all users whose reminderTime falls within the current hour,
// checks whether they have already opened the app today, and sends
// an FCM push if not.
//
// ─── Setup ────────────────────────────────────────────────────────────────────
// 1. npm install -g firebase-tools
// 2. firebase init functions  (choose JavaScript, no ESLint)
// 3. Copy this file to functions/index.js (or import it from index.js)
// 4. Set the VAPID key environment variable (already in Firebase config via SDK)
// 5. firebase deploy --only functions
//
// ─── Environment ──────────────────────────────────────────────────────────────
// No extra env vars needed — FCM is authenticated via the service account
// that Firebase Functions runs under automatically.
// ─────────────────────────────────────────────────────────────────────────────

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

// Helpers
function todayKey() {
  const d = new Date();
  // Use Sydney/AEST offset (+10/+11) — app is for a Sydney user.
  // In production you'd use a proper timezone library; this approximation
  // is fine given the hourly scheduler cadence.
  const syd = new Date(d.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  const y = syd.getFullYear();
  const m = String(syd.getMonth() + 1).padStart(2, '0');
  const day = String(syd.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function currentHourSydney() {
  const d = new Date();
  const syd = new Date(d.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  return syd.getHours(); // 0-23
}

function parseHour(timeStr) {
  // timeStr is "HH:MM"
  if (!timeStr || !timeStr.includes(':')) return -1;
  return parseInt(timeStr.split(':')[0], 10);
}

// ─── Scheduled function ───────────────────────────────────────────────────────
exports.scheduleDailyReminders = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'Australia/Sydney',
    region: 'us-central1',
  },
  async () => {
    const currentHour = currentHourSydney();
    const today = todayKey();

    console.log(`[scheduleDailyReminders] Running for hour=${currentHour}, date=${today}`);

    // Query users with reminders enabled
    const usersSnap = await db
      .collection('users')
      .where('reminderEnabled', '==', true)
      .get();

    if (usersSnap.empty) {
      console.log('[scheduleDailyReminders] No users with reminders enabled.');
      return;
    }

    const sendPromises = [];

    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data();
      const userId = userDoc.id;
      const token = data.fcmToken;
      const reminderHour = parseHour(data.reminderTime);

      // Only send if this user's reminder hour matches current hour
      if (reminderHour !== currentHour) continue;

      // Don't have a valid FCM token — skip
      if (!token || typeof token !== 'string') {
        console.log(`[scheduleDailyReminders] No FCM token for user ${userId}`);
        continue;
      }

      // Check if user has already checked in today (wellnessCheckins doc exists)
      const checkinRef = db
        .collection('users')
        .doc(userId)
        .collection('wellnessCheckins')
        .doc(today);

      const checkinSnap = await checkinRef.get();

      if (checkinSnap.exists()) {
        console.log(`[scheduleDailyReminders] User ${userId} already checked in today — skipping`);
        continue;
      }

      // Build and send the message
      const message = {
        token,
        notification: {
          title: 'Grounded',
          body: 'Your check-in is ready. A moment for you.',
        },
        data: {
          url: '/',
        },
        webpush: {
          fcmOptions: {
            link: '/',
          },
          notification: {
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: 'grounded-reminder',
          },
        },
      };

      sendPromises.push(
        messaging.send(message)
          .then(() => console.log(`[scheduleDailyReminders] Sent to user ${userId}`))
          .catch((err) => {
            console.warn(`[scheduleDailyReminders] Failed for user ${userId}:`, err.message);

            // If token is invalid/expired, clear it so we don't retry forever
            if (
              err.code === 'messaging/invalid-registration-token' ||
              err.code === 'messaging/registration-token-not-registered'
            ) {
              return db.collection('users').doc(userId).update({
                fcmToken: null,
                reminderEnabled: false,
              });
            }
          })
      );
    }

    await Promise.all(sendPromises);
    console.log(`[scheduleDailyReminders] Done. Processed ${sendPromises.length} sends.`);
  }
);
