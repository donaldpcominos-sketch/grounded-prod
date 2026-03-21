/**
 * services/renderCache.js — Render Cache
 *
 * Phase 4 (CPO): Stores and retrieves the last resolved Today payload
 * so the first render can happen synchronously from cache while the
 * background resolution completes.
 *
 * Storage: sessionStorage (in-memory per tab — no persistence across sessions).
 * Cache is keyed by dateKey so stale payloads from a previous day are
 * automatically ignored.
 *
 * Rules:
 *   - No async I/O
 *   - Never throws (all errors swallowed — non-critical path)
 *   - Payload is a plain JSON-serialisable object
 */

const CACHE_KEY = 'grounded_today_payload';

// ─── Get ──────────────────────────────────────────────────────────────────────

/**
 * Retrieve the cached Today payload.
 * Returns null if nothing is cached or JSON parse fails.
 *
 * @returns {object|null}
 */
export function getCachedTodayPayload() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── Set ──────────────────────────────────────────────────────────────────────

/**
 * Persist a resolved Today payload to the render cache.
 *
 * @param {object} payload
 */
export function setCachedTodayPayload(payload) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // sessionStorage unavailable — ignore
  }
}

// ─── Validity ─────────────────────────────────────────────────────────────────

/**
 * Returns true if the cached payload is usable for the current dateKey.
 *
 * A payload is usable when:
 *   - it exists
 *   - its dateKey matches the provided dateKey
 *   - it contains the minimum required fields
 *
 * @param {object|null} payload
 * @param {string}      dateKey   — today's date key (YYYY-MM-DD)
 * @returns {boolean}
 */
export function isCachedPayloadUsable(payload, dateKey) {
  if (!payload)                         return false;
  if (payload.dateKey !== dateKey)      return false;
  if (!payload.resolvedState)           return false;
  if (!payload.continuityTag)           return false;
  return true;
}

// ─── Patch detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the newly resolved payload differs meaningfully from
 * the currently rendered payload — i.e. a DOM patch is warranted.
 *
 * Only patches when state, continuityTag, tone, or drift variant changed.
 * Ignores metadata fields (dateKey, writtenAt, etc.).
 *
 * @param {object|null} currentPayload   — what was rendered from cache
 * @param {object}      nextPayload      — freshly resolved payload
 * @returns {boolean}
 */
export function shouldPatchRenderedPayload(currentPayload, nextPayload) {
  if (!currentPayload) return true;

  return (
    currentPayload.resolvedState      !== nextPayload.resolvedState      ||
    currentPayload.continuityTag      !== nextPayload.continuityTag      ||
    currentPayload.tone               !== nextPayload.tone               ||
    currentPayload.driftVariantApplied !== nextPayload.driftVariantApplied ||
    currentPayload.flatDayFlag        !== nextPayload.flatDayFlag        ||
    currentPayload.isNight            !== nextPayload.isNight
  );
}
