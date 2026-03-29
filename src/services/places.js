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

// Google Places types → our subtype.
//
// Omissions are intentional:
//   store, supermarket  — errands, not outings
//   beauty_salon        — too narrow; handled below via name-pattern check
//   stadium             — not a parent-with-baby destination
//   food                — Google's 'food' type is too broad (covers food trucks,
//                         takeaway windows, fast food); only mapped when a more
//                         specific food type is also present (see inferSubtype)
//   establishment       — catch-all; only used as last-resort fallback
//   point_of_interest   — catch-all; no longer used as fallback
const TYPE_MAP = {
  park:                'park',
  natural_feature:     'park',
  campground:          'park',
  cafe:                'cafe',
  coffee:              'cafe',           // not a Google type but kept for safety
  restaurant:          'cafe',
  bakery:              'cafe',           // bakeries are café-equivalent outing stops
  library:             'library',
  aquarium:            'aquarium',
  zoo:                 'zoo',
  museum:              'museum',
  art_gallery:         'museum',
  shopping_mall:       'shopping',       // malls only — not generic stores
  amusement_park:      'play-centre',
  bowling_alley:       'play-centre',
  gym:                 'gym',
  swimming_pool:       'pool',
  spa:                 'spa',
  movie_theater:       'indoor-entertainment',
  tourist_attraction:  'attraction',
  book_store:          'library',
  night_club:          null,             // explicitly excluded — not an outing
  bar:                 null,             // explicitly excluded
  liquor_store:        null,             // explicitly excluded
};

// Types that are reliable enough to map but should only be used as a fallback
// when no other TYPE_MAP entry matched. These are Google's broad catch-alls.
const WEAK_TYPES = new Set(['establishment', 'food', 'store']);

// Types that should disqualify a place entirely, regardless of other signals.
// These are subtypes that appear alongside real place types in the Google
// response and would otherwise pollute the candidate pool.
const EXCLUDED_TYPES = new Set([
  'atm',
  'bank',
  'car_wash',
  'car_repair',
  'car_dealer',
  'car_rental',
  'gas_station',
  'parking',
  'police',
  'post_office',
  'real_estate_agency',
  'storage',
  'locksmith',
  'moving_company',
  'electrician',
  'plumber',
  'painter',
  'roofing_contractor',
  'insurance_agency',
  'travel_agency',
  'cemetery',
  'funeral_home',
  'doctor',
  'dentist',
  'hospital',
  'physiotherapist',
  'veterinary_care',
  'pharmacy',
  'drugstore',
  'lawyer',
  'accounting',
  'finance',
  'general_contractor',
]);

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

// Returns null if the place should be excluded entirely (contains a hard-excluded type).
// Returns a subtype string otherwise.
// Weak types (establishment, food, store) are only used when no stronger type
// matched — they're Google's catch-alls and are far too broad to trust as a
// primary signal.
function inferSubtype(types = []) {
  // Hard exclusion: if any type is in EXCLUDED_TYPES, drop the place entirely
  if (types.some(t => EXCLUDED_TYPES.has(t))) return null;

  // Beauty salons: only accept if it's the sole meaningful type (i.e., no other
  // TYPE_MAP entry matched). A real spa will usually have 'spa' in its types too.
  // A beauty salon without a spa type is a nail bar, not an outing.
  const hasSpaType = types.includes('spa');
  if (types.includes('beauty_salon') && !hasSpaType) return null;

  // Prefer strong types first (anything in TYPE_MAP that isn't a weak type)
  for (const t of types) {
    const mapped = TYPE_MAP[t];
    if (mapped && !WEAK_TYPES.has(t)) return mapped;
  }

  // Fall back to weak types only if nothing stronger matched.
  // 'food' alone → treat as 'cafe' only if 'restaurant' or 'cafe' is also present;
  // otherwise it could be a food truck or takeaway window — skip it.
  if (types.includes('food')) {
    if (types.includes('restaurant') || types.includes('cafe')) return 'cafe';
    return null;
  }

  // Only use actual tourist_attraction as attraction fallback.
  // point_of_interest is too broad and creates junk candidates.
  if (types.includes('tourist_attraction')) {
    return 'attraction';
  }

  if (types.includes('establishment')) {
    return 'attraction'; // last resort — will face the strictest quality filter
  }

  return null; // unrecognised type combination — exclude
}

// ─── Contextual tag inference ─────────────────────────────────────────────────

function buildInferredTags(raw, subtype, baseTags) {
  const tags = [...baseTags];
  const name  = (raw.name || '').toLowerCase();
  const types = raw.types  || [];

  function add(tag) {
    if (!tags.includes(tag)) tags.push(tag);
  }

  // food: any place where eating is the primary purpose
  if (['cafe', 'restaurant', 'food', 'meal_delivery', 'meal_takeaway', 'bakery'].some(t => types.includes(t))) {
    add('food');
  }

  // calm: only subtypes where a calm environment is near-universal
  if (['spa', 'library'].includes(subtype)) add('calm');

  if (INDOOR_OUTDOOR_BY_SUBTYPE[subtype] === 'indoor')  add('indoor');
  if (INDOOR_OUTDOOR_BY_SUBTYPE[subtype] === 'outdoor') add('outdoor');

  if (INDOOR_OUTDOOR_BY_SUBTYPE[subtype] === 'indoor') add('cool');

  if (ENERGY_BY_SUBTYPE[subtype] === 'low' && subtype !== 'shopping') add('easy');

  if (ENERGY_BY_SUBTYPE[subtype] === 'high') add('active');

  if (/\b(beach|lagoon|waterfall|lake|river|ocean|sea)\b/.test(name)) {
    add('water');
    add('scenic');
    add('outdoor');
  }

  if (/\b(garden|botanical)\b/.test(name)) {
    add('scenic');
    add('outdoor');
    add('fresh-air');
  }

  if (/\b(temple|pura|rice terrace|rice field|paddy|sawah)\b/.test(name)) {
    add('scenic');
    add('cultural');
    add('outdoor');
  }

  if (/\bmarket\b/.test(name)) {
    add('food');
    add('active');
  }

  if (/\b(cafe|coffee|warung|bistro)\b/.test(name)) {
    add('food');
    add('indoor');
    add('easy');
  }

  if (/\b(spa|wellness|retreat)\b/.test(name)) {
    add('calm');
    add('indoor');
    add('easy');
  }

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

// ─── Candidate quality gates ──────────────────────────────────────────────────
// These run after enrichment to remove places that passed type-level checks
// but are still not useful outing options.

const JUNK_NAME_PATTERNS = [
  /\bmobile\b/i,
  /\bfood truck\b/i,
  /\bfood cart\b/i,
  /\btruck\b/i,
  /\bstreet (food|library|stall)\b/i,
  /\blittle free library\b/i,
  /\bfree library\b/i,
  /\btake.?away\b/i,
  /\bkiosk\b/i,
  /\bvending\b/i,
  /\blaundromat\b/i,
  /\blaundry\b/i,
  /\bcar wash\b/i,
  /\bpetrol\b/i,
  /\bservice station\b/i,
  /\bfuel station\b/i,
  /\batm\b/i,
  /\bbus stop\b/i,
  /\btrain station\b/i,
  /\bcoworking\b/i,
  /\boffice\b/i,
  /\bheadquarters\b/i,
  /\bhq\b/i,
  /\bstall\b/i,
  /\bstand\b/i,
  /\bcart\b/i,
  /\bbooth\b/i,
  /\bvendor\b/i,
];

function isJunkByName(name) {
  if (!name) return true;
  return JUNK_NAME_PATTERNS.some(pattern => pattern.test(name));
}

const CORE_SUBTYPES = new Set([
  'cafe',
  'park',
  'library',
  'museum',
  'aquarium',
  'zoo',
  'play-centre',
  'shopping',
  'pool',
  'spa',
  'indoor-entertainment'
]);

function isAcceptableCandidate(candidate) {
  const { subtype, rating, userRatingsTotal, name, tags = [] } = candidate;

  if (isJunkByName(name)) return false;

  // Attraction is the weakest / noisiest subtype — keep only strong ones.
  if (subtype === 'attraction') {
    if (rating === null) return false;
    if (rating < 4.5) return false;
    if (userRatingsTotal < 50) return false;
    if (!tags.includes('scenic') && !tags.includes('cultural')) return false;
    return true;
  }

  if (rating === null) {
    return CORE_SUBTYPES.has(subtype);
  }

  // Food places need a bit more trust than generic venues.
  if (subtype === 'cafe' && userRatingsTotal < 20) return false;

  if (userRatingsTotal < 10 && rating < 4.5) return false;

  if (rating < 4.0) return false;

  return true;
}

// ─── Main enrichment function ─────────────────────────────────────────────────
// Returns null if the place should be excluded (bad type or unrecognised combination).
// Callers must filter out nulls before using the result.

function enrichPlace(raw) {
  const subtype = inferSubtype(raw.types || []);

  if (subtype === null) return null;

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
    distanceMetres: raw._distanceMetres ?? null,
    driveMinutes:   metresToDriveMinutes(raw._distanceMetres),
    walkable:       isWalkable(raw._distanceMetres),

    rating:           raw.rating ?? null,
    userRatingsTotal: raw.user_ratings_total ?? 0,
    openNow:          raw.opening_hours?.open_now ?? true,

    energyRequired:  ENERGY_BY_SUBTYPE[subtype]         ?? 'medium',
    indoorOutdoor:   INDOOR_OUTDOOR_BY_SUBTYPE[subtype] ?? 'both',
    weatherSuitable: WEATHER_BY_SUBTYPE[subtype]        ?? ['sunny', 'cloudy'],
    vibes:           VIBES_BY_SUBTYPE[subtype]          ?? ['out'],
    tags,
    durationMin:     DURATION_MIN_BY_SUBTYPE[subtype]   ?? 30,
    nicoMinAge:      0,

    description:   buildStaticDescription(raw, subtype),
    googleMapsUrl: raw.place_id
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(raw.name || 'Place')}&query_place_id=${raw.place_id}`
      : null,
  };
}

function extractSuburb(vicinity) {
  if (!vicinity) return null;
  return vicinity.split(',')[0].trim() || null;
}

// ─── Static fallback dataset ──────────────────────────────────────────────────

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
    distanceMetres:  null,
    driveMinutes:    null,
    walkable:        true,
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
    distanceMetres:  null,
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
    tags:            ['food', 'active'],
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
      .filter(c => c !== null)
      .filter(c => isAcceptableCandidate(c));

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