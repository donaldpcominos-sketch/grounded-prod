// src/domain/todayPlans.js
//
// All Today Plans behaviour lives here.
// Pure functions only — no Firebase, no DOM, no network calls.
//
// Consumers:
//   src/views/todayPlans.js   — calls these after fetching candidates
//   src/services/todayPlans.js — passes context for saving

// ─── Duration helpers ─────────────────────────────────────────────────────────

export function durationToMinutes(duration) {
  switch (duration) {
    case '30min': return 30;
    case '1hr':   return 60;
    case '2hr':   return 120;
    case 'open':  return 240;
    default:      return 60;
  }
}

// ─── Context builder ──────────────────────────────────────────────────────────
// Takes raw prompt answers and normalises them into a stable context object.
// Called by the view — never calls services.
//
// Fields:
//   parentEnergy    — 'good' | 'low' | 'depleted' | 'solo'
//   babyState       — 'happy' | 'fussy' | 'tired' | 'just-woke' | 'due-nap-soon'
//   weather         — 'sunny' | 'cloudy' | 'hot' | 'rainy'
//   duration        — '30min' | '1hr' | '2hr' | 'open'
//   vibe            — 'home' | 'out' | 'calm' | 'active'
//   travelTolerance — 'walk' | '15min' | '30min' | null
//   priority        — one of PRIORITY_VALUES[].value
//   location        — free-text area name (e.g. "Ubud") — stored for AI copy only

export function buildPlanContext(answers, profile, weatherData) {
  const hasGoodWalkWindow =
    typeof weatherData?.walkWindow === 'string' &&
    !weatherData.walkWindow.includes('high most of today');

  return {
    // Core prompts
    parentEnergy:    answers.parentEnergy    || 'low',
    babyState:       answers.babyState       || 'happy',
    weather:         answers.weather         || 'sunny',
    weatherSource:   answers.weatherSource   || 'manual',
    duration:        answers.duration        || '1hr',
    vibe:            answers.vibe            || 'out',
    travelTolerance: answers.travelTolerance || null,
    priority:        answers.priority        || 'easy',

    // Holiday context — stored for AI copy layer, not used in deterministic scoring
    location:        answers.location        || null,

    // MIGRATION-ONLY aliases — do not add new callers for these fields.
    // These exist so old call sites continue to work during the transition
    // to the new parentEnergy / babyState / travelTolerance field names.
    // Remove once all callers have been updated.
    parentMood: answers.parentEnergy || 'low',   // legacy alias for parentEnergy
    nicoMood:   answers.babyState    || 'happy', // legacy alias for babyState
    radius:     answers.travelTolerance || null, // legacy alias for travelTolerance

    // Optional free text — forwarded to AI copy layer only
    freeText: answers.freeText || null,

    // Derived / injected at build time
    nicoAgeMonths:    profile?.nicoAgeMonths ?? null,
    currentHour:      new Date().getHours(),
    hasGoodWalkWindow,
    timestamp:        new Date().toISOString().slice(0, 10),
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateContext(context) {
  const errors  = [];
  const required = ['parentEnergy', 'babyState', 'weather', 'duration', 'vibe', 'priority'];
  for (const key of required) {
    if (!context?.[key]) errors.push(`${key} is required`);
  }
  return { valid: errors.length === 0, errors };
}

// ─── Priority values (source of truth) ───────────────────────────────────────
// Exported so the view can render the prompt options from a single source.
// 'tags' are the scoring signals amplified for this priority — keep to 2–3
// high-confidence tags that are genuinely discriminating.

export const PRIORITY_VALUES = [
  { value: 'easy',       label: 'Baby-friendly and easy',   tags: ['easy', 'calm', 'indoor'] },
  { value: 'food',       label: 'Great food',               tags: ['food'] },
  { value: 'scenic',     label: 'Beautiful setting',        tags: ['scenic', 'outdoor'] },
  { value: 'quiet',      label: 'Quiet, low stimulation',   tags: ['quiet', 'calm'] },
  { value: 'nap-timing', label: 'Good for nap timing',      tags: ['easy', 'calm'] },
  { value: 'active',     label: 'Get moving',               tags: ['active', 'outdoor'] },
  { value: 'cultural',   label: 'Something interesting',    tags: ['cultural', 'scenic'] },
];

// Return the tag signals for a given priority value.
function priorityTags(priority) {
  return PRIORITY_VALUES.find(p => p.value === priority)?.tags ?? [];
}

// ─── Energy helpers ───────────────────────────────────────────────────────────

function parentEnergyToLevel(parentEnergy) {
  switch (parentEnergy) {
    case 'good':     return 'high';
    case 'low':      return 'medium';
    case 'depleted': return 'low';
    case 'solo':     return 'low';  // solo parenting → treat same as depleted
    default:         return 'medium';
  }
}

function babyStateToEnergy(babyState) {
  switch (babyState) {
    case 'happy':         return 'medium';
    case 'just-woke':    return 'high';
    case 'fussy':         return 'low';
    case 'tired':         return 'low';
    case 'due-nap-soon':  return 'low';
    default:              return 'medium';
  }
}

function energyRank(energyRequired) {
  return { low: 0, medium: 1, high: 2 }[energyRequired] ?? 1;
}

// ─── Eligibility gating ───────────────────────────────────────────────────────
// Hard exclusions applied before scoring.
// A candidate failing any gate is removed entirely from consideration.

function isEligible(candidate, context) {
  // Age gate
  if (
    context.nicoAgeMonths !== null &&
    typeof candidate.nicoMinAge === 'number' &&
    candidate.nicoMinAge > context.nicoAgeMonths
  ) {
    return false;
  }

  // Duration gate — place must be worth visiting in the available time
  const available = durationToMinutes(context.duration);
  if (available < (candidate.durationMin ?? 0)) return false;

  // Weather gate — hard-exclude outdoor-only places in rain
  if (context.weather === 'rainy' && candidate.indoorOutdoor === 'outdoor') return false;

  // Nap-timing gate — exclude high-energy or far places when nap is imminent
  if (context.priority === 'nap-timing' || context.babyState === 'due-nap-soon') {
    if (candidate.energyRequired === 'high') return false;
    if ((candidate.driveMinutes ?? 0) > 20)  return false;
  }

  // Travel tolerance gate
  // Reads travelTolerance first; falls back to legacy radius field
  const tolerance = context.travelTolerance ?? context.radius;
  if (context.vibe === 'home') {
    // Home vibe: only on-site or walkable places with home/indoor tags
    if (!candidate.tags?.includes('home') && (candidate.distanceMetres ?? 9999) > 1500) return false;
  } else if (tolerance === 'walk') {
    if (!candidate.walkable) return false;
  } else if (tolerance === '15min') {
    if ((candidate.driveMinutes ?? 999) > 15) return false;
  } else if (tolerance === '30min') {
    if ((candidate.driveMinutes ?? 999) > 30) return false;
  }

  return true;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────
// Soft signals — higher score = better fit.
//
// Priority scoring design:
//   Each matching priority tag scores +6. Capped at 2 tag matches (+12 max).
//
//   Rationale for cap: tags are inferred, not asserted. A candidate can
//   accumulate 3 priority tag matches through overlapping inference paths
//   (e.g. a café that picks up 'easy', 'calm', and 'indoor' independently).
//   Without a cap, a tag-rich but mediocre candidate can outscore a genuinely
//   better match that only carries 2 of the 3 priority tags. Capping at 2 (+12)
//   keeps priority as the dominant signal — it still outweighs any other single
//   signal cluster (vibe + energy = +7 max) — while preventing stacking from
//   burying the rest of the ranking.
//
//   Single-tag priorities (e.g. 'food') are unaffected by the cap.

function computeScore(candidate, context) {
  let score = 0;

  // ── Priority signal (dominant) ────────────────────────────────────────────
  const pTags = priorityTags(context.priority);
  let priorityMatches = 0;
  for (const tag of pTags) {
    if (priorityMatches >= 2) break;  // cap: max 2 tag matches = +12
    if (candidate.tags?.includes(tag)) {
      score += 6;
      priorityMatches++;
    }
  }

  // ── Weather fit (+3) ──────────────────────────────────────────────────────
  if (Array.isArray(candidate.weatherSuitable) && candidate.weatherSuitable.includes(context.weather)) {
    score += 3;
  }

  // ── Vibe alignment (+4) ───────────────────────────────────────────────────
  if (Array.isArray(candidate.vibes) && candidate.vibes.includes(context.vibe)) {
    score += 4;
  }

  // ── Parent energy alignment (+3) ──────────────────────────────────────────
  const parentLevel = parentEnergyToLevel(context.parentEnergy);
  if (candidate.energyRequired === parentLevel) score += 3;

  // ── Baby state alignment (+3) ─────────────────────────────────────────────
  const babyLevel = babyStateToEnergy(context.babyState);
  if (candidate.energyRequired === babyLevel) score += 3;

  // ── Proximity bonus ───────────────────────────────────────────────────────
  if (candidate.walkable) score += 2;
  else if ((candidate.driveMinutes ?? 30) <= 10) score += 1;

  // ── UV / walk window bonus for parks ─────────────────────────────────────
  if (context.hasGoodWalkWindow && candidate.subtype === 'park') score += 2;

  // ── Time of day adjustments ───────────────────────────────────────────────
  const h = context.currentHour;
  if (candidate.subtype === 'cafe'  && h >= 7  && h <= 10) score += 2;
  if (candidate.subtype === 'park'  && h >= 7  && h <= 10) score += 2;
  if (candidate.subtype === 'park'  && h >= 15 && h <= 17) score += 1;
  if (candidate.indoorOutdoor === 'indoor'  && h >= 11 && h <= 14) score += 1;

  // ── Rating signal (0–2) ───────────────────────────────────────────────────
  const rating = candidate.rating ?? 4.3;
  if (rating >= 4.7)      score += 2;
  else if (rating >= 4.5) score += 1;

  // ── Bad weather indoor bonus ──────────────────────────────────────────────
  if (context.weather === 'rainy' && candidate.indoorOutdoor === 'indoor') score += 2;
  if (context.weather === 'hot'   && candidate.indoorOutdoor === 'indoor') score += 2;

  // ── Low parent energy bonus ───────────────────────────────────────────────
  if (['depleted', 'solo'].includes(context.parentEnergy) && candidate.energyRequired === 'low') {
    score += 2;
  }

  // ── Solo parenting proximity bonus ────────────────────────────────────────
  if (context.parentEnergy === 'solo' && candidate.walkable) score += 2;

  // ── Fussy / tired / nap-due baby: calm preference ────────────────────────
  if (['fussy', 'tired', 'due-nap-soon'].includes(context.babyState) &&
      candidate.tags?.includes('calm')) {
    score += 2;
  }

  return score;
}

// ─── Main scoring function ────────────────────────────────────────────────────

export function scoreCandidates(candidates, context) {
  if (!Array.isArray(candidates) || !context) return [];

  return candidates
    .filter(c => isEligible(c, context))
    .map(c => ({ ...c, score: computeScore(c, context) }))
    .sort((a, b) => b.score - a.score);
}

// ─── whyNow generator ─────────────────────────────────────────────────────────
// Deterministic, context-driven one-liner. Factual signals only — nothing invented.

export function buildWhyNow(candidate, context, role) {
  const parts = [];

  if (role === 'safest') {
    if (candidate.walkable)
      parts.push('a short walk away');
    else if ((candidate.driveMinutes ?? 30) <= 10)
      parts.push('just a few minutes away');
    if (['depleted', 'solo'].includes(context.parentEnergy))
      parts.push('low effort');
    else if (candidate.energyRequired === 'low')
      parts.push('easy and relaxed');
  }

  if (role === 'best') {
    if      (context.priority === 'food'     && candidate.tags?.includes('food'))     parts.push('matches your food priority');
    else if (context.priority === 'scenic'   && candidate.tags?.includes('scenic'))   parts.push('a beautiful setting');
    else if (context.priority === 'quiet'    && candidate.tags?.includes('quiet'))    parts.push('calm and low stimulation');
    else if (context.priority === 'active'   && candidate.tags?.includes('active'))   parts.push('good energy outlet');
    else if (context.priority === 'cultural' && candidate.tags?.includes('cultural')) parts.push('something interesting to explore');
    else if (context.priority === 'nap-timing')                                       parts.push('easy to wrap up when needed');

    if (context.hasGoodWalkWindow && candidate.indoorOutdoor === 'outdoor' && parts.length === 0) {
      parts.push('good conditions right now');
    }
    if (candidate.rating && candidate.rating >= 4.6 && parts.length < 2) {
      parts.push('highly rated');
    }
  }

  if (role === 'fallback') {
    if      (candidate.indoorOutdoor === 'indoor' && context.weather === 'rainy') parts.push('stays dry if the weather turns');
    else if (candidate.indoorOutdoor === 'indoor' && context.weather === 'hot')   parts.push('cool and air-conditioned');
    else if (candidate.tags?.includes('easy'))                                     parts.push('low-key, no pressure');
  }

  // Universal fallbacks when no specific line has fired
  if (parts.length === 0) {
    if (['fussy', 'tired', 'due-nap-soon'].includes(context.babyState))
      parts.push('gentle option for a tricky moment');
    else if (context.parentEnergy === 'solo')
      parts.push('manageable on your own');
    else if (candidate.tags?.includes('scenic'))
      parts.push('beautiful spot nearby');
    else
      parts.push('a good fit for right now');
  }

  const line = parts.slice(0, 2).join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1) + '.';
}

// ─── Recommendation builder ───────────────────────────────────────────────────

export function buildRecommendation(candidate, role, context) {
  return {
    id:             candidate.id,
    role,
    name:           candidate.name,
    subtype:        candidate.subtype,
    address:        candidate.address    || null,
    suburb:         candidate.suburb     || null,
    driveMinutes:   candidate.driveMinutes ?? null,
    walkable:       candidate.walkable   ?? false,
    indoorOutdoor:  candidate.indoorOutdoor,
    energyRequired: candidate.energyRequired,
    rating:         candidate.rating     ?? null,
    description:    candidate.description || '',
    whyNow:         buildWhyNow(candidate, context, role),
    tags:           candidate.tags       || [],
    googleMapsUrl:  candidate.googleMapsUrl || null,
    score:          candidate.score      ?? 0,  // debug only — never shown in UI
  };
}

// ─── Packaging ────────────────────────────────────────────────────────────────
// Always returns exactly 3 recommendations (or fewer only if the total candidate
// pool after eligibility + relaxation is smaller than 3).
// Slot roles: safest · best · fallback

export function packageRecommendations(ranked, context, allCandidates = []) {
  // Insufficient eligible candidates — relax travel tolerance and re-score
  let pool = ranked;
  if (pool.length < 3 && allCandidates.length > 0) {
    const relaxed = { ...context, travelTolerance: null, radius: null, vibe: 'out' };
    pool = scoreCandidates(allCandidates, relaxed);
  }

  if (pool.length === 0) return [];

  // best = highest composite score
  const best = pool[0];

  // safest = lowest energy + closest proximity
  const bySafety = [...pool].sort((a, b) => {
    const sa = energyRank(a.energyRequired) + (a.walkable ? 0 : 1);
    const sb = energyRank(b.energyRequired) + (b.walkable ? 0 : 1);
    return sa - sb;
  });
  const safest = bySafety[0];

  // fallback = different subtype to best and safest; prefer indoor on bad weather
  const usedIds  = new Set([best.id, safest.id]);
  const remainder = pool.filter(c => !usedIds.has(c.id));

  let fallback = remainder[0] || null;

  if (context.weather === 'rainy' || context.weather === 'hot') {
    const indoor = remainder.filter(c => c.indoorOutdoor === 'indoor');
    if (indoor.length > 0) fallback = indoor[0];
  }

  // Nap-timing: prefer the easiest/closest fallback
  if (context.priority === 'nap-timing' || context.babyState === 'due-nap-soon') {
    const napFriendly = remainder.filter(c => c.energyRequired === 'low');
    if (napFriendly.length > 0) fallback = napFriendly[0];
  }

  if (!fallback) fallback = pool[Math.min(1, pool.length - 1)];

  const results = [
    buildRecommendation(safest,   'safest',   context),
    buildRecommendation(best,     'best',     context),
    buildRecommendation(fallback, 'fallback', context),
  ];

  // Deduplicate — if any two slots resolved to the same candidate,
  // replace the later occurrence with the next best unique candidate
  const finalIds = new Set();
  const deduped  = [];
  for (const rec of results) {
    if (!finalIds.has(rec.id)) {
      finalIds.add(rec.id);
      deduped.push(rec);
    } else {
      const next = pool.find(c => !finalIds.has(c.id));
      if (next) {
        finalIds.add(next.id);
        deduped.push(buildRecommendation(next, rec.role, context));
      }
    }
  }

  return deduped.slice(0, 3);
}
