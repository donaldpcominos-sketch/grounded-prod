// src/services/progress.js
// Aggregates the last 7 days of data across all Firestore collections.
// Returns a simple summary object — no targets, no percentages.

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase.js';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getDateKey(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getLast7Keys() {
  return Array.from({ length: 7 }, (_, i) => getDateKey(i));
}

// ─── Parallel document fetch helper ──────────────────────────────────────────

async function fetchDocs(userId, subcollection, dateKeys) {
  const promises = dateKeys.map(key =>
    getDoc(doc(db, 'users', userId, subcollection, key))
  );
  const snaps = await Promise.all(promises);
  return snaps.map(snap => (snap.exists() ? snap.data() : null));
}

// ─── getWeekSummary ───────────────────────────────────────────────────────────
// Returns:
//   workoutsDone    — number of days with a completed workout session
//   journalDays     — number of days with a journal entry
//   avgHydration    — average glasses/day across days that have a check-in
//   moodCounts      — { calm, flat, good, stretched } tallied over the week
//   nourishedDays   — number of days where nourished: true
//   hasAnyData      — boolean — false if it's a brand-new week with nothing yet

export async function getWeekSummary(userId) {
  const keys = getLast7Keys();

  const [workouts, journals, checkins, nutrition] = await Promise.all([
    fetchDocs(userId, 'workoutSessions', keys),
    fetchDocs(userId, 'journalEntries',  keys),
    fetchDocs(userId, 'wellnessCheckins', keys),
    fetchDocs(userId, 'nutritionLogs',   keys),
  ]);

  // Workouts — session must have at least one completedExercise
  const workoutsDone = workouts.filter(w =>
    w && Array.isArray(w.completedExercises) && w.completedExercises.length > 0
  ).length;

  // Journal — entry must have non-empty entry text
  const journalDays = journals.filter(j =>
    j && j.entry && j.entry.trim().length > 0
  ).length;

  // Hydration — average across check-in days that have a value
  const hydrationValues = checkins
    .filter(c => c && typeof c.hydrationGlasses === 'number')
    .map(c => c.hydrationGlasses);
  const avgHydration = hydrationValues.length > 0
    ? Math.round(hydrationValues.reduce((a, b) => a + b, 0) / hydrationValues.length)
    : 0;

  // Mood tallies
  const moodCounts = { calm: 0, flat: 0, good: 0, stretched: 0 };
  checkins.forEach(c => {
    if (c && c.mood && moodCounts.hasOwnProperty(c.mood)) {
      moodCounts[c.mood]++;
    }
  });

  // Nourished days
  const nourishedDays = nutrition.filter(n => n && n.nourished === true).length;

  // Any data at all?
  const hasAnyData = workoutsDone > 0 || journalDays > 0 || hydrationValues.length > 0 || nourishedDays > 0;

  return {
    workoutsDone,
    journalDays,
    avgHydration,
    moodCounts,
    nourishedDays,
    hasAnyData,
  };
}
