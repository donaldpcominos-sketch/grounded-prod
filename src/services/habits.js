import { db } from '../lib/firebase.js';
import { doc, getDoc, setDoc, getDocs, collection, query, orderBy, limit } from 'firebase/firestore';
import { getTodayKey } from '../utils.js';

// ─── Habit definitions ────────────────────────────────────────────────────────
// Single source of truth. Order here = display order.

export const HABITS = [
  { id: 'water-3l',   label: '3L water',          emoji: '💧', color: '#6a8fb5' },
  { id: 'steps-10k',  label: '10k steps',          emoji: '👟', color: '#7a9e7e' },
  { id: 'workout',    label: 'Workout',             emoji: '🏋️', color: '#b07060' },
  { id: 'vitamins',   label: 'Take my vitamins',   emoji: '💊', color: '#6a9fa8' },
  { id: 'no-alcohol', label: 'No alcohol',         emoji: '🚫', color: '#c97b6a' },
  { id: 'read',       label: 'Read my book',       emoji: '📚', color: '#c8956b' },
  { id: 'journal',    label: 'Journal',             emoji: '📓', color: '#7a9e7e' },
  { id: 'winddown',   label: '1hr no phone time',  emoji: '📵', color: '#7b7fad' },
  { id: 'skincare',   label: 'Skin care routine',  emoji: '✨', color: '#c4a882' },
  { id: 'kiss',       label: 'Kiss my husband',    emoji: '💋', color: '#c47a8a' },
  { id: 'friend',     label: 'Send Love 📱',       emoji: '💌', color: '#9b89c4' },
];

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getHabitLog(userId, dateKey) {
  const ref = doc(db, 'users', userId, 'habitLogs', dateKey);
  const snap = await getDoc(ref);
  if (!snap.exists()) return {};
  return snap.data().habits || {};
}

export async function getHabitLogsRange(userId, startKey, endKey) {
  // Returns a map of { dateKey: { habitId: bool } } for the date range
  const colRef = collection(db, 'users', userId, 'habitLogs');
  const q = query(colRef, orderBy('__name__'), limit(60));
  const snap = await getDocs(q);
  const result = {};
  snap.forEach(d => {
    const dateKey = d.id;
    if (dateKey >= startKey && dateKey <= endKey) {
      result[dateKey] = d.data().habits || {};
    }
  });
  return result;
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function saveHabitLog(userId, dateKey, habits) {
  const ref = doc(db, 'users', userId, 'habitLogs', dateKey);
  await setDoc(ref, { date: dateKey, habits }, { merge: true });
}

export async function toggleHabit(userId, dateKey, habitId, value) {
  const ref = doc(db, 'users', userId, 'habitLogs', dateKey);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data().habits || {}) : {};
  const updated = { ...existing, [habitId]: value };
  await setDoc(ref, { date: dateKey, habits: updated }, { merge: true });
  return updated;
}

// ─── Streak calculation ───────────────────────────────────────────────────────
// A streak for a habit = consecutive days ending today (or yesterday if today not yet logged)
// where the habit was marked done. Grace day: one missed day doesn't break it.

export function computeStreaks(logsMap, todayKey) {
  const streaks = {};
  for (const habit of HABITS) {
    streaks[habit.id] = computeStreak(logsMap, habit.id, todayKey);
  }
  return streaks;
}

function computeStreak(logsMap, habitId, todayKey) {
  const days = getSortedDaysDesc(todayKey, 90);
  let streak = 0;
  let missedOnce = false;

  for (const day of days) {
    const done = logsMap[day]?.[habitId] === true;
    if (done) {
      streak++;
      missedOnce = false;
    } else {
      if (!missedOnce && streak > 0) {
        missedOnce = true;
      } else {
        break;
      }
    }
  }
  return streak;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function getDateKey(date) {
  return date.toISOString().slice(0, 10);
}

export function getNWeeksAgoKey(n) {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return getDateKey(d);
}

function getSortedDaysDesc(todayKey, count) {
  const days = [];
  const d = new Date(todayKey + 'T12:00:00');
  for (let i = 0; i < count; i++) {
    days.push(getDateKey(d));
    d.setDate(d.getDate() - 1);
  }
  return days;
}

export function buildCalendarDays(todayKey) {
  const today = new Date(todayKey + 'T12:00:00');
  const dow = today.getDay();
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const startMonday = new Date(today);
  startMonday.setDate(today.getDate() - daysFromMon - 21);

  const days = [];
  const cur = new Date(startMonday);
  for (let i = 0; i < 28; i++) {
    const key = getDateKey(cur);
    days.push({
      dateKey: key,
      dayOfMonth: cur.getDate(),
      dayOfWeek: cur.getDay(),
      isToday: key === todayKey,
      isFuture: key > todayKey
    });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}
