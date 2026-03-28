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
//   withNico        — boolean (true = Nico is coming)
//   outingFocus     — 'nico' | 'me' | 'both'
//   foodIntent      — 'required' | 'nice' | 'none'
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

    // Outing intent signals
    withNico:    answers.withNico    ?? true,
    outingFocus: answers.outingFocus || 'both',
    foodIntent:  answers.foodIntent  || 'nice',

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

  // Nap-timing gate — exclude high-energy or far places when nap is imminent.
  // Only applies when Nico is actually coming.
  if (context.withNico !== false) {
    if (context.priority === 'nap-timing' || context.babyState === 'due-nap-soon') {
      if (candidate.energyRequired === 'high') return false;
      if ((candidate.driveMinutes ?? 0) > 20)  return false;
    }
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
  // Skipped when Nico is not coming — his state shouldn't constrain the ranking.
  if (context.withNico !== false) {
    const babyLevel = babyStateToEnergy(context.babyState);
    if (candidate.energyRequired === babyLevel) score += 3;
  }

  // ── Outing focus signal ───────────────────────────────────────────────────
  // Shifts the ranking toward child-friendly ease (nico), personal quality
  // (me), or balances both (both — no additional bias).
  if (context.outingFocus === 'nico') {
    // Favour low-energy, calm, child-friendly places
    if (candidate.energyRequired === 'low')       score += 3;
    if (candidate.tags?.includes('calm'))         score += 2;
    if (candidate.tags?.includes('easy'))         score += 2;
    if (candidate.tags?.includes('active') &&
        candidate.energyRequired !== 'high')      score += 1; // active but not exhausting
    if (candidate.energyRequired === 'high')      score -= 2; // penalise high-demand places
  }
  if (context.outingFocus === 'me') {
    // Favour quality, scenic, calm, cultural, and food places
    if (candidate.tags?.includes('scenic'))       score += 3;
    if (candidate.tags?.includes('food'))         score += 2;
    if (candidate.tags?.includes('calm'))         score += 2;
    if (candidate.tags?.includes('cultural'))     score += 2;
    if (candidate.rating && candidate.rating >= 4.5) score += 2; // quality matters more
  }
  // outingFocus === 'both' → no additional bias; existing signals handle it

  // ── Food intent signal ────────────────────────────────────────────────────
  // Adjusts how strongly food-tagged places are preferred or deprioritised.
  // Does not hard-exclude anything — soft signals only.
  if (context.foodIntent === 'required') {
    if (candidate.tags?.includes('food'))         score += 6; // strong boost — food is a must
    else                                          score -= 3; // non-food places are less useful
  }
  if (context.foodIntent === 'none') {
    if (candidate.subtype === 'cafe')             score -= 3; // cafés less relevant without food intent
  }
  // foodIntent === 'nice' → no adjustment; food is welcome but not driving

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
  // Only applies when Nico is coming.
  if (context.withNico !== false &&
      ['fussy', 'tired', 'due-nap-soon'].includes(context.babyState) &&
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
// Design: each role branch fires a primary line (always), then optionally a
// secondary qualifier. Universal fallback only fires when role logic produces
// nothing at all, which should be rare.

export function buildWhyNow(candidate, context, role) {
  const tags = candidate.tags || [];
  const parts = [];

  // ── SAFEST: lead with proximity, qualify with effort level ────────────────
  if (role === 'safest') {
    // Primary — proximity
    if (candidate.walkable) {
      parts.push('a short walk away');
    } else if ((candidate.driveMinutes ?? 30) <= 10) {
      parts.push('just a few minutes away');
    } else if (candidate.energyRequired === 'low') {
      parts.push('low effort to get to');
    } else {
      parts.push('easy to reach');
    }

    // Secondary — energy qualifier
    if (['depleted', 'solo'].includes(context.parentEnergy)) {
      parts.push('minimal effort needed');
    } else if (['fussy', 'tired', 'due-nap-soon'].includes(context.babyState)) {
      parts.push('gentle on a tricky moment');
    } else if (candidate.energyRequired === 'low') {
      parts.push('relaxed pace');
    }
  }

  // ── BEST: lead with priority match, qualify with context signal ───────────
  if (role === 'best') {
    // Primary — priority alignment (covers all PRIORITY_VALUES)
    if (context.priority === 'food' && tags.includes('food')) {
      parts.push('good for food');
    } else if (context.priority === 'scenic' && tags.includes('scenic')) {
      parts.push('a beautiful setting');
    } else if (context.priority === 'quiet' && tags.includes('quiet')) {
      parts.push('calm and low stimulation');
    } else if (context.priority === 'active' && tags.includes('active')) {
      parts.push('lets you both move');
    } else if (context.priority === 'cultural' && tags.includes('cultural')) {
      parts.push('something interesting to explore');
    } else if (context.priority === 'nap-timing') {
      parts.push('easy to wrap up when needed');
    } else if (context.priority === 'easy' && candidate.energyRequired === 'low') {
      parts.push('low effort, low fuss');
    } else if (context.hasGoodWalkWindow && candidate.indoorOutdoor === 'outdoor') {
      parts.push('good conditions right now');
    } else {
      // Subtype-level fallback so this branch always fires something meaningful
      const subtypeLine = {
        cafe:               'good for a slow sit-down',
        park:               'fresh air and open space',
        library:            'calm and contained',
        aquarium:           'engaging for Nico',
        zoo:                'lots to look at',
        museum:             'interesting for both of you',
        shopping:           'easy to wander through',
        'play-centre':      'built for kids',
        pool:               'good water time',
        spa:                'easy and restorative',
        attraction:         'worth the trip',
        'indoor-entertainment': 'contained and easy',
        landmark:           'a nice change of scene',
      }[candidate.subtype] || 'a solid fit for today';
      parts.push(subtypeLine);
    }

    // Secondary — high rating worth mentioning
    if (candidate.rating && candidate.rating >= 4.6) {
      parts.push('highly rated');
    }
  }

  // ── FALLBACK: lead with contrast signal vs the other two options ──────────
  if (role === 'fallback') {
    // Primary — contrast with weather, baby state, or subtype character
    if (candidate.indoorOutdoor === 'indoor' && context.weather === 'rainy') {
      parts.push('keeps you dry');
    } else if (candidate.indoorOutdoor === 'indoor' && context.weather === 'hot') {
      parts.push('cool and air-conditioned');
    } else if (candidate.indoorOutdoor === 'outdoor' && ['sunny', 'cloudy'].includes(context.weather)) {
      parts.push('good conditions for being outside');
    } else if (tags.includes('quiet')) {
      parts.push('quieter than the others');
    } else if (tags.includes('food')) {
      parts.push('adds a food stop');
    } else if (candidate.walkable) {
      parts.push('no driving needed');
    } else {
      const subtypeLine = {
        cafe:               'a sit-down option',
        park:               'fresh air option',
        library:            'quiet indoor option',
        aquarium:           'contained indoor option',
        zoo:                'outdoor option with lots to see',
        museum:             'indoor option with something to explore',
        shopping:           'indoor wander option',
        'play-centre':      'dedicated play option',
        pool:               'water option',
        spa:                'calm option',
        attraction:         'a different kind of outing',
        'indoor-entertainment': 'easy indoor option',
        landmark:           'a change of scene',
      }[candidate.subtype] || 'a different kind of option';
      parts.push(subtypeLine);
    }

    // Secondary — baby or parent qualifier
    if (['fussy', 'tired', 'due-nap-soon'].includes(context.babyState) && tags.includes('calm')) {
      parts.push('gentle for right now');
    } else if (context.parentEnergy === 'solo' && candidate.walkable) {
      parts.push('manageable on your own');
    }
  }

  // Universal fallback — should rarely fire given the branches above
  if (parts.length === 0) {
    parts.push('a good fit for right now');
  }

  const line = parts.slice(0, 2).join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1) + '.';
}

// ─── Plan title generator ─────────────────────────────────────────────────────
// Generates a short action-framed title that describes the *plan*, not just
// the place. e.g. "Easy coffee stop" rather than raw place name.
// Used as rec.planTitle — the view renders it above rec.name.

export function buildPlanTitle(candidate, context, role) {
  const tags = candidate.tags || [];
  const sub  = candidate.subtype;

  // ── SAFEST: frame around ease and proximity ───────────────────────────────
  if (role === 'safest') {
    if (sub === 'cafe') {
      return candidate.walkable ? 'Easy coffee stop' : 'Low-key café stop';
    }
    if (sub === 'park') {
      return candidate.walkable ? 'Short walk nearby' : 'Quick outdoor reset';
    }
    if (sub === 'library')  return 'Calm indoor option';
    if (sub === 'shopping') return 'Easy indoor wander';
    if (sub === 'spa')      return 'Low-effort rest stop';
    if (sub === 'aquarium') return 'Calm indoor outing';
    if (sub === 'museum')   return 'Relaxed indoor visit';
    if (sub === 'pool')     return 'Easy water time';
    if (sub === 'play-centre') return 'Easy play stop';

    // Generic safest fallback
    return candidate.walkable ? 'Easy option nearby' : 'Low-effort option';
  }

  // ── BEST: frame around the priority or the place's strongest character ────
  if (role === 'best') {
    if (context.priority === 'food' && tags.includes('food')) {
      return sub === 'cafe' ? 'Good café stop' : 'Food-first option';
    }
    if (context.priority === 'scenic' && tags.includes('scenic')) {
      return 'Beautiful spot nearby';
    }
    if (context.priority === 'quiet' && tags.includes('quiet')) {
      return sub === 'library' ? 'Quiet library visit' : 'Quiet, calm option';
    }
    if (context.priority === 'active' && tags.includes('active')) {
      return sub === 'park' ? 'Active park outing' : 'Get moving option';
    }
    if (context.priority === 'cultural' && tags.includes('cultural')) {
      return sub === 'museum' ? 'Museum visit' : 'Something interesting nearby';
    }
    if (context.priority === 'nap-timing') {
      return 'Nap-friendly option';
    }

    // Subtype-driven when priority doesn't produce a specific title
    const subtypeTitle = {
      cafe:               'Café outing',
      park:               'Park visit',
      library:            'Library visit',
      aquarium:           'Aquarium visit',
      zoo:                'Zoo outing',
      museum:             'Museum visit',
      shopping:           'Shopping browse',
      'play-centre':      'Play centre visit',
      gym:                'Active outing',
      pool:               'Pool time',
      spa:                'Relaxed stop',
      attraction:         'Nearby attraction',
      'indoor-entertainment': 'Indoor activity',
      landmark:           'Landmark visit',
    }[sub];

    return subtypeTitle || 'Best option nearby';
  }

  // ── FALLBACK: frame as an alternative with a distinct angle ───────────────
  if (role === 'fallback') {
    if (candidate.indoorOutdoor === 'indoor' && context.weather === 'rainy') {
      return 'Indoor backup option';
    }
    if (candidate.indoorOutdoor === 'indoor' && context.weather === 'hot') {
      return 'Cool indoor alternative';
    }
    if (sub === 'cafe')      return 'Alternative café stop';
    if (sub === 'park')      return 'Fresh-air alternative';
    if (sub === 'library')   return 'Quiet alternative';
    if (sub === 'shopping')  return 'Low-effort browse';
    if (sub === 'aquarium')  return 'Indoor alternative';
    if (sub === 'museum')    return 'Cultural alternative';
    if (sub === 'pool')      return 'Water-based alternative';
    if (sub === 'play-centre') return 'Structured play alternative';

    return 'Different kind of option';
  }

  return '';
}

// ─── Recommendation builder ───────────────────────────────────────────────────

export function buildRecommendation(candidate, role, context) {
  return {
    id:             candidate.id,
    role,
    planTitle:      buildPlanTitle(candidate, context, role),
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
//
// Diversity rule: prefer distinct subtypes across all three slots.
// Same-subtype is only accepted when no diverse alternative exists.

export function packageRecommendations(ranked, context, allCandidates = []) {
  // Insufficient eligible candidates — relax travel tolerance and re-score
  let pool = ranked;
  if (pool.length < 3 && allCandidates.length > 0) {
    const relaxed = { ...context, travelTolerance: null, radius: null, vibe: 'out' };
    pool = scoreCandidates(allCandidates, relaxed);
  }

  if (pool.length === 0) return [];

  // ── TEMPORARY DEBUG — remove before production ──────────────────────────
  // Logs the top 10 scored candidates so you can inspect why certain places
  // won and diagnose recommendation quality issues.
  if (typeof console !== 'undefined') {
    const top10 = pool.slice(0, 10);
    console.group('[TodayPlans debug] Top ranked candidates');
    top10.forEach((c, i) => {
      console.log(
        `#${i + 1}`,
        c.name,
        '|', c.subtype,
        '| score:', c.score,
        '| walkable:', c.walkable,
        '| drive:', c.driveMinutes != null ? `${c.driveMinutes}min` : '—',
        '| rating:', c.rating ?? '—',
        '| tags:', (c.tags || []).join(', ')
      );
    });
    console.groupEnd();
  }
  // ── END TEMPORARY DEBUG ─────────────────────────────────────────────────

  // ── best = highest composite score (no constraints) ─────────────────────
  const best = pool[0];

  // ── safest = lowest energy + closest; prefer different subtype to best ──
  const bySafety = [...pool].sort((a, b) => {
    const sa = energyRank(a.energyRequired) + (a.walkable ? 0 : 1);
    const sb = energyRank(b.energyRequired) + (b.walkable ? 0 : 1);
    return sa - sb;
  });

  // Try to find a safest pick with a different subtype to best
  const safest =
    bySafety.find(c => c.subtype !== best.subtype) ||
    bySafety[0];

  // ── fallback = prefer distinct subtype from both best and safest ─────────
  const usedSubtypes = new Set([best.subtype, safest.subtype]);
  const usedIds      = new Set([best.id, safest.id]);
  const remainder    = pool.filter(c => !usedIds.has(c.id));

  // Priority order for fallback:
  // 1. Different subtype from both + weather-appropriate
  // 2. Different subtype from both
  // 3. Different subtype from best only
  // 4. Any remaining candidate (deduplication already handled above)

  let fallback = null;

  const weatherIndoor = context.weather === 'rainy' || context.weather === 'hot';

  // Pass 1: diverse subtype + weather preference
  if (!fallback && weatherIndoor) {
    fallback = remainder.find(
      c => !usedSubtypes.has(c.subtype) && c.indoorOutdoor === 'indoor'
    ) || null;
  }

  // Pass 2: diverse subtype, any weather fit
  if (!fallback) {
    fallback = remainder.find(c => !usedSubtypes.has(c.subtype)) || null;
  }

  // Pass 3: different from best at minimum (safest may share subtype with fallback)
  if (!fallback) {
    fallback = remainder.find(c => c.subtype !== best.subtype) || null;
  }

  // Pass 4: nap-timing override — easiest/closest regardless of subtype diversity.
  // Only applies when Nico is coming.
  if (context.withNico !== false &&
      (context.priority === 'nap-timing' || context.babyState === 'due-nap-soon')) {
    const napFriendly = remainder.filter(c => c.energyRequired === 'low');
    if (napFriendly.length > 0) fallback = napFriendly[0];
  }

  // Last resort: next best unused candidate
  if (!fallback) fallback = remainder[0] || pool[Math.min(1, pool.length - 1)];

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
