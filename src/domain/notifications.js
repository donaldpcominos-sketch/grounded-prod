// src/domain/notifications.js
//
// All notification decision logic lives here.
// This file is pure: it receives data as arguments and returns decisions.
// It does not fetch from Firestore, touch the DOM, or import from services.
//
// Callers are responsible for providing:
//   - prefs:        result of loadNotificationPrefs(userId)
//   - dailyState:   result of getDailyState(userId)
//   - notifState:   result of loadNotificationState(userId)

// ─── Configuration constants ──────────────────────────────────────────────────

// Minimum gap in milliseconds between any two daily reminders.
// Prevents back-to-back reminders if the app is opened repeatedly in a short
// window (e.g. near midnight when the date rolls over).
const REMINDER_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

// ─── Time helpers ─────────────────────────────────────────────────────────────

// Parse an 'HH:MM' string into { hours, minutes } integers.
function parseTime(hhmm) {
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  return { hours: h || 0, minutes: m || 0 };
}

// Convert { hours, minutes } to total minutes since midnight.
function toMinutes({ hours, minutes }) {
  return hours * 60 + minutes;
}

// Return total minutes since midnight for a given Date (defaults to now).
function nowMinutes(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes();
}

// Check whether `now` falls inside a window defined by startHHMM and endHHMM.
//
// Handles windows that cross midnight (e.g. 21:00–07:00) correctly:
//   - start < end : normal same-day window
//   - start >= end: overnight window — inside if at/after start OR before end
function isInsideWindow(startHHMM, endHHMM, now = new Date()) {
  const current = nowMinutes(now);
  const start   = toMinutes(parseTime(startHHMM));
  const end     = toMinutes(parseTime(endHHMM));

  if (start === end) return true; // degenerate zero-width window — treat as always inside

  if (start < end) {
    return current >= start && current < end;
  } else {
    // Overnight window
    return current >= start || current < end;
  }
}

// ─── Exported time checks ─────────────────────────────────────────────────────

// Returns true if the current time is inside the user's reminder window.
export function isInsideReminderWindow(prefs, now = new Date()) {
  return isInsideWindow(prefs.reminderWindowStart, prefs.reminderWindowEnd, now);
}

// Returns true if the current time is inside the user's quiet hours window.
// Returns false immediately if quiet hours are disabled.
export function isInsideQuietHours(prefs, now = new Date()) {
  if (!prefs.quietHoursEnabled) return false;
  return isInsideWindow(prefs.quietHoursStart, prefs.quietHoursEnd, now);
}

// ─── Engagement classification ────────────────────────────────────────────────

// Classify how meaningfully the user has engaged with their day so far.
//
// Returns one of:
//   'done'        — the user has done enough that a reminder would be unwelcome
//   'started'     — some engagement detected; a soft acknowledgement is appropriate
//   'not-started' — no engagement yet; a gentle nudge is appropriate
//
// "Done" is intentionally generous — it does not require all three signals.
// The goal is to avoid bothering someone who has clearly already had a
// productive day, even if one area is untouched.
//
// Done rules (any one is sufficient):
//   a) At least 2 of 3 signals are true
//   b) Workout is complete (highest-effort signal; alone it counts as done)
//   c) Check-in is complete AND all active habits are done
export function classifyEngagementState(dailyState) {
  const checkedIn        = Boolean(dailyState?.wellness?.mood);
  const completedHabit   = (dailyState?.habits?.completedCount ?? 0) > 0;
  const allHabitsDone    = (dailyState?.habits?.totalCount ?? 0) > 0 &&
                           (dailyState?.habits?.completedCount ?? 0) >= (dailyState?.habits?.totalCount ?? 1);
  const completedWorkout = dailyState?.workout?.status === 'complete';

  // Rule (b): workout alone signals done
  if (completedWorkout) return 'done';

  // Rule (c): check-in + all habits done
  if (checkedIn && allHabitsDone) return 'done';

  // Rule (a): majority of signals
  const signalCount = [checkedIn, completedHabit, completedWorkout].filter(Boolean).length;
  if (signalCount >= 2) return 'done';

  // At least one signal — user has started their day
  if (signalCount >= 1) return 'started';

  return 'not-started';
}

// ─── Message selection ────────────────────────────────────────────────────────

// Each engagement state has a small pool of copy variants.
// The variant is selected deterministically by the day-of-year so it is stable
// within a single day but rotates naturally over time.
// No randomness — always testable and predictable.

const MESSAGES = {
  // 'done' should never be selected for a reminder, but is defined defensively.
  done: [
    { headline: null, body: null },
  ],

  // Soft, acknowledging — the user has already done something today.
  // Tone: warm, low-pressure, optional.
  started: [
    {
      headline: 'You\'ve already made a start.',
      body:     'A little more whenever you\'re ready.',
    },
    {
      headline: 'Good beginning today.',
      body:     'There\'s still space to add a bit more if it feels right.',
    },
    {
      headline: 'You\'ve checked something off.',
      body:     'No pressure — just a nudge if you have a moment.',
    },
  ],

  // Gentle, non-guilt-inducing — the user hasn't engaged yet.
  // Tone: open, calm, inviting.
  'not-started': [
    {
      headline: 'Your day is still open.',
      body:     'A small check-in is all it takes to get started.',
    },
    {
      headline: 'Whenever you\'re ready.',
      body:     'Even a minute of intention can shift how the day feels.',
    },
    {
      headline: 'A gentle nudge.',
      body:     'Your Grounded check-in is waiting — no rush.',
    },
  ],
};

// Select a stable variant for today using day-of-year as the index seed.
function selectMessage(pool, now = new Date()) {
  if (!pool || pool.length === 0) return { headline: null, body: null };
  const dayOfYear = Math.floor(
    (now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24)
  );
  return pool[dayOfYear % pool.length];
}

// Returns the message type and copy appropriate for the given engagement state.
// messageType is a stable key the UI can use for styling if needed.
export function getReminderMessage(engagementState, now = new Date()) {
  switch (engagementState) {
    case 'done':
      return { messageType: 'none', headline: null, body: null };

    case 'started': {
      const { headline, body } = selectMessage(MESSAGES.started, now);
      return { messageType: 'soft', headline, body };
    }

    case 'not-started':
    default: {
      const { headline, body } = selectMessage(MESSAGES['not-started'], now);
      return { messageType: 'gentle', headline, body };
    }
  }
}

// ─── Meaningful engagement ────────────────────────────────────────────────────

// Returns a breakdown of today's engagement signals.
// Preserved for external callers (e.g. today.js recordMeaningfulEngagement).
// Uses the same three signals as classifyEngagementState to stay consistent.
export function getMeaningfulEngagement(dailyState) {
  const checkedIn        = Boolean(dailyState?.wellness?.mood);
  const completedHabit   = (dailyState?.habits?.completedCount ?? 0) > 0;
  const completedWorkout = dailyState?.workout?.status === 'complete';

  const engaged = checkedIn || completedHabit || completedWorkout;

  return {
    engaged,
    signals: { checkedIn, completedHabit, completedWorkout },
  };
}

// ─── Suppression checks ───────────────────────────────────────────────────────

// Returns true if a daily reminder was already sent today (calendar day).
function reminderAlreadySentToday(notifState, now = new Date()) {
  const sent = notifState?.lastDailyReminderSentAt;
  if (!sent) return false;

  const sentDate = sent instanceof Date ? sent : new Date(sent);
  return (
    sentDate.getFullYear() === now.getFullYear() &&
    sentDate.getMonth()    === now.getMonth()    &&
    sentDate.getDate()     === now.getDate()
  );
}

// Returns true if the last reminder was sent within the cooldown window.
// This prevents repeated reminders when the app is opened multiple times
// in quick succession (e.g. around midnight when the date rolls over, or
// if the user opens the app, dismisses, and returns shortly after).
function isWithinCooldown(notifState, now = new Date()) {
  const sent = notifState?.lastDailyReminderSentAt;
  if (!sent) return false;

  const sentDate = sent instanceof Date ? sent : new Date(sent);
  return (now.getTime() - sentDate.getTime()) < REMINDER_COOLDOWN_MS;
}

// ─── Main decision function ───────────────────────────────────────────────────
//
// Returns a decision object answering: "should a daily reminder be shown now?"
// All gates are evaluated in priority order and a reason is always recorded.
//
// Parameters:
//   prefs       — from loadNotificationPrefs(userId)
//   dailyState  — from getDailyState(userId)
//   notifState  — from loadNotificationState(userId)
//   now         — optional Date override (useful for testing)
//
// Decision object shape:
// {
//   shouldSendReminder: boolean,
//   reason:             string,              // machine-readable blocking gate, or 'eligible'
//   engagementState:    'done' | 'started' | 'not-started',
//   messageType:        'none' | 'soft' | 'gentle',
//   headline:           string | null,
//   body:               string | null,
//   signals: {
//     masterEnabled, reminderEnabled, insideWindow, insideQuietHours,
//     alreadySentToday, withinCooldown, engaged, engagementDetail
//   }
// }

export function getReminderDecision(prefs, dailyState, notifState, now = new Date()) {
  const masterEnabled    = prefs?.masterEnabled   === true;
  const reminderEnabled  = prefs?.reminderEnabled === true;
  const insideWindow     = isInsideReminderWindow(prefs, now);
  const insideQuietHours = isInsideQuietHours(prefs, now);
  const alreadySentToday = reminderAlreadySentToday(notifState, now);
  const withinCooldown   = isWithinCooldown(notifState, now);

  const { engaged, signals: engagementDetail } = getMeaningfulEngagement(dailyState);
  const engagementState = classifyEngagementState(dailyState);
  const message         = getReminderMessage(engagementState, now);

  const signals = {
    masterEnabled,
    reminderEnabled,
    insideWindow,
    insideQuietHours,
    alreadySentToday,
    withinCooldown,
    engaged,
    engagementDetail,
  };

  // ── Gate evaluation — priority order ──────────────────────────────────────

  if (!masterEnabled) {
    return { shouldSendReminder: false, reason: 'notifications_disabled', engagementState, ...message, signals };
  }

  if (!reminderEnabled) {
    return { shouldSendReminder: false, reason: 'reminder_disabled', engagementState, ...message, signals };
  }

  if (insideQuietHours) {
    return { shouldSendReminder: false, reason: 'quiet_hours', engagementState, ...message, signals };
  }

  if (!insideWindow) {
    return { shouldSendReminder: false, reason: 'outside_reminder_window', engagementState, ...message, signals };
  }

  // Cooldown takes priority over the calendar-day check so that a near-midnight
  // edge case (date just rolled over, alreadySentToday would be false) is still
  // suppressed if the last reminder was sent less than 4 hours ago.
  if (withinCooldown) {
    return { shouldSendReminder: false, reason: 'cooldown', engagementState, ...message, signals };
  }

  if (alreadySentToday) {
    return { shouldSendReminder: false, reason: 'already_sent_today', engagementState, ...message, signals };
  }

  // Only suppress when the user's day is genuinely complete.
  // 'started' and 'not-started' are both eligible — message copy handles tone.
  if (engagementState === 'done') {
    return { shouldSendReminder: false, reason: 'already_engaged_today', engagementState, ...message, signals };
  }

  // All gates passed.
  return { shouldSendReminder: true, reason: 'eligible', engagementState, ...message, signals };
}
