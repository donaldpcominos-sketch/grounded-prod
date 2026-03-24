// src/domain/events.js
// Converts a dailyState object into a simple list of normalised events.
// This is a pure transformation layer — no Firestore calls.

function pushEvent(events, event) {
  events.push({
    id: event.id || `${event.type}-${events.length + 1}`,
    timestamp: event.timestamp || null,
    ...event
  });
}

export function buildEventsFromState(state) {
  if (!state || typeof state !== 'object') {
    return [];
  }

  const events = [];
  const date = state.date || null;

  // ────────────────────────────────────────────────────────────────────────────
  // Wellness
  // ────────────────────────────────────────────────────────────────────────────
  if (state.wellness) {
    const { mood = '', energy = '', hydrationGlasses = 0 } = state.wellness;

    if (mood || energy || hydrationGlasses > 0) {
      pushEvent(events, {
        id: `wellness-${date}`,
        type: 'wellness',
        category: 'checkin',
        date,
        summary: buildWellnessSummary({ mood, energy, hydrationGlasses }),
        data: {
          mood,
          energy,
          hydrationGlasses
        }
      });
    }

    if (hydrationGlasses > 0) {
      pushEvent(events, {
        id: `hydration-${date}`,
        type: 'hydration',
        category: 'wellbeing',
        date,
        summary: `${hydrationGlasses} glass${hydrationGlasses === 1 ? '' : 'es'} logged`,
        data: {
          hydrationGlasses
        }
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Workout
  // ────────────────────────────────────────────────────────────────────────────
  if (state.workout) {
    const status = state.workout.status || 'planned';

    pushEvent(events, {
      id: `workout-${date}`,
      type: 'workout',
      category: status === 'complete' ? 'completed' : 'planned',
      date,
      summary:
        status === 'complete'
          ? 'Workout completed'
          : 'Workout planned for today',
      data: {
        ...state.workout
      }
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Nutrition
  // ────────────────────────────────────────────────────────────────────────────
  if (state.nutrition?.nourished) {
    pushEvent(events, {
      id: `nutrition-${date}`,
      type: 'nutrition',
      category: 'wellbeing',
      date,
      summary: state.nutrition.note
        ? `Nourishment logged: ${state.nutrition.note}`
        : 'Nourishment logged',
      data: {
        nourished: true,
        note: state.nutrition.note || ''
      }
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Journal
  // ────────────────────────────────────────────────────────────────────────────
  if (state.journal?.entry && state.journal.entry.trim()) {
    pushEvent(events, {
      id: `journal-${date}`,
      type: 'journal',
      category: 'reflection',
      date,
      summary: 'Journal entry saved',
      data: {
        prompt: state.journal.prompt || '',
        entry: state.journal.entry || ''
      }
    });
  }

// ────────────────────────────────────────────────────────────────────────────
// Nico
// ────────────────────────────────────────────────────────────────────────────
if (Array.isArray(state.nico?.naps)) {
  state.nico.naps.forEach((nap, index) => {
    const duration = calculateNapDuration(nap.start, nap.end);

    pushEvent(events, {
      id: `nico-nap-${date}-${index + 1}`,
      type: 'nico_nap',
      category: 'childcare',
      date,
      summary: buildNapSummary(nap, duration),
      data: {
        ...nap,
        duration
      }
    });
  });
}

if (Array.isArray(state.nico?.completedActivities)) {
  state.nico.completedActivities.forEach((activity, index) => {
    pushEvent(events, {
      id: `nico-activity-${date}-${index + 1}`,
      type: 'nico_activity',
      category: 'childcare',
      date,
      summary:
        typeof activity === 'string'
          ? `Activity: ${activity}`
          : 'Activity completed',
      data: {
        activity
      }
    });
  });
}

  // ────────────────────────────────────────────────────────────────────────────
  // Habits
  // ────────────────────────────────────────────────────────────────────────────
  if (state.habits?.completedCount > 0) {
    pushEvent(events, {
      id: `habits-${date}`,
      type: 'habits',
      category: 'routine',
      date,
      summary: `${state.habits.completedCount} of ${state.habits.totalCount} habits completed`,
      data: {
        completedCount: state.habits.completedCount,
        totalCount: state.habits.totalCount,
        items: state.habits.items || []
      }
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Return / continuity
  // ────────────────────────────────────────────────────────────────────────────
  if (state.lastSeen?.gapHours && state.lastSeen.gapHours >= 12) {
    pushEvent(events, {
      id: `return-${date}`,
      type: 'return',
      category: 'continuity',
      date,
      summary: buildReturnSummary(state.lastSeen.gapHours),
      data: {
        gapHours: state.lastSeen.gapHours,
        lastActiveAt: state.lastSeen.lastActiveAt || null
      }
    });
  }

  return events;
}

function buildWellnessSummary({ mood, energy, hydrationGlasses }) {
  const parts = [];

  if (mood) parts.push(`Mood: ${mood}`);
  if (energy) parts.push(`Energy: ${energy}`);
  if (hydrationGlasses > 0) {
    parts.push(`Hydration: ${hydrationGlasses} glass${hydrationGlasses === 1 ? '' : 'es'}`);
  }

  return parts.length ? parts.join(' • ') : 'Wellness check-in logged';
}

function buildNapSummary(nap) {
  if (!nap || typeof nap !== 'object') {
    return 'Nap logged';
  }

  const duration = nap.duration || nap.minutes || null;
  const label = nap.label || nap.name || null;

  if (label && duration) return `${label}: ${duration} min nap`;
  if (duration) return `${duration} min nap`;
  if (label) return `${label} nap logged`;

  return 'Nap logged';
}

function buildReturnSummary(gapHours) {
  if (gapHours >= 72) return 'Welcome back after a few days away';
  if (gapHours >= 24) return 'Welcome back';
  return 'Back again today';
}
function calculateNapDuration(start, end) {
  if (!start || !end) return null;

  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);

  if (
    isNaN(startH) || isNaN(startM) ||
    isNaN(endH) || isNaN(endM)
  ) return null;

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  let diff = endMinutes - startMinutes;

  // Handle overnight naps (just in case)
  if (diff < 0) diff += 24 * 60;

  return diff;
}

function buildNapSummary(nap, duration) {
  if (!nap) return 'Nap logged';

  const { start, end } = nap;

  if (duration !== null) {
    return `${duration} min nap (${start}–${end})`;
  }

  if (start && end) {
    return `Nap (${start}–${end})`;
  }

  return 'Nap logged';
}