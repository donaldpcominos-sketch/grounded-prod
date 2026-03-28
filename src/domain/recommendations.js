// src/domain/recommendations.js
import { getDayContext } from './dayContext.js';

function pushRecommendation(list, recommendation) {
  list.push({
    id: recommendation.id || `${recommendation.type || 'item'}-${list.length + 1}`,
    priority: typeof recommendation.priority === 'number' ? recommendation.priority : 999,
    actionLabel: recommendation.actionLabel || 'Open',
    route: recommendation.route || null,
    targetId: recommendation.targetId || null,
    family: recommendation.family || null,
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

// ─── Message families ─────────────────────────────────────────────────────────
//
// A family key groups recommendations that express the same intent,
// regardless of which type (habits, progress, workout, etc.) produced them.
// The selection layer enforces one-per-family so the user never sees two
// items that say the same thing from different angles.
//
// Recs without a family key are treated as unique and never deduplicated
// against each other on this axis.

const FAMILY = {
  PROTECT_RHYTHM: 'protect-rhythm',
  START_SMALL:    'start-small',
  BUILD_MOMENTUM: 'build-momentum',
  CHECK_IN_FIRST: 'check-in-first',
  NOURISH_FIRST:  'nourish-first',
  KEEP_GOING:     'keep-going',
};

function addCheckInRecommendation(list, state, context) {
  if (!isSurfaced(state, 'wellness')) return;
  if (!context.needsCheckIn) return;

  let title = 'Check in';
  let message = 'Start with a quick check-in so the rest of the day feels clearer.';
  let family = FAMILY.CHECK_IN_FIRST;

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
    family,
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
  let family = null;

  if (context.needsCheckIn) {
    title = 'Move later';
    message = 'Check in first, then come back to movement if it still feels right.';
    priority = 80;
    family = FAMILY.CHECK_IN_FIRST;
  } else if (context.energyBand === 'high') {
    title = 'Make space to move';
    message = 'There is good energy here today — this could be a nice time to move.';
    priority = 12;
  } else if (context.energyBand === 'low') {
    title = 'Move lightly';
    message = 'Keep it gentle — even a short session is enough.';
    priority = 60;
    family = FAMILY.START_SMALL;
  } else if (context.gapBand !== 'none') {
    title = 'Start small';
    message = 'A short, easy session is a good way to ease back in.';
    priority = 36;
    family = FAMILY.START_SMALL;
  } else if (context.momentumBand === 'strong') {
    title = 'Keep it going';
    message = 'You have built a good rhythm this week — a bit of movement helps protect it.';
    priority = 24;
    family = FAMILY.PROTECT_RHYTHM;
  } else if (context.momentumBand === 'light') {
    title = 'Make space to move';
    message = 'A little movement today could help shift the tone of the week.';
    priority = 34;
    family = FAMILY.BUILD_MOMENTUM;
  }

  pushRecommendation(list, {
    id: 'workout',
    type: 'workout',
    family,
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
  let family = FAMILY.NOURISH_FIRST;

  if (context.needsCheckIn) {
    priority = 70;
    family = FAMILY.CHECK_IN_FIRST;
  } else if (context.energyBand === 'low') {
    title = 'Eat something simple';
    message = 'Low energy days are a good time to keep food easy and nourishing.';
    priority = 14;
    family = FAMILY.NOURISH_FIRST;
  } else if (context.gapBand !== 'none') {
    title = 'Nourish first';
    message = 'A simple meal or snack is an easy reset point for today.';
    priority = 18;
    family = FAMILY.NOURISH_FIRST;
  } else if (context.momentumBand === 'light') {
    title = 'Nourish yourself';
    message = 'A simple nourishing choice today is a good way to build a little momentum.';
    priority = 28;
    family = FAMILY.BUILD_MOMENTUM;
  }

  pushRecommendation(list, {
    id: 'nutrition',
    type: 'nutrition',
    family,
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
  let family = FAMILY.START_SMALL;

  if (context.needsCheckIn) {
    priority = 75;
    family = FAMILY.CHECK_IN_FIRST;
  } else if (context.energyBand === 'low') {
    title = 'Start small';
    message = 'Keep it light — one or two easy habits is plenty today.';
    priority = 20;
    family = FAMILY.START_SMALL;
  } else if (context.momentumBand === 'strong') {
    title = 'Protect the rhythm';
    message = 'You already have good momentum — a couple of small habits can help keep it steady.';
    priority = 22;
    family = FAMILY.PROTECT_RHYTHM;
  } else if (remaining <= 3) {
    title = 'Keep it going';
    message = 'You are already partway there — a few small wins will round things out nicely.';
    priority = 26;
    family = FAMILY.KEEP_GOING;
  } else if (context.momentumBand === 'light') {
    title = 'Start small';
    message = 'One or two simple habits could help shift the feel of the day.';
    priority = 32;
    family = FAMILY.START_SMALL;
  }

  pushRecommendation(list, {
    id: 'habits',
    type: 'habits',
    family,
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
  let family = null;

  if (context.needsCheckIn) {
    priority = 85;
    family = FAMILY.CHECK_IN_FIRST;
  } else if (context.momentumBand === 'strong') {
    title = 'Capture a moment';
    message = 'You are in a nice rhythm — it could be a good day to save a small Nico moment too.';
    priority = 38;
    family = FAMILY.PROTECT_RHYTHM;
  } else if (context.gapBand === 'long') {
    title = 'Capture a moment';
    message = 'A small Nico memory is an easy way to gently reconnect with the day.';
    priority = 42;
  }

  pushRecommendation(list, {
    id: 'nico',
    type: 'nico',
    family,
    title,
    message,
    actionLabel: 'Open Nico',
    route: '#/nico',
    priority
  });
}



// ─── Selection layer ──────────────────────────────────────────────────────────
//
// In-memory cooldown store. Keyed by recommendation id.
// Survives navigation within a session; cleared on page reload.
// Shape: { dateKey: string, shownCount: number }

const _shownHistory = new Map();

// Signature of the last selected set of ids.
// Makes recordShown idempotent: if getTodayRecommendations is called again
// with the same state (re-render, re-mount) and produces the same selection,
// shown counts are not incremented a second time.
let _lastSelectionSignature = '';

// Returns today's date string (YYYY-MM-DD) for same-day comparisons.
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// How many times a recommendation has been shown today.
function getShownTodayCount(id) {
  const entry = _shownHistory.get(id);
  if (!entry) return 0;
  if (entry.dateKey !== todayKey()) return 0;
  return entry.shownCount;
}

// Staleness penalty added to effective priority when a rec has already been
// shown today. Priority is ascending (lower = higher priority), so we ADD.
// 40 per show nudges a rec down past most alternatives after one appearance
// without ever making it completely ineligible.
const STALENESS_PENALTY_PER_SHOW = 40;

// Apply staleness penalties and return a sorted copy. Does not mutate input.
function applyFreshnessSort(candidates) {
  return candidates
    .map(rec => ({
      ...rec,
      _effectivePriority: rec.priority + getShownTodayCount(rec.id) * STALENESS_PENALTY_PER_SHOW
    }))
    .sort((a, b) => a._effectivePriority - b._effectivePriority);
}

// Select up to `limit` recommendations, enforcing:
//   - one per type   (e.g. no two workout-flavoured items)
//   - one per family (e.g. no two "protect-rhythm" items across any type)
// Operates on the already-sorted candidate list.
function selectWithDedup(sorted, limit) {
  const seenTypes    = new Set();
  const seenFamilies = new Set();
  const selected     = [];

  for (const rec of sorted) {
    if (selected.length >= limit) break;
    if (rec.type   && seenTypes.has(rec.type))     continue;
    if (rec.family && seenFamilies.has(rec.family)) continue;

    seenTypes.add(rec.type);
    if (rec.family) seenFamilies.add(rec.family);
    selected.push(rec);
  }

  return selected;
}

// Build a stable signature from selected recommendation ids.
function selectionSignature(recs) {
  return recs.map(r => r.id).sort().join('|');
}

// Record that a set of recommendations has been shown.
// Idempotent: skipped if selection is unchanged from the last call.
// Resets per-id count automatically when the calendar date changes.
function recordShown(recs) {
  const sig = selectionSignature(recs);
  if (sig === _lastSelectionSignature) return;
  _lastSelectionSignature = sig;

  const key = todayKey();
  for (const rec of recs) {
    const existing = _shownHistory.get(rec.id);
    if (existing && existing.dateKey === key) {
      existing.shownCount += 1;
    } else {
      _shownHistory.set(rec.id, { dateKey: key, shownCount: 1 });
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getTodayRecommendations(state) {
  if (!state || typeof state !== 'object') {
    return [];
  }

  const context = getDayContext(state);
  const candidates = [];

  addCheckInRecommendation(candidates, state, context);
  addWorkoutRecommendation(candidates, state, context);
  addNutritionRecommendation(candidates, state, context);
  addHabitsRecommendation(candidates, state, context);
  addNicoRecommendation(candidates, state, context);

  // ── Selection layer ────────────────────────────────────────────────────────

  // 1. Deduplicate strictly by id.
  const seenIds = new Set();
  const deduped = candidates.filter(rec => {
    if (seenIds.has(rec.id)) return false;
    seenIds.add(rec.id);
    return true;
  });

  // 2. Apply freshness bias — penalise recs shown earlier today, then sort.
  const sorted = applyFreshnessSort(deduped);

  // 3. Pick up to 3, enforcing one-per-type AND one-per-family.
  const selected = selectWithDedup(sorted, 3);

  // 4. Record as shown — idempotent if selection matches last call.
  recordShown(selected);

  // Strip internal sorting field before returning.
  return selected.map(({ _effectivePriority, ...rec }) => rec);
}
