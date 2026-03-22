// src/services/habits.js
import { db } from '../lib/firebase.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// ─── Habit definitions ────────────────────────────────────────────────────────

export const HABITS = [
  { id: 'no-alcohol',    label: 'No alcohol',          emoji: '🚫',  color: '#c97b6a' },
  { id: 'steps-10k',     label: '10k steps',            emoji: '👟',  color: '#7a9e7e' },
  { id: 'water-3l',      label: '3L water',             emoji: '💧',  color: '#6a8fb5' },
  { id: 'no-phone',      label: '1hr no phone time',    emoji: '📵',  color: '#9b8bb4' },
  { id: 'send-love',     label: 'Send Love 📱',         emoji: '💌',  color: '#c98b8b' },
  { id: 'sleep',         label: 'Early to bed',         emoji: '🌙',  color: '#7a8fa3' },
];

// ─── Firestore helpers ────────────────────────────────────────────────────────

export async function getHabitLog(userId, dateKey) {
  const ref = doc(db, 'users', userId, 'habitLogs', dateKey);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : {};
}

export async function getHabitLogsRange(userId, startKey, endKey) {
  // Fetch all dates in range individually (small range — 4 weeks = 28 docs)
  const dates = [];
  const start = new Date(startKey + 'T12:00:00');
  const end   = new Date(endKey   + 'T12:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  const results = await Promise.all(
    dates.map(async (dateKey) => {
      const ref  = doc(db, 'users', userId, 'habitLogs', dateKey);
      const snap = await getDoc(ref);
      return { dateKey, data: snap.exists() ? snap.data() : {} };
    })
  );

  const map = {};
  results.forEach(({ dateKey, data }) => { map[dateKey] = data; });
  return map;
}

export async function toggleHabit(userId, dateKey, habitId, value) {
  const ref = doc(db, 'users', userId, 'habitLogs', dateKey);
  await setDoc(ref, { [habitId]: value }, { merge: true });
}

// ─── Streak computation ───────────────────────────────────────────────────────

export function computeStreaks(logsMap, todayKey) {
  const streaks = {};

  HABITS.forEach(h => {
    let streak = 0;
    const today = new Date(todayKey + 'T12:00:00');

    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const log = logsMap[key] || {};

      // Skip today if not yet logged (don't break streak)
      if (i === 0 && log[h.id] !== true) continue;
      if (log[h.id] === true) { streak++; }
      else { break; }
    }

    streaks[h.id] = streak;
  });

  return streaks;
}

// ─── Calendar helpers ─────────────────────────────────────────────────────────

export function buildCalendarDays(todayKey) {
  const today = new Date(todayKey + 'T12:00:00');
  // Start from Monday 4 weeks ago
  const startDay = new Date(today);
  startDay.setDate(startDay.getDate() - 27);
  // Align to Monday
  const dow = startDay.getDay(); // 0=Sun
  const offset = dow === 0 ? 6 : dow - 1;
  startDay.setDate(startDay.getDate() - offset);

  const days = [];
  for (let i = 0; i < 35; i++) {
    const d = new Date(startDay);
    d.setDate(d.getDate() + i);
    const dateKey = d.toISOString().slice(0, 10);
    days.push({
      dateKey,
      dayOfMonth: d.getDate(),
      isToday: dateKey === todayKey,
      isFuture: dateKey > todayKey,
    });
  }
  return days;
}

export function getNWeeksAgoKey(n) {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return d.toISOString().slice(0, 10);
}
