// src/services/progress.js
// Aggregates the last 7 days of data across all Firestore collections.
// Returns both:
// 1. legacy compatibility metrics
// 2. active surfaced-product metrics for cleaner product logic

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

// ─── Metric helpers ───────────────────────────────────────────────────────────

function hasCompletedWorkout(workout) {
  return !!(
    workout &&
    Array.isArray(workout.completedExercises) &&
    workout.completedExercises.length > 0
  );
}

function hasJournalEntry(journal) {
  return !!(
    journal &&
    typeof journal.entry === 'string' &&
    journal.entry.trim().length > 0
  );
}

function hasCheckIn(checkin) {
  const mood = checkin?.mood || '';
  const energy = checkin?.energy || '';
  return !!(mood || energy);
}

function hasNourishment(nutrition) {
  return !!(nutrition && nutrition.nourished === true);
}

function hasCompletedHabitDay(habitLog) {
  if (!habitLog || typeof habitLog !== 'object') return false;
  return Object.values(habitLog).some(value => value === true);
}

// ─── getWeekSummary ───────────────────────────────────────────────────────────
// Legacy compatibility:
//   workoutsDone
//   journalDays
//   avgHydration
//   moodCounts
//   nourishedDays
//   hasAnyData
//
// New active metrics:
//   activeWorkoutsDone
//   activeNourishedDays
//   activeHabitsDays
//   activeCheckInDays
//   activeHasAnyData
//
// Transparency flags:
//   includesDormantJournal
//   includesLegacyHydration

export async function getWeekSummary(userId) {
  const keys = getLast7Keys();

  const [workouts, journals, checkins, nutrition, habits] = await Promise.all([
    fetchDocs(userId, 'workoutSessions', keys),
    fetchDocs(userId, 'journalEntries', keys),
    fetchDocs(userId, 'wellnessCheckins', keys),
    fetchDocs(userId, 'nutritionLogs', keys),
    fetchDocs(userId, 'habitLogs', keys),
  ]);

  // ─── Legacy / compatibility metrics ────────────────────────────────────────

  const workoutsDone = workouts.filter(hasCompletedWorkout).length;

  const journalDays = journals.filter(hasJournalEntry).length;

  const hydrationValues = checkins
    .filter(c => c && typeof c.hydrationGlasses === 'number')
    .map(c => c.hydrationGlasses);

  const avgHydration = hydrationValues.length > 0
    ? Math.round(hydrationValues.reduce((a, b) => a + b, 0) / hydrationValues.length)
    : 0;

  const moodCounts = { calm: 0, flat: 0, good: 0, stretched: 0 };
  checkins.forEach(c => {
    if (c && c.mood && Object.prototype.hasOwnProperty.call(moodCounts, c.mood)) {
      moodCounts[c.mood]++;
    }
  });

  const nourishedDays = nutrition.filter(hasNourishment).length;

  const hasAnyData =
    workoutsDone > 0 ||
    journalDays > 0 ||
    hydrationValues.length > 0 ||
    nourishedDays > 0;

  // ─── Active surfaced-product metrics ───────────────────────────────────────

  const activeWorkoutsDone = workoutsDone;
  const activeNourishedDays = nourishedDays;
  const activeHabitsDays = habits.filter(hasCompletedHabitDay).length;
  const activeCheckInDays = checkins.filter(hasCheckIn).length;

  const activeHasAnyData =
    activeWorkoutsDone > 0 ||
    activeNourishedDays > 0 ||
    activeHabitsDays > 0 ||
    activeCheckInDays > 0;

  // ─── Transparency flags ────────────────────────────────────────────────────

  const includesDormantJournal = journalDays > 0;
  const includesLegacyHydration = hydrationValues.length > 0;

  return {
    // legacy compatibility
    workoutsDone,
    journalDays,
    avgHydration,
    moodCounts,
    nourishedDays,
    hasAnyData,

    // active surfaced-product metrics
    activeWorkoutsDone,
    activeNourishedDays,
    activeHabitsDays,
    activeCheckInDays,
    activeHasAnyData,

    // structural transparency
    includesDormantJournal,
    includesLegacyHydration,
  };
}