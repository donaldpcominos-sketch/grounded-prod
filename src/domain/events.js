// src/domain/events.js
// Converts daily state into a flat list of normalised events.
// These events are intended for analytics, AI summaries, timelines, and future reporting.

function createEvent({
  type,
  domain,
  date,
  surfaced = true,
  status = 'active', // active | dormant | legacy
  value = null,
  meta = {}
}) {
  return {
    type,
    domain,
    date,
    surfaced,
    status,
    value,
    meta
  };
}

function getCapability(state, key) {
  return state?.capabilities?.[key] || { available: false, surfaced: false };
}

function getFeatureStatus(capability, { legacy = false } = {}) {
  if (legacy) return 'legacy';
  if (!capability?.surfaced) return 'dormant';
  return 'active';
}

function pushIfMeaningful(events, event) {
  if (!event) return;
  events.push(event);
}

function addWellnessEvents(events, state) {
  const capability = getCapability(state, 'wellness');
  const status = getFeatureStatus(capability);
  const date = state?.date;

  const mood = state?.wellness?.mood || '';
  const energy = state?.wellness?.energy || '';
  const hydrationGlasses = state?.wellness?.hydrationGlasses ?? 0;

  if (mood || energy) {
    pushIfMeaningful(events, createEvent({
      type: 'wellness.checkin.completed',
      domain: 'wellness',
      date,
      surfaced: capability.surfaced,
      status,
      value: {
        mood: mood || null,
        energy: energy || null
      }
    }));
  }

  if (hydrationGlasses > 0) {
    pushIfMeaningful(events, createEvent({
      type: 'wellness.hydration.logged',
      domain: 'wellness',
      date,
      surfaced: false,
      status: 'legacy',
      value: {
        glasses: hydrationGlasses
      },
      meta: {
        deprecated: true
      }
    }));
  }
}

function addWorkoutEvents(events, state) {
  const capability = getCapability(state, 'workout');
  const status = getFeatureStatus(capability);
  const date = state?.date;
  const workout = state?.workout;

  if (!workout) return;

  pushIfMeaningful(events, createEvent({
    type: workout.status === 'complete'
      ? 'workout.session.completed'
      : 'workout.session.planned',
    domain: 'workout',
    date,
    surfaced: capability.surfaced,
    status,
    value: {
      status: workout.status ?? 'planned',
      title: workout.title ?? workout.name ?? '',
      type: workout.type ?? '',
      durationMinutes: workout.durationMinutes ?? null
    }
  }));
}

function addNutritionEvents(events, state) {
  const capability = getCapability(state, 'nutrition');
  const status = getFeatureStatus(capability);
  const date = state?.date;

  const nourished = !!state?.nutrition?.nourished;
  const note = state?.nutrition?.note || '';

  if (!nourished && !note) return;

  pushIfMeaningful(events, createEvent({
    type: 'nutrition.log.updated',
    domain: 'nutrition',
    date,
    surfaced: capability.surfaced,
    status,
    value: {
      nourished,
      hasNote: !!note
    }
  }));
}

function addJournalEvents(events, state) {
  const capability = getCapability(state, 'journal');
  const status = getFeatureStatus(capability);
  const date = state?.date;

  const entry = state?.journal?.entry || '';
  const prompt = state?.journal?.prompt || '';

  if (!entry && !prompt) return;

  pushIfMeaningful(events, createEvent({
    type: 'journal.entry.saved',
    domain: 'journal',
    date,
    surfaced: capability.surfaced,
    status,
    value: {
      hasPrompt: !!prompt,
      hasEntry: !!entry,
      entryLength: entry.length
    }
  }));
}

function addNicoEvents(events, state) {
  const capability = getCapability(state, 'nico');
  const status = getFeatureStatus(capability);
  const date = state?.date;

  const naps = Array.isArray(state?.nico?.naps) ? state.nico.naps : [];
  const activities = Array.isArray(state?.nico?.completedActivities)
    ? state.nico.completedActivities
    : [];

  naps.forEach((nap, index) => {
    pushIfMeaningful(events, createEvent({
      type: 'nico.nap.logged',
      domain: 'nico',
      date,
      surfaced: capability.surfaced,
      status,
      value: {
        index,
        start: nap?.start ?? null,
        end: nap?.end ?? null,
        durationMinutes: getNapDurationMinutes(nap?.start, nap?.end)
      }
    }));
  });

  activities.forEach((activity, index) => {
    pushIfMeaningful(events, createEvent({
      type: 'nico.activity.completed',
      domain: 'nico',
      date,
      surfaced: capability.surfaced,
      status,
      value: {
        index,
        activity: typeof activity === 'string' ? activity : (activity?.label ?? '')
      }
    }));
  });
}

function addHabitEvents(events, state) {
  const capability = getCapability(state, 'habits');
  const status = getFeatureStatus(capability);
  const date = state?.date;

  const items = Array.isArray(state?.habits?.items) ? state.habits.items : [];
  const completedItems = items.filter(item => item?.completed);

  completedItems.forEach(item => {
    pushIfMeaningful(events, createEvent({
      type: 'habit.completed',
      domain: 'habits',
      date,
      surfaced: capability.surfaced,
      status,
      value: {
        id: item.id,
        label: item.label ?? item.name ?? ''
      }
    }));
  });

  if (items.length > 0) {
    pushIfMeaningful(events, createEvent({
      type: 'habits.summary',
      domain: 'habits',
      date,
      surfaced: capability.surfaced,
      status,
      value: {
        completedCount: state?.habits?.completedCount ?? 0,
        totalCount: state?.habits?.totalCount ?? items.length
      }
    }));
  }
}

function addProgressEvents(events, state) {
  const date = state?.date;
  const progress = state?.progress;

  if (!(progress?.activeHasAnyData ?? progress?.hasAnyData)) return;

  pushIfMeaningful(events, createEvent({
    type: 'progress.week.snapshot',
    domain: 'progress',
    date,
    surfaced: false,
    status: 'active',
    value: {
      activeWorkoutsDone: progress?.activeWorkoutsDone ?? 0,
      activeNourishedDays: progress?.activeNourishedDays ?? 0,
      activeHabitsDays: progress?.activeHabitsDays ?? 0,
      activeCheckInDays: progress?.activeCheckInDays ?? 0,
      activeHasAnyData: progress?.activeHasAnyData ?? false
    },
    meta: {
      legacy: {
        workoutsDone: progress?.workoutsDone ?? 0,
        journalDays: progress?.journalDays ?? 0,
        nourishedDays: progress?.nourishedDays ?? 0,
        avgHydration: progress?.avgHydration ?? 0,
        hasAnyData: progress?.hasAnyData ?? false
      },
      includesDormantJournal: progress?.includesDormantJournal ?? true,
      includesLegacyHydration: progress?.includesLegacyHydration ?? true
    }
  }));
}

function addLastSeenEvents(events, state) {
  const date = state?.date;
  const gapHours = state?.lastSeen?.gapHours ?? 0;

  pushIfMeaningful(events, createEvent({
    type: 'app.last_seen.snapshot',
    domain: 'system',
    date,
    surfaced: false,
    status: 'active',
    value: {
      gapHours,
      lastActiveAt: state?.lastSeen?.lastActiveAt ?? null
    }
  }));
}

function getNapDurationMinutes(start, end) {
  if (!start || !end) return null;

  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);

  if (startMinutes == null || endMinutes == null) return null;
  if (endMinutes < startMinutes) return null;

  return endMinutes - startMinutes;
}

function timeToMinutes(value) {
  if (typeof value !== 'string') return null;

  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return (hours * 60) + minutes;
}

export function getDailyEvents(state) {
  if (!state || typeof state !== 'object') {
    return [];
  }

  const events = [];

  addWellnessEvents(events, state);
  addWorkoutEvents(events, state);
  addNutritionEvents(events, state);
  addJournalEvents(events, state);
  addNicoEvents(events, state);
  addHabitEvents(events, state);
  addProgressEvents(events, state);
  addLastSeenEvents(events, state);

  return events;
}