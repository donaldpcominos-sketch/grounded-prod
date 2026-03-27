// src/services/progress.js
// Aggregates the last 7 days of data across all Firestore collections.
// Returns both:
// 1. legacy compatibility metrics
// 2. active surfaced-product metrics for cleaner product logic

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { getHabits } from './habits.js';

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

function isHabitValueCompleted(value) {
  if (value === true) return true;
  if (value && typeof value === 'object') return value.completed === true;
  return false;
}

function getHabitEntries(habitLogDoc) {
  const habits = habitLogDoc?.habits;
  if (!habits || typeof habits !== 'object') return [];
  return Object.values(habits);
}

function hasCompletedHabitDay(habitLogDoc) {
  return getHabitEntries(habitLogDoc).some(isHabitValueCompleted);
}

function countCompletedHabits(habitLogDoc) {
  return getHabitEntries(habitLogDoc).filter(isHabitValueCompleted).length;
}

function countCompletedActiveHabits(habitLogDoc, activeHabitIds) {
  if (!habitLogDoc?.habits || !Array.isArray(activeHabitIds) || activeHabitIds.length === 0) {
    return 0;
  }

  let completed = 0;

  for (const habitId of activeHabitIds) {
    if (isHabitValueCompleted(habitLogDoc.habits[habitId])) {
      completed++;
    }
  }

  return completed;
}

function isPerfectHabitDay(habitLogDoc, activeHabitIds) {
  if (!Array.isArray(activeHabitIds) || activeHabitIds.length === 0) return false;
  return countCompletedActiveHabits(habitLogDoc, activeHabitIds) >= activeHabitIds.length;
}

function getCurrentPerfectHabitStreak(habitLogs, activeHabitIds) {
  let streak = 0;
  for (const habitLog of habitLogs) {
    if (isPerfectHabitDay(habitLog, activeHabitIds)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function getBestPerfectHabitStreak(habitLogs, activeHabitIds) {
  let best = 0;
  let current = 0;

  for (const habitLog of habitLogs) {
    if (isPerfectHabitDay(habitLog, activeHabitIds)) {
      current++;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }

  return best;
}

// ─── getWeekSummary ───────────────────────────────────────────────────────────

export async function getWeekSummary(userId) {
  const keys = getLast7Keys();

  const [workouts, journals, checkins, nutrition, habits, activeHabits] = await Promise.all([
    fetchDocs(userId, 'workoutSessions', keys),
    fetchDocs(userId, 'journalEntries', keys),
    fetchDocs(userId, 'wellnessCheckins', keys),
    fetchDocs(userId, 'nutritionLogs', keys),
    fetchDocs(userId, 'habitLogs', keys),
    getHabits(userId).catch(() => [])
  ]);

  const activeHabitIds = activeHabits.map(h => h.id);

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
  const activePerfectHabitDays = habits.filter(h => isPerfectHabitDay(h, activeHabitIds)).length;
  const activeCheckInDays = checkins.filter(hasCheckIn).length;

  const activeHabitCompletionCounts = habits.map(h => countCompletedActiveHabits(h, activeHabitIds));
  const activeHabitsTotalCompletions = activeHabitCompletionCounts.reduce((sum, count) => sum + count, 0);
  const activeHabitsBestDay = activeHabitCompletionCounts.length > 0
    ? Math.max(...activeHabitCompletionCounts)
    : 0;

  let activeHabitsCurrentStreak = 0;
  for (const habitLog of habits) {
    if (hasCompletedHabitDay(habitLog)) {
      activeHabitsCurrentStreak++;
    } else {
      break;
    }
  }

  const activeHabitsCompletionRate = Math.round((activeHabitsDays / keys.length) * 100);
  const activePerfectHabitsCompletionRate = Math.round((activePerfectHabitDays / keys.length) * 100);
  const activePerfectHabitCurrentStreak = getCurrentPerfectHabitStreak(habits, activeHabitIds);
  const activePerfectHabitBestStreak = getBestPerfectHabitStreak(habits, activeHabitIds);

  const activeHasAnyData =
    activeWorkoutsDone > 0 ||
    activeNourishedDays > 0 ||
    activeHabitsDays > 0 ||
    activePerfectHabitDays > 0 ||
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
    activePerfectHabitDays,
    activeCheckInDays,
    activeHabitsCurrentStreak,
    activeHabitsCompletionRate,
    activePerfectHabitsCompletionRate,
    activePerfectHabitCurrentStreak,
    activePerfectHabitBestStreak,
    activeHabitsTotalCompletions,
    activeHabitsBestDay,
    activeHasAnyData,

    // structural transparency
    includesDormantJournal,
    includesLegacyHydration,
  };
}