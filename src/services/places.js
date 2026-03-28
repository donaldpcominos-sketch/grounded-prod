// src/services/places.js
//
// Fetches nearby place candidates via the Netlify /api/places function
// (which calls Google Places API server-side — no API key in the client).
//
// Responsibilities:
//   - Fetch raw place results from the backend
//   - Enrich each raw place into a PlaceCandidate shape
//   - Cache results in localStorage (30-min TTL — places don't change fast)
//   - Fall back to a minimal static dataset if the network call fails
//
// This file owns data access and normalisation ONLY.
// All scoring, ranking, and recommendation logic lives in src/domain/todayPlans.js.

// ─── Cache config ─────────────────────────────────────────────────────────────

const CACHE_KEY    = 'grounded_places_cache';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ─── Cache helpers ────────────────────────────────────────────────────────────

function writeCache(data, cacheKey) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // storage full or unavailable — silently skip
  }
}

function readCache(cacheKey) {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    const ageMs = Date.now() - ts;
    return { data, ageMs, stale: ageMs > CACHE_TTL_MS };
  } catch {
    return null;
  }
}

// Build a cache key that encodes the location + radius so different searches
// don't collide. Rounds lat/lng to 2 decimal places (~1 km precision).
function buildCacheKey(lat, lng, radiusMetres) {
  const rLat = Math.round(lat * 100) / 100;
  const rLng = Math.round(lng * 100) / 100;
  return `${CACHE_KEY}_${rLat}_${rLng}_${radiusMetres}`;
}

// ─── Lookup tables ────────────────────────────────────────────────────────────
// These functions infer PlaceCandidate fields from the raw Google Places shape.
// They are intentionally conservative — when signals are absent we default to
// the safest / most permissive value rather than guessing wrongly.

// Google Places types → our subtype
const TYPE_MAP = {
  park:                'park',
  natural_feature:     'park',
  campground:          'park',
  cafe:                'cafe',
  coffee:              'cafe',
  restaurant:          'cafe',
  food:                'cafe',
  library:             'library',
  aquarium:            'aquarium',
  zoo:                 'zoo',
  museum:              'museum',
  art_gallery:         'museum',
  shopping_mall:       'shopping',
  supermarket:         'shopping',
  store:               'shopping',
  amusement_park:      'play-centre',
  bowling_alley:       'play-centre',
  gym:                 'gym',
  stadium:             'gym',
  tourist_attraction:  'attraction',
  point_of_interest:   'attraction',
  establishment:       'attraction',
  swimming_pool:       'pool',
  spa:                 'spa',
  beauty_salon:        'spa',
  book_store:          'library',
  movie_theater:       'indoor-entertainment',
  church:              'landmark',
  place_of_worship:    'landmark',
};

const ENERGY_BY_SUBTYPE = {
  park:               'medium',
  cafe:               'low',
  library:            'low',
  aquarium:           'low',
  zoo:                'medium',
  museum:             'low',
  shopping:           'low',
  'play-centre':      'high',
  gym:                'high',
  pool:               'medium',
  spa:                'low',
  attraction:         'medium',
  'indoor-entertainment': 'low',
  landmark:           'low',
};

const INDOOR_OUTDOOR_BY_SUBTYPE = {
  park:               'outdoor',
  cafe:               'indoor',
  library:            'indoor',
  aquarium:           'indoor',
  zoo:                'outdoor',
  museum:             'indoor',
  shopping:           'indoor',
  'play-centre':      'indoor',
  gym:                'indoor',
  pool:               'both',
  spa:                'indoor',
  attraction:         'both',
  'indoor-entertainment': 'indoor',
  landmark:           'outdoor',
};

const WEATHER_BY_SUBTYPE = {
  park:               ['sunny', 'cloudy'],
  cafe:               ['sunny', 'cloudy', 'hot', 'rainy'],
  library:            ['sunny', 'cloudy', 'hot', 'rainy'],
  aquarium:           ['sunny', 'cloudy', 'hot', 'rainy'],
  zoo:                ['sunny', 'cloudy'],
  museum:             ['sunny', 'cloudy', 'hot', 'rainy'],
  shopping:           ['sunny', 'cloudy', 'hot', 'rainy'],
  'play-centre':      ['sunny', 'cloudy', 'hot', 'rainy'],
  gym:                ['sunny', 'cloudy', 'hot', 'rainy'],
  pool:               ['sunny', 'hot'],
  spa:                ['sunny', 'cloudy', 'hot', 'rainy'],
  attraction:         ['sunny', 'cloudy'],
  'indoor-entertainment': ['sunny', 'cloudy', 'hot', 'rainy'],
  landmark:           ['sunny', 'cloudy'],
};

const VIBES_BY_SUBTYPE = {
  park:               ['out', 'active', 'calm'],
  cafe:               ['out', 'calm'],
  library:            ['calm', 'home'],
  aquarium:           ['out', 'calm'],
  zoo:                ['out', 'active'],
  museum:             ['out', 'calm'],
  shopping:           ['out', 'calm'],
  'play-centre':      ['out', 'active'],
  gym:                ['active'],
  pool:               ['out', 'active'],
  spa:                ['calm'],
  attraction:         ['out'],
  'indoor-entertainment': ['out', 'calm'],
  landmark:           ['out'],
};

// Base tags — only what can be reliably inferred from subtype alone.
// Removal notes vs earlier revision:
//   'scenic'  — removed from park/landmark/attraction (too noisy at subtype level;
//               added only via specific name patterns in buildInferredTags)
//   'calm'    — removed from museum (varies too widely by venue)
//   'easy'    — removed from shopping (crowded malls are not easy with a baby)
//   'shaded'  — removed entirely (implies outdoor shade, which we cannot know)
const BASE_TAGS_BY_SUBTYPE = {
  park:               ['outdoor', 'fresh-air', 'walking'],
  cafe:               ['indoor', 'calm', 'food', 'easy'],
  library:            ['indoor', 'calm', 'quiet', 'easy'],
  aquarium:           ['indoor', 'cool'],
  zoo:                ['outdoor', 'active'],
  museum:             ['indoor', 'easy'],
  shopping:           ['indoor', 'cool'],
  'play-centre':      ['indoor', 'active', 'cool'],
  gym:                ['indoor', 'active'],
  pool:               ['active', 'water', 'cool'],
  spa:                ['indoor', 'calm', 'easy'],
  attraction:         [],
  'indoor-entertainment': ['indoor', 'easy'],
  landmark:           ['outdoor'],
};

const DURATION_MIN_BY_SUBTYPE = {
  park:               20,
  cafe:               20,
  library:            20,
  aquarium:           45,
  zoo:                60,
  museum:             45,
  shopping:           30,
  'play-centre':      45,
  gym:                30,
  pool:               45,
  spa:                30,
  attraction:         30,
  'indoor-entertainment': 60,
  landmark:           15,
};

// ─── Drive time helper ────────────────────────────────────────────────────────

function metresToDriveMinutes(distanceMetres) {
  if (!distanceMetres) return null;
  // ~25 km/h average urban speed
  return Math.round((distanceMetres / 1000) / 25 * 60);
}

function isWalkable(distanceMetres) {
  return typeof distanceMetres === 'number' && distanceMetres <= 1500;
}

function inferSubtype(types = []) {
  for (const t of types) {
    if (TYPE_MAP[t]) return TYPE_MAP[t];
  }
  return 'attraction';
}

// ─── Contextual tag inference ─────────────────────────────────────────────────
// Supplements base tags with signals conservatively inferred from raw place data.
//
// Design rules for this function:
//   1. Each tag addition requires an explicit evidence comment.
//   2. Subtype-level inferences are limited to characteristics that hold for
//      the overwhelming majority of that subtype. When in doubt, omit.
//   3. Name-pattern inferences use anchored, specific terms only — no broad
//      words that appear incidentally in unrelated place names.
//   4. 'scenic' is never inferred from subtype alone — only from specific
//      name patterns that reliably indicate a scenic natural or cultural feature.
//   5. 'calm' is never inferred from museum subtype — visitor experience varies
//      too much. Only spa and library carry this guarantee.
//   6. 'easy' is never inferred for shopping — malls with a baby are not easy.
//   7. 'shaded' is omitted entirely — implies outdoor shade, which cannot be
//      inferred from Places API data without photo or review signals.

function buildInferredTags(raw, subtype, baseTags) {
  const tags = [...baseTags];
  const name  = (raw.name || '').toLowerCase();
  const types = raw.types  || [];

  function add(tag) {
    if (!tags.includes(tag)) tags.push(tag);
  }

  // ── Subtype-level inferences ──────────────────────────────────────────────

  // food: any place where eating is the primary purpose
  if (['cafe', 'restaurant', 'food', 'meal_delivery', 'meal_takeaway', 'bakery'].some(t => types.includes(t))) {
    add('food');
  }

  // calm: only subtypes where a calm environment is near-universal
  //   spa     → designed for quiet relaxation
  //   library → quiet by institutional norm
  // (museum excluded — children's museums, natural history museums, etc. are often busy)
  if (['spa', 'library'].includes(subtype)) add('calm');

  // indoor / outdoor: make explicit even if already in base tags, to catch
  // any subtype whose base tags were trimmed
  if (INDOOR_OUTDOOR_BY_SUBTYPE[subtype] === 'indoor')  add('indoor');
  if (INDOOR_OUTDOOR_BY_SUBTYPE[subtype] === 'outdoor') add('outdoor');

  // cool: indoor places are reliably air-conditioned in tropical climates
  if (INDOOR_OUTDOOR_BY_SUBTYPE[subtype] === 'indoor') add('cool');

  // easy: low-energy subtypes that are also low-logistics with a baby
  // Note: shopping is low-energy but excluded here — logistics (lifts, nappy
  // rooms, crowds) make malls unpredictable
  if (ENERGY_BY_SUBTYPE[subtype] === 'low' && subtype !== 'shopping') add('easy');

  // active: high-energy subtypes
  if (ENERGY_BY_SUBTYPE[subtype] === 'high') add('active');

  // ── Name-pattern inferences ───────────────────────────────────────────────
  // Only anchored, high-confidence patterns. Word boundaries enforced where
  // the term might appear as a substring in unrelated names.

  // Water features: beach, lagoon, waterfall, lake, river, ocean, sea
  // These terms are specific enough that false positives are rare.
  if (/\b(beach|lagoon|waterfall|lake|river|ocean|sea)\b/.test(name)) {
    add('water');
    add('scenic');
    add('outdoor');
  }

  // Gardens and botanical spaces: reliably scenic and outdoor
  if (/\b(garden|botanical)\b/.test(name)) {
    add('scenic');
    add('outdoor');
    add('fresh-air');
  }

  // Temples and rice terraces: culturally and visually distinctive landmarks
  // 'pura' is the Balinese term for temple (specific enough to be safe)
  // 'paddy' / 'sawah' / 'rice terrace' are specific enough; 'rice' alone is not
  if (/\b(temple|pura|rice terrace|rice field|paddy|sawah)\b/.test(name)) {
    add('scenic');
    add('cultural');
    add('outdoor');
  }

  // Markets: food + browsing energy
  // '\bmarket\b' is specific; avoids matching 'supermarket' which has its own subtype
  if (/\bmarket\b/.test(name)) {
    add('food');
    add('active');
  }

  // Café / coffee in name: reliable food signal, also indoor + easy
  // 'bale' removed — in Bali it means an open-air pavilion, not a café
  // 'warung' retained — specifically means a small local eatery
  if (/\b(cafe|coffee|warung|bistro)\b/.test(name)) {
    add('food');
    add('indoor');
    add('easy');
  }

  // Spa / wellness / retreat: calm + indoor + easy
  // 'yoga' removed — yoga studios are active, not reliably calm for a visitor
  if (/\b(spa|wellness|retreat)\b/.test(name)) {
    add('calm');
    add('indoor');
    add('easy');
  }

  // Pool / swim: water + cool
  if (/\b(pool|swim)\b/.test(name)) {
    add('water');
    add('cool');
  }

  return tags;
}

// Build a lean description from available place data (no AI at this stage)
function buildStaticDescription(place, subtype) {
  const rating   = place.rating ? `Rated ${place.rating.toFixed(1)}` : null;
  const vicinity = place.vicinity || place.formatted_address || null;
  const subtypeLabel = {
    park:               'A nearby park',
    cafe:               'A local café',
    library:            'The local library',
    aquarium:           'An aquarium',
    zoo:                'A zoo',
    museum:             'A museum or gallery',
    shopping:           'A shopping centre',
    'play-centre':      'An indoor play centre',
    gym:                'A gym or fitness centre',
    pool:               'A swimming pool',
    spa:                'A spa or wellness centre',
    attraction:         'A local attraction',
    'indoor-entertainment': 'An entertainment venue',
    landmark:           'A local landmark',
  }[subtype] || 'A nearby place';

  const parts = [subtypeLabel];
  if (vicinity) parts.push(`near ${vicinity}`);
  if (rating)   parts.push(`· ${rating}`);
  return parts.join(' ');
}

// ─── Main enrichment function ─────────────────────────────────────────────────

function enrichPlace(raw) {
  const subtype  = inferSubtype(raw.types || []);
  const baseTags = BASE_TAGS_BY_SUBTYPE[subtype] ?? [];
  const tags     = buildInferredTags(raw, subtype, baseTags);

  return {
    id:             raw.place_id,
    name:           raw.name,
    subtype,
    type:           INDOOR_OUTDOOR_BY_SUBTYPE[subtype] === 'outdoor' ? 'outdoor' : 'local',

    address:        raw.vicinity || raw.formatted_address || null,
    suburb:         extractSuburb(raw.vicinity || raw.formatted_address || ''),
    lat:            raw.geometry?.location?.lat ?? null,
    lng:            raw.geometry?.location?.lng ?? null,
    distanceMetres: raw._distanceMetres ?? null,  // injected by Netlify fn
    driveMinutes:   metresToDriveMinutes(raw._distanceMetres),
    walkable:       isWalkable(raw._distanceMetres),

    rating:           raw.rating ?? null,
    userRatingsTotal: raw.user_ratings_total ?? 0,
    openNow:          raw.opening_hours?.open_now ?? true,

    energyRequired:  ENERGY_BY_SUBTYPE[subtype]         ?? 'medium',
    indoorOutdoor:   INDOOR_OUTDOOR_BY_SUBTYPE[subtype] ?? 'both',
    weatherSuitable: WEATHER_BY_SUBTYPE[subtype]        ?? ['sunny', 'cloudy'],
    vibes:           VIBES_BY_SUBTYPE[subtype]           ?? ['out'],
    tags,
    durationMin:     DURATION_MIN_BY_SUBTYPE[subtype]   ?? 30,
    nicoMinAge:      0,

    description:   buildStaticDescription(raw, subtype),
    googleMapsUrl: raw.place_id
      ? `https://maps.google.com/?place_id=${raw.place_id}`
      : null,
  };
}

function extractSuburb(vicinity) {
  if (!vicinity) return null;
  return vicinity.split(',')[0].trim() || null;
}

// ─── Static fallback dataset ──────────────────────────────────────────────────
// Used when the Netlify function is unreachable (offline, cold-start failure,
// quota exceeded, or no location provided).
//
// IMPORTANT: these are activity archetypes, not real places. Rules:
//   - No real place names, addresses, coordinates, or Google Maps URLs
//   - No location-specific copy
//   - Safe to render anywhere in the world
//   - distanceMetres is null for zero-travel options (villa, pool) so the UI
//     does not display "0 m away" — the view must handle null distanceMetres
//     gracefully, which it must do for real candidates too

const STATIC_FALLBACK_CANDIDATES = [
  {
    id:              'fallback-villa-reset',
    name:            'Stay in — villa or room reset',
    subtype:         'spa',
    type:            'local',
    address:         null,
    suburb:          null,
    lat:             null,
    lng:             null,
    distanceMetres:  null,   // no travel needed — null prevents "0 m away" in UI
    driveMinutes:    null,
    walkable:        true,   // no travel = always walkable
    rating:          null,
    userRatingsTotal: 0,
    openNow:         true,
    energyRequired:  'low',
    indoorOutdoor:   'indoor',
    weatherSuitable: ['sunny', 'cloudy', 'hot', 'rainy'],
    vibes:           ['home', 'calm'],
    tags:            ['indoor', 'calm', 'easy', 'quiet', 'cool'],
    durationMin:     0,
    nicoMinAge:      0,
    description:     'Stay close to base — a calm reset in the comfort of your accommodation.',
    googleMapsUrl:   null,
  },
  {
    id:              'fallback-nearby-cafe',
    name:            'Nearby café',
    subtype:         'cafe',
    type:            'local',
    address:         null,
    suburb:          null,
    lat:             null,
    lng:             null,
    distanceMetres:  600,
    driveMinutes:    3,
    walkable:        true,
    rating:          null,
    userRatingsTotal: 0,
    openNow:         true,
    energyRequired:  'low',
    indoorOutdoor:   'indoor',
    weatherSuitable: ['sunny', 'cloudy', 'hot', 'rainy'],
    vibes:           ['out', 'calm'],
    tags:            ['indoor', 'calm', 'food', 'easy', 'cool'],
    durationMin:     20,
    nicoMinAge:      0,
    description:     'A short walk to the nearest café — low effort, good for a slow start.',
    googleMapsUrl:   null,
  },
  {
    id:              'fallback-short-walk',
    name:            'Short walk nearby',
    subtype:         'park',
    type:            'outdoor',
    address:         null,
    suburb:          null,
    lat:             null,
    lng:             null,
    distanceMetres:  500,
    driveMinutes:    2,
    walkable:        true,
    rating:          null,
    userRatingsTotal: 0,
    openNow:         true,
    energyRequired:  'low',
    indoorOutdoor:   'outdoor',
    weatherSuitable: ['sunny', 'cloudy'],
    vibes:           ['out', 'calm'],
    tags:            ['outdoor', 'fresh-air', 'easy', 'walking'],
    durationMin:     15,
    nicoMinAge:      0,
    description:     'A gentle walk nearby — fresh air and a change of scene without the effort.',
    googleMapsUrl:   null,
  },
  {
    id:              'fallback-pool-time',
    name:            'Pool time',
    subtype:         'pool',
    type:            'local',
    address:         null,
    suburb:          null,
    lat:             null,
    lng:             null,
    distanceMetres:  null,   // on-site pool — null prevents "0 m away" in UI
    driveMinutes:    null,
    walkable:        true,
    rating:          null,
    userRatingsTotal: 0,
    openNow:         true,
    energyRequired:  'medium',
    indoorOutdoor:   'outdoor',
    weatherSuitable: ['sunny', 'hot'],
    vibes:           ['home', 'active', 'calm'],
    tags:            ['water', 'active', 'cool', 'easy'],
    durationMin:     20,
    nicoMinAge:      3,
    description:     'A relaxed splash in the pool — great for hot days and happy babies.',
    googleMapsUrl:   null,
  },
  {
    id:              'fallback-local-browse',
    name:            'Local market or shops',
    subtype:         'shopping',
    type:            'local',
    address:         null,
    suburb:          null,
    lat:             null,
    lng:             null,
    distanceMetres:  1200,
    driveMinutes:    5,
    walkable:        true,
    rating:          null,
    userRatingsTotal: 0,
    openNow:         true,
    energyRequired:  'low',
    indoorOutdoor:   'both',
    weatherSuitable: ['sunny', 'cloudy', 'hot', 'rainy'],
    vibes:           ['out', 'calm'],
    tags:            ['food', 'active'],   // 'easy' omitted — shopping logistics vary
    durationMin:     20,
    nicoMinAge:      0,
    description:     'A browse through a local market or shops — easy, unhurried, and interesting.',
    googleMapsUrl:   null,
  },
];

// ─── Main export: fetchNearbyCandidates ───────────────────────────────────────

export async function fetchNearbyCandidates(
  lat,
  lng,
  radiusMetres = 5000,
  weather = 'sunny',
) {
  if (lat == null || lng == null) {
    return { candidates: STATIC_FALLBACK_CANDIDATES, fromCache: false, fromFallback: true };
  }

  const cacheKey = buildCacheKey(lat, lng, radiusMetres);
  const cached   = readCache(cacheKey);

  if (cached && !cached.stale) {
    return { candidates: cached.data, fromCache: true, fromFallback: false };
  }

  try {
    const res = await fetch('/.netlify/functions/places', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ lat, lng, radiusMetres, weather }),
    });

    if (!res.ok) throw new Error(`places function returned ${res.status}`);

    const json = await res.json();

    if (!Array.isArray(json.places)) {
      throw new Error('places function returned unexpected shape');
    }

    const candidates = json.places
      .map(raw => enrichPlace(raw))
      .filter(c => c.rating === null || c.rating >= 4.3);

    writeCache(candidates, cacheKey);

    return { candidates, fromCache: false, fromFallback: false };

  } catch {
    if (cached) {
      return { candidates: cached.data, fromCache: true, fromFallback: false };
    }
    return { candidates: STATIC_FALLBACK_CANDIDATES, fromCache: false, fromFallback: true };
  }
}

// ─── Radius helper ────────────────────────────────────────────────────────────

export function radiusToMetres(travelTolerance) {
  switch (travelTolerance) {
    case 'walk':  return 1500;
    case '15min': return 8000;
    case '30min': return 20000;
    default:      return 5000;
  }
}
