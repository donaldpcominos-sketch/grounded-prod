// src/domain/recommendations.js
// Generates simple, priority-based recommendations from dailyState.
// Pure logic only — no Firestore calls.

function pushRecommendation(list, recommendation) {
  list.push({
    id: recommendation.id || `${recommendation.type}-${list.length + 1}`,
    priority: typeof recommendation.priority === 'number' ? recommendation.priority : 999,
    actionLabel: recommendation.actionLabel || 'Open',
    route: recommendation.route || null,
    ...recommendation
  });
}

export function getTodayRecommendations(state) {
  if (!state || typeof state !== 'object') {
    return [];
  }

  const recommendations = [];

  addReturnRecommendation(recommendations, state);
  addWellnessRecommendation(recommendations, state);
  addWorkoutRecommendation(recommendations, state);
  addNutritionRecommendation(recommendations, state);
  addHabitsRecommendation(recommendations, state);
  addNicoRecommendation(recommendations, state);
  addJournalRecommendation(recommendations, state);
  addProgressRecommendation(recommendations, state);

  return recommendations
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3);
}

function addReturnRecommendation(list, state) {
  const gapHours = state.lastSeen?.gapHours ?? 0;

  if (gapHours >= 72) {
    pushRecommendation(list, {
      id: 'return-long-gap',
      type: 'return',
      priority: 1,
      title: 'Welcome back',
      message: 'You have been away a few days. Start with a quick check-in and one small win today.',
      actionLabel: 'Check in',
      route: '#/today'
    });
  } else if (gapHours >= 24) {
    pushRecommendation(list, {
      id: 'return-day-gap',
      type: 'return',
      priority: 2,
      title: 'Reset gently today',
      message: 'You have been away since yesterday. A quick check-in is the best place to restart.',
      actionLabel: 'Check in',
      route: '#/today'
    });
  }
}

function addWellnessRecommendation(list, state) {
  const mood = state.wellness?.mood ?? '';
  const energy = state.wellness?.energy ?? '';
  const hydrationGlasses = state.wellness?.hydrationGlasses ?? 0;

  if (!mood || !energy) {
    pushRecommendation(list, {
      id: 'wellness-checkin',
      type: 'wellness',
      priority: 3,
      title: 'Log how you feel',
      message: 'A quick mood and energy check-in helps personalise the rest of your day.',
      actionLabel: 'Check in',
      route: '#/today'
    });
    return;
  }

  if (hydrationGlasses < 2) {
    pushRecommendation(list, {
      id: 'hydration-boost',
      type: 'hydration',
      priority: energy === 'low' ? 4 : 6,
      title: 'Start with hydration',
      message: 'You have not logged much hydration yet today. A glass of water is an easy early win.',
      actionLabel: 'Log hydration',
      route: '#/today'
    });
  }
}

function addWorkoutRecommendation(list, state) {
  const workout = state.workout;
  const energy = state.wellness?.energy ?? '';

  if (!workout) {
    pushRecommendation(list, {
      id: 'workout-plan',
      type: 'workout',
      priority: energy === 'low' ? 7 : 4,
      title: energy === 'low' ? 'Keep movement light' : 'Make space to move',
      message: energy === 'low'
        ? 'A short walk or lighter session could be a better fit for today.'
        : 'You have not logged a workout yet. This could be a good day to move your body.',
      actionLabel: 'Open workout',
      route: '#/workout'
    });
    return;
  }

  if (workout.status !== 'complete') {
    pushRecommendation(list, {
      id: 'workout-incomplete',
      type: 'workout',
      priority: energy === 'low' ? 7 : 5,
      title: energy === 'low' ? 'Take the easier option' : 'Finish today’s movement',
      message: energy === 'low'
        ? 'Your workout is not complete yet. Give yourself permission to choose a lighter version.'
        : 'Your workout is still waiting. Even a shorter session keeps momentum going.',
      actionLabel: 'Resume workout',
      route: '#/workout'
    });
  }
}

function addNutritionRecommendation(list, state) {
  const nourished = state.nutrition?.nourished ?? false;
  const energy = state.wellness?.energy ?? '';

  if (!nourished) {
    pushRecommendation(list, {
      id: 'nutrition-log',
      type: 'nutrition',
      priority: energy === 'low' ? 4 : 6,
      title: 'Plan something nourishing',
      message: energy === 'low'
        ? 'Low-energy days are easier when food is simple and supportive.'
        : 'You have not logged nourishment yet today.',
      actionLabel: 'Open nutrition',
      route: '#/nutrition'
    });
  }
}

function addHabitsRecommendation(list, state) {
  const completedCount = state.habits?.completedCount ?? 0;
  const totalCount = state.habits?.totalCount ?? 0;

  if (totalCount > 0 && completedCount === 0) {
    pushRecommendation(list, {
      id: 'habits-start',
      type: 'habits',
      priority: 6,
      title: 'Start your habits gently',
      message: 'You have not ticked off any habits yet today. Start with the easiest one.',
      actionLabel: 'Open habits',
      route: '#/today'
    });
  } else if (totalCount > 0 && completedCount < totalCount) {
    pushRecommendation(list, {
      id: 'habits-progress',
      type: 'habits',
      priority: 8,
      title: 'Keep your momentum going',
      message: `You have completed ${completedCount} of ${totalCount} habits so far today.`,
      actionLabel: 'View habits',
      route: '#/today'
    });
  }
}

function addNicoRecommendation(list, state) {
  const naps = Array.isArray(state.nico?.naps) ? state.nico.naps : [];
  const activities = Array.isArray(state.nico?.completedActivities)
    ? state.nico.completedActivities
    : [];

  if (naps.length === 0 && activities.length === 0) {
    pushRecommendation(list, {
      id: 'nico-log',
      type: 'nico',
      priority: 7,
      title: 'Capture one Nico moment',
      message: 'No naps or activities have been logged yet today.',
      actionLabel: 'Open Nico',
      route: '#/nico'
    });
  }
}

function addJournalRecommendation(list, state) {
  const entry = state.journal?.entry ?? '';

  if (!entry.trim()) {
    pushRecommendation(list, {
      id: 'journal-reflection',
      type: 'journal',
      priority: 9,
      title: 'Take a quiet moment',
      message: 'A short journal note can help you mark the day, even if it is just a few lines.',
      actionLabel: 'Open journal',
      route: '#/journal'
    });
  }
}

function addProgressRecommendation(list, state) {
  const hasAnyData = state.progress?.hasAnyData ?? false;
  const workoutsDone = state.progress?.workoutsDone ?? 0;
  const journalDays = state.progress?.journalDays ?? 0;

  if (!hasAnyData) {
    return;
  }

  if (workoutsDone >= 3 && journalDays >= 3) {
    pushRecommendation(list, {
      id: 'progress-strong-week',
      type: 'progress',
      priority: 10,
      title: 'You are building a rhythm',
      message: 'This week already has good momentum. Protect the basics and keep it steady.',
      actionLabel: 'View progress',
      route: '#/progress'
    });
  }
}