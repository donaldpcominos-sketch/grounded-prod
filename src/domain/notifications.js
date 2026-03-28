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
const REMINDER_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

// Weather data older than this is considered too stale to base a briefing on.
const WEATHER_STALE_THRESHOLD_MS = 3 * 60 * 60 * 1000; // 3 hours

// ─── Time helpers ─────────────────────────────────────────────────────────────

function parseTime(hhmm) {
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  return { hours: h || 0, minutes: m || 0 };
}

function toMinutes({ hours, minutes }) {
  return hours * 60 + minutes;
}

function nowMinutes(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes();
}

// Check whether `now` falls inside a window defined by startHHMM and endHHMM.
// Handles overnight windows (e.g. 21:00–07:00) correctly.
function isInsideWindow(startHHMM, endHHMM, now = new Date()) {
  const current = nowMinutes(now);
  const start   = toMinutes(parseTime(startHHMM));
  const end     = toMinutes(parseTime(endHHMM));

  if (start === end) return true;

  if (start < end) {
    return current >= start && current < end;
  } else {
    return current >= start || current < end;
  }
}

// Returns true if now is at or past a given HH:MM time on the current day.
function isPastTimeToday(hhmm, now = new Date()) {
  return nowMinutes(now) >= toMinutes(parseTime(hhmm));
}

// ─── Exported time checks ─────────────────────────────────────────────────────

export function isInsideReminderWindow(prefs, now = new Date()) {
  return isInsideWindow(prefs.reminderWindowStart, prefs.reminderWindowEnd, now);
}

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

  if (completedWorkout) return 'done';
  if (checkedIn && allHabitsDone) return 'done';

  const signalCount = [checkedIn, completedHabit, completedWorkout].filter(Boolean).length;
  if (signalCount >= 2) return 'done';
  if (signalCount >= 1) return 'started';

  return 'not-started';
}

// ─── Message selection ────────────────────────────────────────────────────────

const MESSAGES = {
  done: [
    { headline: null, body: null },
  ],
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

// Deterministic selection by day-of-year — stable within a day, rotates daily.
function selectMessage(pool, now = new Date()) {
  if (!pool || pool.length === 0) return { headline: null, body: null };
  const dayOfYear = Math.floor(
    (now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24)
  );
  return pool[dayOfYear % pool.length];
}

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

function alreadySentOnDate(timestamp, now = new Date()) {
  if (!timestamp) return false;
  const sent = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return (
    sent.getFullYear() === now.getFullYear() &&
    sent.getMonth()    === now.getMonth()    &&
    sent.getDate()     === now.getDate()
  );
}

function reminderAlreadySentToday(notifState, now = new Date()) {
  return alreadySentOnDate(notifState?.lastDailyReminderSentAt, now);
}

function isWithinCooldown(notifState, now = new Date()) {
  const sent = notifState?.lastDailyReminderSentAt;
  if (!sent) return false;
  const sentDate = sent instanceof Date ? sent : new Date(sent);
  return (now.getTime() - sentDate.getTime()) < REMINDER_COOLDOWN_MS;
}

function weatherBriefingAlreadySentToday(notifState, now = new Date()) {
  return alreadySentOnDate(notifState?.lastWeatherBriefingSentAt, now);
}

// ─── Daily reminder decision ──────────────────────────────────────────────────
//
// Returns a decision object answering: "should a daily reminder be shown now?"
//
// Decision object shape:
// {
//   shouldSendReminder: boolean,
//   reason:             string,
//   engagementState:    'done' | 'started' | 'not-started',
//   messageType:        'none' | 'soft' | 'gentle',
//   headline:           string | null,
//   body:               string | null,
//   signals:            { ... }
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
  if (withinCooldown) {
    return { shouldSendReminder: false, reason: 'cooldown', engagementState, ...message, signals };
  }
  if (alreadySentToday) {
    return { shouldSendReminder: false, reason: 'already_sent_today', engagementState, ...message, signals };
  }
  if (engagementState === 'done') {
    return { shouldSendReminder: false, reason: 'already_engaged_today', engagementState, ...message, signals };
  }

  return { shouldSendReminder: true, reason: 'eligible', engagementState, ...message, signals };
}

// ─── Weather comparison ───────────────────────────────────────────────────────
//
// Pure comparison between today's weather data and a yesterday snapshot.
//
// today:     object returned by fetchWeather() from weather.js.
//            Required fields: currentTemp (number), rainExpected (boolean).
// yesterday: object returned by getYesterdaySnapshot() from weather.js.
//            Shape: { temp, high, low, rainExpected }.
//            May be null — callers must handle the null return.
//
// Returns:
// {
//   tempDelta:    number,                    // today.currentTemp - yesterday.temp
//   direction:    'warmer' | 'cooler' | 'similar',
//   rainExpected: boolean,                   // from today's daily weather code
// }
// Returns null if either argument is missing or malformed.

export function compareWeather(today, yesterday) {
  if (!today || typeof today.currentTemp !== 'number') return null;
  if (!yesterday || typeof yesterday.temp !== 'number') return null;

  const tempDelta = Math.round(today.currentTemp - yesterday.temp);

  let direction = 'similar';
  if (tempDelta >= 2)       direction = 'warmer';
  else if (tempDelta <= -2) direction = 'cooler';

  return {
    tempDelta,
    direction,
    rainExpected: Boolean(today.rainExpected),
  };
}

// ─── Weather briefing message builder ────────────────────────────────────────
//
// Builds the headline and body copy for the weather briefing banner.
//
// comparison: result of compareWeather() — may be null (no yesterday data).
// today:      result of fetchWeather() — may be null.
//
// Returns: { headline, body } or null if today data is missing.
//
// Tone: factual, concise, no emoji in text strings.

export function buildWeatherBriefingMessage(comparison, today) {
  if (!today || typeof today.currentTemp !== 'number') return null;

  const headline = `${today.currentTemp}° · ${today.currentDesc}`;

  const parts = [];

  if (comparison) {
    const { direction, tempDelta } = comparison;
    const absDelta = Math.abs(tempDelta);
    if (direction === 'warmer') {
      parts.push(`${absDelta}° warmer than yesterday.`);
    } else if (direction === 'cooler') {
      parts.push(`${absDelta}° cooler than yesterday.`);
    }
    // 'similar' — no temp comparison line; falls through to rain or walk window.
  }

  if (today.rainExpected) {
    parts.push('Rain expected today.');
  }

  let body;
  if (parts.length > 0) {
    body = parts.join(' ');
  } else if (today.walkWindow) {
    // Strip the leading emoji and space from the walk window string.
    // e.g. "🐾 Good morning walk window: 6am–9am" → "Good morning walk window: 6am–9am"
    body = today.walkWindow.replace(/^\S+\s/, '');
  } else {
    body = 'Check the forecast before heading out.';
  }

  return { headline, body };
}

// ─── Weather briefing decision ────────────────────────────────────────────────
//
// Answers: "should a weather briefing banner be shown on this app open?"
//
// Gates (evaluated in priority order):
//   1. masterEnabled must be true
//   2. weatherEnabled must be true
//   3. quiet hours must not be active
//   4. current time must be at or past weatherTime
//   5. briefing must not have been shown today already
//   6. today's weather data must be present and not stale
//
// Parameters:
//   prefs      — from loadNotificationPrefs(userId)
//   notifState — from loadNotificationState(userId)
//   today      — result of fetchWeather() (may be null)
//   now        — optional Date override (useful for testing)
//
// Returns: { shouldShow: boolean, reason: string }

export function getWeatherBriefingDecision(prefs, notifState, today, now = new Date()) {
  if (prefs?.masterEnabled !== true) {
    return { shouldShow: false, reason: 'notifications_disabled' };
  }

  if (prefs?.weatherEnabled !== true) {
    return { shouldShow: false, reason: 'weather_disabled' };
  }

  if (isInsideQuietHours(prefs, now)) {
    return { shouldShow: false, reason: 'quiet_hours' };
  }

  if (!isPastTimeToday(prefs.weatherTime || '07:30', now)) {
    return { shouldShow: false, reason: 'before_weather_time' };
  }

  if (weatherBriefingAlreadySentToday(notifState, now)) {
    return { shouldShow: false, reason: 'already_shown_today' };
  }

  // Stale cache: suppress if data is too old to be meaningful.
  if (today?.fromCache && typeof today.cacheAgeMs === 'number') {
    if (today.cacheAgeMs > WEATHER_STALE_THRESHOLD_MS) {
      return { shouldShow: false, reason: 'weather_data_stale' };
    }
  }

  if (!today) {
    return { shouldShow: false, reason: 'no_weather_data' };
  }

  return { shouldShow: true, reason: 'eligible' };
}
