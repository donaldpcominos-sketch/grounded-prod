// src/domain/dailyState.js
// Aggregates the app state needed for the Today screen.
// This file does NOT write to Firestore and does NOT change existing service behaviour.

import { getTodayWellnessCheckin } from '../services/wellness.js';
import { getTodayWorkoutSession } from '../services/workouts.js';
import { getTodayNutritionLog } from '../services/nutrition.js';
import { getTodayJournalEntry } from '../services/journal.js';
import { getTodayNicoLog } from '../services/nico.js';
import { getHabitLog, HABITS } from '../services/habits.js';
import { getWeekSummary } from '../services/progress.js';
import { getLastActiveGap } from '../services/lastSeen.js';
import { getTodayKey } from '../utils.js';

function normaliseWellness(data) {
  return {
    hydrationGlasses: data?.hydrationGlasses ?? 0,
    mood: data?.mood ?? '',
    energy: data?.energy ?? ''
  };
}

function normaliseWorkout(data) {
  if (!data) return null;

  return {
    ...data,
    status: data.status ?? 'planned'
  };
}

function normaliseNutrition(data) {
  return {
    nourished: data?.nourished ?? false,
    note: data?.note ?? ''
  };
}

function normaliseJournal(data) {
  return {
    date: data?.date ?? getTodayKey(),
    prompt: data?.prompt ?? '',
    entry: data?.entry ?? ''
  };
}

function normaliseNico(data) {
  return {
    naps: Array.isArray(data?.naps) ? data.naps : [],
    completedActivities: Array.isArray(data?.completedActivities)
      ? data.completedActivities
      : []
  };
}

function normaliseHabits(habitMap) {
  const habitsById = habitMap && typeof habitMap === 'object' ? habitMap : {};

  const items = HABITS.map(habit => ({
    ...habit,
    completed: habitsById[habit.id] === true
  }));

  const completedCount = items.filter(h => h.completed).length;

  return {
    items,
    completedCount,
    totalCount: HABITS.length
  };
}

function normaliseProgress(data) {
  return {
    workoutsDone: data?.workoutsDone ?? 0,
    journalDays: data?.journalDays ?? 0,
    avgHydration: data?.avgHydration ?? 0,
    moodCounts: data?.moodCounts ?? { calm: 0, flat: 0, good: 0, stretched: 0 },
    nourishedDays: data?.nourishedDays ?? 0,
    hasAnyData: data?.hasAnyData ?? false
  };
}

function normaliseLastSeen(data) {
  return {
    lastActiveAt: data?.lastActiveAt ?? null,
    gapHours: typeof data?.gapHours === 'number' ? data.gapHours : 0
  };
}

export async function getDailyState(userId) {
  if (!userId) {
    throw new Error('getDailyState requires a userId');
  }

  const todayKey = getTodayKey();

  const [
    wellnessResult,
    workoutResult,
    nutritionResult,
    journalResult,
    nicoResult,
    habitsResult,
    progressResult,
    lastSeenResult
  ] = await Promise.all([
    getTodayWellnessCheckin(userId),
    getTodayWorkoutSession(userId),
    getTodayNutritionLog(userId),
    getTodayJournalEntry(userId),
    getTodayNicoLog(userId),
    getHabitLog(userId, todayKey),
    getWeekSummary(userId),
    getLastActiveGap(userId)
  ]);

  return {
    date: todayKey,
    wellness: normaliseWellness(wellnessResult),
    workout: normaliseWorkout(workoutResult),
    nutrition: normaliseNutrition(nutritionResult),
    journal: normaliseJournal(journalResult),
    nico: normaliseNico(nicoResult),
    habits: normaliseHabits(habitsResult),
    progress: normaliseProgress(progressResult),
    lastSeen: normaliseLastSeen(lastSeenResult)
  };
}