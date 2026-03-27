// src/domain/recommendations.js
import { getDayContext } from './dayContext.js';

function pushRecommendation(list, recommendation) {
  list.push({
    id: recommendation.id || `${recommendation.type || 'item'}-${list.length + 1}`,
    priority: typeof recommendation.priority === 'number' ? recommendation.priority : 999,
    actionLabel: recommendation.actionLabel || 'Open',
    route: recommendation.route || null,
    targetId: recommendation.targetId || null,
    ...recommendation
  });
}

function isSurfaced(state, key) {
  return !!state?.capabilities?.[key]?.surfaced;
}

function hasNutritionLogged(state) {
  return !!state?.nutrition?.nourished || !!state?.nutrition?.note;
}

function hasIncompleteHabits(state) {
  const completed = state?.habits?.completedCount ?? 0;
  const total = state?.habits?.totalCount ?? 0;
  return total > 0 && completed < total;
}

function hasNicoActivity(state) {
  const naps = state?.nico?.naps ?? [];
  const activities = state?.nico?.completedActivities ?? [];
  return naps.length > 0 || activities.length > 0;
}

function addCheckInRecommendation(list, state, context) {
  if (!isSurfaced(state, 'wellness')) return;
  if (!context.needsCheckIn) return;

  let title = 'Check in';
  let message = 'Start with a quick check-in so the rest of the day feels clearer.';

  if (context.gapBand === 'long') {
    title = 'Start gently';
    message = 'Ease back in with a quick check-in and keep today simple.';
  } else if (context.gapBand === 'short') {
    title = 'Start gently';
    message = 'A quick check-in is a gentle way to reset today.';
  }

  pushRecommendation(list, {
    id: 'check-in',
    type: 'wellness',
    title,
    message,
    actionLabel: 'Open check-in',
    targetId: 'quickCheckin',
    priority: 1
  });
}

function addWorkoutRecommendation(list, state, context) {
  if (!isSurfaced(state, 'workout')) return;

  const workout = state?.workout;
  if (!workout || workout.status === 'complete') return;

  let title = 'Make space to move';
  let message = 'A little movement could feel good today.';
  let priority = 50;

  if (context.needsCheckIn) {
    title = 'Move later';
    message = 'Check in first, then come back to movement if it still feels right.';
    priority = 80;
  } else if (context.energyBand === 'high') {
    title = 'Make space to move';
    message = 'There is good energy here today — this could be a nice time to move.';
    priority = 12;
  } else if (context.energyBand === 'low') {
    title = 'Move lightly';
    message = 'Keep it gentle — even a short session is enough.';
    priority = 60;
  } else if (context.gapBand !== 'none') {
    title = 'Start small';
    message = 'A short, easy session is a good way to ease back in.';
    priority = 36;
  } else if (context.momentumBand === 'strong') {
    title = 'Keep it going';
    message = 'You have built a good rhythm this week — a bit of movement helps protect it.';
    priority = 24;
  } else if (context.momentumBand === 'light') {
    title = 'Make space to move';
    message = 'A little movement today could help shift the tone of the week.';
    priority = 34;
  }

  pushRecommendation(list, {
    id: 'workout',
    type: 'workout',
    title,
    message,
    actionLabel: 'Open workout',
    route: '#/workouts',
    priority
  });
}

function addNutritionRecommendation(list, state, context) {
  if (!isSurfaced(state, 'nutrition')) return;
  if (hasNutritionLogged(state)) return;

  let title = 'Eat something simple';
  let message = 'A nourishing meal or snack could help steady the day.';
  let priority = 45;

  if (context.needsCheckIn) {
    priority = 70;
  } else if (context.energyBand === 'low') {
    title = 'Eat something simple';
    message = 'Low energy days are a good time to keep food easy and nourishing.';
    priority = 14;
  } else if (context.gapBand !== 'none') {
    title = 'Nourish first';
    message = 'A simple meal or snack is an easy reset point for today.';
    priority = 18;
  } else if (context.momentumBand === 'light') {
    title = 'Nourish yourself';
    message = 'A simple nourishing choice today is a good way to build a little momentum.';
    priority = 28;
  }

  pushRecommendation(list, {
    id: 'nutrition',
    type: 'nutrition',
    title,
    message,
    actionLabel: 'See ideas',
    targetId: 'nourishmentCard',
    priority
  });
}

function addHabitsRecommendation(list, state, context) {
  if (!isSurfaced(state, 'habits')) return;
  if (!hasIncompleteHabits(state)) return;

  const completed = state?.habits?.completedCount ?? 0;
  const total = state?.habits?.totalCount ?? 0;
  const remaining = Math.max(total - completed, 0);

  let title = 'Start small';
  let message = 'Pick one easy habit and let that be enough for now.';
  let priority = 55;

  if (context.needsCheckIn) {
    priority = 75;
  } else if (context.energyBand === 'low') {
    title = 'Start small';
    message = 'Keep it light — one or two easy habits is plenty today.';
    priority = 20;
  } else if (context.momentumBand === 'strong') {
    title = 'Protect the rhythm';
    message = 'You already have good momentum — a couple of small habits can help keep it steady.';
    priority = 22;
  } else if (remaining <= 3) {
    title = 'Keep it going';
    message = 'You are already partway there — a few small wins will round things out nicely.';
    priority = 26;
  } else if (context.momentumBand === 'light') {
    title = 'Start small';
    message = 'One or two simple habits could help shift the feel of the day.';
    priority = 32;
  }

  pushRecommendation(list, {
    id: 'habits',
    type: 'habits',
    title,
    message,
    actionLabel: 'Open habits',
    route: '#/habits',
    priority
  });
}

function addNicoRecommendation(list, state, context) {
  if (!isSurfaced(state, 'nico')) return;
  if (hasNicoActivity(state)) return;

  let title = 'Capture a moment';
  let message = 'Add a small Nico moment from today while it is fresh.';
  let priority = 65;

  if (context.needsCheckIn) {
    priority = 85;
  } else if (context.momentumBand === 'strong') {
    title = 'Capture a moment';
    message = 'You are in a nice rhythm — it could be a good day to save a small Nico moment too.';
    priority = 38;
  } else if (context.gapBand === 'long') {
    title = 'Capture a moment';
    message = 'A small Nico memory is an easy way to gently reconnect with the day.';
    priority = 42;
  }

  pushRecommendation(list, {
    id: 'nico',
    type: 'nico',
    title,
    message,
    actionLabel: 'Open Nico',
    route: '#/nico',
    priority
  });
}

function addProgressRecommendation(list, state, context) {
  const hasActiveProgress =
    state?.progress?.activeHasAnyData ??
    state?.progress?.hasAnyData ??
    false;

  if (!hasActiveProgress) return;
  if (context.needsCheckIn) return;

  let title = 'Protect the rhythm';
  let message = 'A couple of small actions today will help keep the week feeling steady.';
  let priority = 90;

  if (context.momentumBand === 'strong') {
    title = 'Protect the rhythm';
    message = 'You have already built good momentum — today is more about protecting it than doing everything.';
    priority = 30;
  } else if (context.momentumBand === 'light') {
    title = 'Build a little momentum';
    message = 'One or two small actions today could help shift the feel of the week.';
    priority = 52;
  } else {
    return;
  }

  pushRecommendation(list, {
    id: 'progress',
    type: 'progress',
    title,
    message,
    actionLabel: 'View today',
    targetId: 'todaySummary',
    priority
  });
}

export function getTodayRecommendations(state) {
  if (!state || typeof state !== 'object') {
    return [];
  }

  const context = getDayContext(state);
  const recommendations = [];

  addCheckInRecommendation(recommendations, state, context);
  addWorkoutRecommendation(recommendations, state, context);
  addNutritionRecommendation(recommendations, state, context);
  addHabitsRecommendation(recommendations, state, context);
  addNicoRecommendation(recommendations, state, context);
  addProgressRecommendation(recommendations, state, context);

  return recommendations
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3);
}