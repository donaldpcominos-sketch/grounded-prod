/**
 * services/signalWeights.js — Signal Weights
 *
 * Phase 4 (AI/ML): Defines weights used by continuityEngine.js
 * for deriving continuity tags with confidence scoring.
 *
 * Rules:
 *   - Constants only — no logic here
 *   - Higher weight = stronger influence on pattern derivation
 *   - Weights are additive, not multiplicative
 */

/**
 * Per-signal weights for continuity confidence calculation.
 * Keys match fields in the dailyHistory snapshot.
 */
export const SIGNAL_WEIGHTS = Object.freeze({
  // State signals — core inputs
  resolvedState_SURVIVAL:     3,
  resolvedState_LOW_CAPACITY: 1,
  resolvedState_STABLE:       2,

  // Habit completion — supporting signal
  highHabitRatio:             1,   // habitsDoneRatio >= 0.6
  lowHabitRatio:              1,   // habitsDoneRatio <= 0.2

  // Absence signal — surface area for GENTLE tone / drift detection
  longGap:                    2,   // gapHours > 36
  shortGap:                   1,   // gapHours <= 24

  // Night opens — directional signal
  nightOpen:                  1,
});

/**
 * Minimum confidence score to commit to a new continuity tag.
 * Below this threshold, the previous tag is preserved.
 */
export const CONTINUITY_CONFIDENCE_THRESHOLD = 0.55;

/**
 * Minimum history length (days) before any pattern is derived.
 * Below this, NEUTRAL is always returned.
 */
export const MIN_HISTORY_FOR_PATTERN = 3;
