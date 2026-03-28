// netlify/functions/places.js
//
// Serverless function: proxies Google Places Nearby Search to the frontend.
// The Google Places API key never leaves the server.
//
// POST body:
//   { lat, lng, radiusMetres, weather }
//
// Response:
//   { places: RawGooglePlace[] }
//     where each place has _distanceMetres injected
//
// Filtering applied server-side (before returning to client):
//   - rating >= 4.3
//   - open now (when Places API has that data)
//   - within radiusMetres
//   - types not in EXCLUDED_TYPES
//   - max 25 results
//
// The client (src/services/places.js) does further enrichment after receiving
// this raw-ish data. We do minimal processing here — keep the function simple.

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// ─── Types we never want to surface ──────────────────────────────────────────

const EXCLUDED_TYPES = new Set([
  'funeral_home',
  'cemetery',
  'hospital',
  'doctor',
  'dentist',
  'pharmacy',
  'bank',
  'atm',
  'gas_station',
  'car_repair',
  'car_wash',
  'locksmith',
  'lawyer',
  'accounting',
  'real_estate_agency',
  'insurance_agency',
  'night_club',
  'bar',
  'liquor_store',
  'casino',
]);

// Types we actively want — searched in order of priority.
// We make multiple calls and merge results to stay within the 20-result cap
// of a single Nearby Search response.
//
// Each group maps to one Nearby Search call (Places API only accepts one type
// per call unless using the newer Text Search).
const TYPE_GROUPS = {
  // Always fetch — these are universally useful for parent + baby
  core:    ['park', 'cafe', 'library'],
  // Weather-dependent additions
  indoor:  ['shopping_mall', 'aquarium', 'museum', 'bowling_alley'],
  outdoor: ['zoo', 'amusement_park'],
};

// ─── Haversine distance ───────────────────────────────────────────────────────

function haversineMetres(lat1, lng1, lat2, lng2) {
  const R  = 6371000; // earth radius in metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Single Places Nearby Search call ────────────────────────────────────────

async function fetchPlacesByType(lat, lng, radiusMetres, type) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
  url.searchParams.set('location',  `${lat},${lng}`);
  url.searchParams.set('radius',    String(radiusMetres));
  url.searchParams.set('type',      type);
  url.searchParams.set('opennow',   'true');
  url.searchParams.set('key',       GOOGLE_PLACES_API_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) return [];

  const json = await res.json();
  return json.results || [];
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Key must be present
  if (!GOOGLE_PLACES_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured' }),
    };
  }

  // Parse body
  let lat, lng, radiusMetres, weather;
  try {
    const body = JSON.parse(event.body || '{}');
    lat          = Number(body.lat)          || -33.8354;
    lng          = Number(body.lng)          || 150.9836;
    radiusMetres = Number(body.radiusMetres) || 5000;
    weather      = String(body.weather      || 'sunny');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  // Cap radius at 30 km to keep results relevant and cost down
  radiusMetres = Math.min(radiusMetres, 30000);

  // Decide which type groups to fetch based on weather
  // On rainy / hot days, prioritise indoor types
  const preferIndoor = weather === 'rainy' || weather === 'hot';
  const typeList = [
    ...TYPE_GROUPS.core,
    ...(preferIndoor ? TYPE_GROUPS.indoor : TYPE_GROUPS.outdoor),
    ...(preferIndoor ? [] : TYPE_GROUPS.indoor),  // still include indoor, just deprioritised
  ];

  // Deduplicate type list
  const uniqueTypes = [...new Set(typeList)];

  // Fetch all type groups in parallel (respect Places API rate limits in prod
  // by batching if needed — for typical usage parallel is fine)
  let allRaw = [];
  try {
    const results = await Promise.all(
      uniqueTypes.map(type => fetchPlacesByType(lat, lng, radiusMetres, type))
    );
    allRaw = results.flat();
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Google Places API request failed', detail: err.message }),
    };
  }

  // Deduplicate by place_id (a place can appear in multiple type searches)
  const seen = new Set();
  const deduped = allRaw.filter(place => {
    if (seen.has(place.place_id)) return false;
    seen.add(place.place_id);
    return true;
  });

  // Filter and enrich
  const filtered = deduped
    // Exclude unwanted types
    .filter(place => !(place.types || []).some(t => EXCLUDED_TYPES.has(t)))
    // Rating gate
    .filter(place => !place.rating || place.rating >= 4.3)
    // Must have a name
    .filter(place => Boolean(place.name))
    // Inject distance for the client (so enrichment works without a second API call)
    .map(place => {
      const placeLat = place.geometry?.location?.lat ?? lat;
      const placeLng = place.geometry?.location?.lng ?? lng;
      return {
        ...place,
        _distanceMetres: Math.round(haversineMetres(lat, lng, placeLat, placeLng)),
      };
    })
    // Sort by distance ascending so nearest come first in the response
    .sort((a, b) => (a._distanceMetres || 0) - (b._distanceMetres || 0))
    // Cap at 25 candidates — enough for the domain to have good choices
    .slice(0, 25);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ places: filtered }),
  };
};
