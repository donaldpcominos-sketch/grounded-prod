// src/services/weather.js
// Fetches current weather + 4-day forecast from Open-Meteo (no API key needed).
// Caches to localStorage so it works offline.
// UV walk window: finds morning and afternoon slots where UV index <= 3.
//
// Yesterday snapshot:
// On every successful live fetch, a minimal snapshot of today's conditions
// { temp, high, low, rainExpected } is written to localStorage keyed by date.
// On the next calendar day, callers can read it via getYesterdaySnapshot().
// No extra network call is made — the snapshot is a by-product of the fetch.
//
// rainExpected is a boolean derived from the daily weather code
// (codes 51–99 cover all precipitation). Computed here so the domain layer
// receives a stable boolean rather than a raw code it has to re-interpret.

const CACHE_KEY           = 'grounded_weather_cache';
const SNAPSHOT_KEY_PREFIX = 'grounded_weather_day_'; // + YYYY-MM-DD
const CACHE_TTL_MS        = 60 * 60 * 1000;          // 1 hour

// Default location: Greystanes, Sydney
const DEFAULT_LAT = -33.8354;
const DEFAULT_LNG = 150.9836;

// ─── Date helpers ─────────────────────────────────────────────────────────────

function dateKey(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // storage full or unavailable — silently skip
  }
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    return { data, ageMs: Date.now() - ts, stale: Date.now() - ts > CACHE_TTL_MS };
  } catch {
    return null;
  }
}

// ─── Yesterday snapshot helpers ───────────────────────────────────────────────
// Snapshot shape: { temp, high, low, rainExpected }

function writeDaySnapshot(key, snapshot) {
  try {
    localStorage.setItem(SNAPSHOT_KEY_PREFIX + key, JSON.stringify(snapshot));
  } catch {
    // storage full or unavailable — silently skip
  }
}

// Returns the snapshot written on the previous calendar day, or null if absent.
// null on first-ever use is expected — the briefing degrades gracefully.
export function getYesterdaySnapshot() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY_PREFIX + dateKey(-1));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── Rain detection ───────────────────────────────────────────────────────────
// Open-Meteo WMO weather code ranges that indicate precipitation.
// Ranges: drizzle 51–57, rain 61–67, snow 71–77, showers 80–86,
//         thunderstorm 95–99.
// Reference: https://open-meteo.com/en/docs#weathervariables

function isRainCode(code) {
  if (typeof code !== 'number') return false;
  return (code >= 51 && code <= 57)
      || (code >= 61 && code <= 67)
      || (code >= 71 && code <= 77)
      || (code >= 80 && code <= 86)
      || (code >= 95 && code <= 99);
}

// ─── UV walk window ───────────────────────────────────────────────────────────

function getUvWalkWindow(hourlyTimes, hourlyUv) {
  if (!hourlyTimes || !hourlyUv) return null;

  const today = new Date().toISOString().slice(0, 10);
  const todaySlots = hourlyTimes
    .map((t, i) => ({ hour: new Date(t).getHours(), uv: hourlyUv[i], dateStr: t.slice(0, 10) }))
    .filter(s => s.dateStr === today);

  if (!todaySlots.length) return null;

  const morningSlots   = todaySlots.filter(s => s.hour >= 5  && s.hour <= 10 && s.uv <= 3);
  const afternoonSlots = todaySlots.filter(s => s.hour >= 15 && s.hour <= 19 && s.uv <= 3);

  function fmtHour(h) {
    if (h === 0)  return '12am';
    if (h < 12)  return `${h}am`;
    if (h === 12) return '12pm';
    return `${h - 12}pm`;
  }

  function slotRange(slots) {
    if (!slots.length) return null;
    const start = slots[0].hour;
    const end   = slots[slots.length - 1].hour + 1;
    return `${fmtHour(start)}–${fmtHour(end)}`;
  }

  const morn = slotRange(morningSlots);
  const arvo = slotRange(afternoonSlots);

  if (morn && arvo) return `🐾 Good walk windows: ${morn} and ${arvo}`;
  if (morn)         return `🐾 Good morning walk window: ${morn}`;
  if (arvo)         return `🐾 Good afternoon walk window: ${arvo}`;
  return '🐾 UV is high most of today — keep walks short or shaded';
}

// ─── Condition label + emoji ──────────────────────────────────────────────────

function describeWeatherCode(code) {
  if (code === 0)  return { label: 'Clear sky',     emoji: '☀️' };
  if (code <= 2)   return { label: 'Partly cloudy', emoji: '⛅' };
  if (code === 3)  return { label: 'Overcast',       emoji: '☁️' };
  if (code <= 49)  return { label: 'Foggy',          emoji: '🌫️' };
  if (code <= 57)  return { label: 'Drizzle',        emoji: '🌦️' };
  if (code <= 67)  return { label: 'Rain',           emoji: '🌧️' };
  if (code <= 77)  return { label: 'Snow',           emoji: '❄️' };
  if (code <= 82)  return { label: 'Rain showers',   emoji: '🌦️' };
  if (code <= 86)  return { label: 'Snow showers',   emoji: '🌨️' };
  if (code >= 95)  return { label: 'Thunderstorm',   emoji: '⛈️' };
  return { label: 'Variable', emoji: '🌤️' };
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

export async function fetchWeather(lat = DEFAULT_LAT, lng = DEFAULT_LNG) {
  // Try cache first if still fresh
  const cached = readCache();
  if (cached && !cached.stale) {
    return { ...cached.data, fromCache: false };
  }

  const url = [
    'https://api.open-meteo.com/v1/forecast',
    `?latitude=${lat}&longitude=${lng}`,
    '&current=temperature_2m,weather_code,uv_index',
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max',
    '&hourly=uv_index',
    '&timezone=auto',
    '&forecast_days=4'
  ].join('');

  try {
    const res  = await fetch(url);
    if (!res.ok) throw new Error('Weather fetch failed');
    const json = await res.json();

    const current = json.current;
    const daily   = json.daily;
    const hourly  = json.hourly;

    const currentCondition = describeWeatherCode(current.weather_code);

    // rainExpected: derived from today's daily weather code (index 0).
    // The daily code covers the full calendar day, so this correctly flags
    // afternoon rain that hasn't started yet at time of briefing.
    const rainExpected = isRainCode(daily.weather_code[0]);

    // Build 4-day forecast (today + 3 days)
    const forecast = daily.time.slice(0, 4).map((dateStr, i) => {
      const cond = describeWeatherCode(daily.weather_code[i]);
      const d    = new Date(dateStr + 'T12:00:00');
      const label = i === 0 ? 'Today'
                  : i === 1 ? 'Tomorrow'
                  : d.toLocaleDateString('en-AU', { weekday: 'short' });
      return {
        label,
        emoji:  cond.emoji,
        desc:   cond.label,
        high:   Math.round(daily.temperature_2m_max[i]),
        low:    Math.round(daily.temperature_2m_min[i]),
        uvMax:  Math.round(daily.uv_index_max[i])
      };
    });

    const walkWindow = getUvWalkWindow(hourly.time, hourly.uv_index);

    const data = {
      currentTemp:  Math.round(current.temperature_2m),
      currentEmoji: currentCondition.emoji,
      currentDesc:  currentCondition.label,
      currentUv:    Math.round(current.uv_index),
      rainExpected,
      forecast,
      walkWindow,
      fetchedAt:    new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
    };

    writeCache(data);

    // Write today's snapshot so tomorrow's briefing can compare.
    writeDaySnapshot(dateKey(0), {
      temp:        data.currentTemp,
      high:        forecast[0]?.high ?? data.currentTemp,
      low:         forecast[0]?.low  ?? data.currentTemp,
      rainExpected: data.rainExpected,
    });

    return { ...data, fromCache: false };

  } catch {
    // Network failed — return stale cache if available, otherwise null
    if (cached) {
      return { ...cached.data, fromCache: true, cacheAgeMs: cached.ageMs };
    }
    return null;
  }
}
