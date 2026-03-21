/**
 * services/toneEngine.js — Tone Engine
 *
 * Phase 3: Resolves a tone modifier from current state and continuity tag.
 * Deterministic rules only. No ML. No randomness.
 *
 * Tone modifiers (internal, never shown to user as labels):
 *   GENTLE    — sustained difficulty, or night open
 *   GROUNDED  — improving trend, or recovery day
 *   OPEN      — sustained stability
 *   STEADY    — default; no meaningful continuity signal
 *
 * Inputs: state, continuityTag, nightOpen
 * Removed: appOpenCount — engagement frequency is not a reliable capacity signal
 *
 * Consumed by:
 *   - notificationService (absence notification copy)
 *   - reflectionEngine    (weekly reflection copy)
 *
 * Tone does NOT directly affect Today copy — that is resolved by
 * state × continuityTag in today.js. Tone is the abstraction for
 * downstream services that don't have the full state × tag matrix.
 */

import { STATES } from './stateEngine.js';
import { CONTINUITY_TAGS } from './patternEngine.js';

// ─── Tone constants ───────────────────────────────────────────────────────────

export const TONES = Object.freeze({
  GENTLE:   'GENTLE',
  GROUNDED: 'GROUNDED',
  OPEN:     'OPEN',
  STEADY:   'STEADY',
});

// ─── Core resolution ──────────────────────────────────────────────────────────

/**
 * Resolve a tone from state + continuityTag + nightOpen.
 *
 * Priority order (first match wins):
 *   1. GENTLE  — SURVIVAL state, SUSTAINED_HARD history, or night open
 *   2. GROUNDED — IMPROVING trend (regardless of today's state)
 *   3. OPEN    — SUSTAINED_STABLE with current STABLE state
 *   4. STEADY  — default
 *
 * @param {{
 *   state:         string,
 *   continuityTag: string,
 *   nightOpen:     boolean,
 * }} context
 * @returns {string} TONES value
 */
export function resolveTone({ state, continuityTag, nightOpen = false }) {
  const s  = state         ?? STATES.LOW_CAPACITY;
  const ct = continuityTag ?? CONTINUITY_TAGS.NEUTRAL;

  // GENTLE — anything signalling sustained or immediate difficulty
  if (
    s  === STATES.SURVIVAL             ||
    ct === CONTINUITY_TAGS.SUSTAINED_HARD ||
    nightOpen === true
  ) {
    return TONES.GENTLE;
  }

  // GROUNDED — trend is improving; recent days are better than earlier ones
  if (ct === CONTINUITY_TAGS.IMPROVING) {
    return TONES.GROUNDED;
  }

  // OPEN — extended run of stability, currently stable
  if (ct === CONTINUITY_TAGS.SUSTAINED_STABLE && s === STATES.STABLE) {
    return TONES.OPEN;
  }

  // STEADY — default: NEUTRAL, DECLINING, or any unmatched combination
  return TONES.STEADY;
}
