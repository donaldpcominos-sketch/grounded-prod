/**
 * services/flatDayEngine.js — Flat Day Engine
 *
 * Phase 4 (CPO): Detects when today is likely a "flat" day — not hard,
 * not particularly good, just unremarkable. Used to subtly adjust copy
 * phrasing without changing state or UI.
 *
 * Detection is purely deterministic from passive signals.
 * No randomness. No ML. Never shown to the user as a label.
 *
 * A flat day is:
 *   - State is LOW_CAPACITY (not SURVIVAL, not STABLE)
 *   - No habit completion signal (habitsDoneRatio === 0 or undefined)
 *   - Gap hours is low (< 30h — user has been present recently)
 *   - No night open
 *   - No declining or sustained-hard continuity
 *
 * Flat day affects the variantBranch selection in copyResolver.
 * It does NOT change resolvedState.
 *
 * Adjustment keys map to copy variant branches in todayCopyMap.
 */

import { STATES } from './stateEngine.js';
import { CONTINUITY_TAGS } from './patternEngine.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const FLAT_GAP_CEILING  = 30;   // hours — must have been present recently
const FLAT_HABIT_CEILING = 0.1; // ratio — close to nothing done

// ─── Core detection ───────────────────────────────────────────────────────────

/**
 * Detect whether today is a flat day.
 *
 * @param {{
 *   resolvedState:  string,
 *   continuityTag:  string,
 *   habitsDoneRatio: number,
 *   gapHours:       number,
 *   isNight:        boolean,
 * }} context
 * @returns {boolean}
 */
export function detectFlatDay(context) {
  const {
    resolvedState,
    continuityTag,
    habitsDoneRatio = 0,
    gapHours        = 0,
    isNight         = false,
  } = context;

  // Only applies to LOW_CAPACITY days
  if (resolvedState !== STATES.LOW_CAPACITY)       return false;

  // Night opens are not flat days — they carry their own tone
  if (isNight)                                     return false;

  // Sustained hard or declining continuity is not flat
  if (
    continuityTag === CONTINUITY_TAGS.SUSTAINED_HARD ||
    continuityTag === CONTINUITY_TAGS.DECLINING
  )                                                return false;

  // User must have been present recently (not a long-absence return)
  if (gapHours > FLAT_GAP_CEILING)                return false;

  // Habits effectively untouched
  if (habitsDoneRatio > FLAT_HABIT_CEILING)        return false;

  return true;
}

/**
 * Return the flat day adjustment key for copy resolution.
 * Returns 'flatDay' when detected, 'base' otherwise.
 *
 * @param {object} context — same shape as detectFlatDay
 * @returns {'flatDay'|'base'}
 */
export function getFlatDayAdjustmentKey(context) {
  return detectFlatDay(context) ? 'flatDay' : 'base';
}
