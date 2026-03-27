// src/domain/dailyState.js
// Aggregates the app state needed for the Today screen.
// Adds capability awareness for surfaced vs dormant features.

import { getTodayWellnessCheckin } from '../services/wellness.js';
import { getTodayWorkoutSession } from '../services/workouts.js';
import { getTodayNutritionLog } from '../services/nutrition.js';
import { getTodayJournalEntry } from '../services/journal.js';
import { getTodayNicoLog } from '../services/nico.js';
import { getHabitLog, getHabits, HABITS } from '../services/habits.js';
import { getWeekSummary } from '../services/progress.js';
import { getLastActiveGap } from '../services/lastSeen.js';
import { getTodayKey } from '../utils.js';

function normaliseWellness(data) {
  return {
    hydrationGlasses: data?.hydrationGlasses ?? 0, // legacy, not used for active logic
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

// habitDefinitions: the resolved list of habit definitions (Firestore or fallback)
// habitMap: the user's completion log for today { [habitId]: boolean }
function isHabitCompleted(value) {
  if (value === true) return true;
  if (value && typeof value === 'object') return value.completed === true;
  return false;
}

function normaliseHabits(habitMap, habitDefinitions) {
  const habitsById = habitMap && typeof habitMap === 'object' ? habitMap : {};

  const items = habitDefinitions.map(habit => ({
    ...habit,
    completed: isHabitCompleted(habitsById[habit.id])
  }));

  const completedCount = items.filter(h => h.completed).length;

  return {
    items,
    completedCount,
    totalCount: habitDefinitions.length
  };
}

function normaliseProgress(data) {
  return {
    // legacy / compatibility
    workoutsDone: data?.workoutsDone ?? 0,
    journalDays: data?.journalDays ?? 0,
    avgHydration: data?.avgHydration ?? 0,
    nourishedDays: data?.nourishedDays ?? 0,
    moodCounts: data?.moodCounts ?? { calm: 0, flat: 0, good: 0, stretched: 0 },
    hasAnyData: data?.hasAnyData ?? false,

    // NEW: active/surfaced-only progress
    activeWorkoutsDone: data?.activeWorkoutsDone ?? data?.workoutsDone ?? 0,
    activeNourishedDays: data?.activeNourishedDays ?? data?.nourishedDays ?? 0,
    activeHabitsDays: data?.activeHabitsDays ?? 0,
    activeCheckInDays: data?.activeCheckInDays ?? 0,
    activeHasAnyData:
      data?.activeHasAnyData ??
      !!(
        (data?.activeWorkoutsDone ?? 0) > 0 ||
        (data?.activeNourishedDays ?? 0) > 0 ||
        (data?.activeHabitsDays ?? 0) > 0 ||
        (data?.activeCheckInDays ?? 0) > 0
      ),

    // transparency flags
    includesDormantJournal: data?.includesDormantJournal ?? true,
    includesLegacyHydration: data?.includesLegacyHydration ?? true
  };
}

function normaliseLastSeen(data) {
  return {
    lastActiveAt: data?.lastActiveAt ?? null,
    gapHours: typeof data?.gapHours === 'number' ? data.gapHours : 0
  };
}

function buildCapabilities() {
  return {
    wellness: { available: true, surfaced: true },
    workout: { available: true, surfaced: true },
    nutrition: { available: true, surfaced: true },
    habits: { available: true, surfaced: true },
    nico: { available: true, surfaced: true },
    journal: { available: true, surfaced: false },
    shopping: { available: true, surfaced: false },
    notifications: { available: true, surfaced: false }
  };
}

// ─── Resolve habit definitions ────────────────────────────────────────────────
// Prefer Firestore habits if the user has any active ones defined.
// Fall back to the hardcoded HABITS array transparently.

async function resolveHabitDefinitions(userId) {
  const firestoreHabits = await getHabits(userId);
  if (firestoreHabits.length > 0) {
    return firestoreHabits;
  }
  return HABITS;
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
    habitDefinitions,
    habitsResult,
    progressResult,
    lastSeenResult
  ] = await Promise.all([
    getTodayWellnessCheckin(userId),
    getTodayWorkoutSession(userId),
    getTodayNutritionLog(userId),
    getTodayJournalEntry(userId),
    getTodayNicoLog(userId),
    resolveHabitDefinitions(userId),
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
    habits: normaliseHabits(habitsResult, habitDefinitions),
    progress: normaliseProgress(progressResult),
    lastSeen: normaliseLastSeen(lastSeenResult),
    capabilities: buildCapabilities()
  };
}
