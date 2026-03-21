/**
 * services/patternEngine.js — Pattern Engine
 *
 * Phase 3: Derives a single continuity tag from the last 3–7 days of history.
 * Deterministic rules only. No ML. No randomness.
 *
 * Continuity tags (internal, never shown to user):
 *   SUSTAINED_HARD    — majority SURVIVAL in the window
 *   IMPROVING         — state trending upward (recent days better than earlier)
 *   DECLINING         — state trending downward (recent days worse than earlier)
 *   SUSTAINED_STABLE  — majority STABLE in the window
 *   NEUTRAL           — no clear pattern (default)
 *
 * Tags influence tone and notification copy selection — not UI rendering.
 */

import { STATES } from './stateEngine.js';

// ─── Tag constants ────────────────────────────────────────────────────────────

export const CONTINUITY_TAGS = Object.freeze({
  SUSTAINED_HARD:   'SUSTAINED_HARD',
  IMPROVING:        'IMPROVING',
  DECLINING:        'DECLINING',
  SUSTAINED_STABLE: 'SUSTAINED_STABLE',
  NEUTRAL:          'NEUTRAL',
});

// ─── State weight for trend calculation ───────────────────────────────────────
// Higher = better capacity

const STATE_WEIGHT = {
  'SURVIVAL':     0,
  'LOW_CAPACITY': 1,
  'STABLE':       2,
};

function weightOf(state) {
  return STATE_WEIGHT[state] ?? 1;
}

// ─── Core derivation ──────────────────────────────────────────────────────────

/**
 * Derive a continuity tag from a history array.
 * History items must have a `resolvedState` field.
 * Array should be ordered oldest-first.
 *
 * Requires at least 3 data points to derive a meaningful tag.
 * Returns NEUTRAL for sparse data.
 *
 * @param {Array<{ resolvedState: string }>} history  — oldest-first
 * @returns {string} CONTINUITY_TAGS value
 */
export function deriveContinuityTag(history) {
  const states = history
    .map(h => h.resolvedState)
    .filter(Boolean);

  if (states.length < 3) return CONTINUITY_TAGS.NEUTRAL;

  const total         = states.length;
  const survivalCount = states.filter(s => s === STATES.SURVIVAL).length;
  const stableCount   = states.filter(s => s === STATES.STABLE).length;

  // SUSTAINED_HARD — majority SURVIVAL
  if (survivalCount / total >= 0.5) return CONTINUITY_TAGS.SUSTAINED_HARD;

  // SUSTAINED_STABLE — majority STABLE
  if (stableCount / total >= 0.6) return CONTINUITY_TAGS.SUSTAINED_STABLE;

  // Trend: compare first half vs second half of the window
  const mid   = Math.floor(states.length / 2);
  const early = states.slice(0, mid);
  const late  = states.slice(mid);

  const avgEarly = early.reduce((acc, s) => acc + weightOf(s), 0) / (early.length || 1);
  const avgLate  = late.reduce((acc, s)  => acc + weightOf(s), 0) / (late.length  || 1);

  const delta = avgLate - avgEarly;

  if (delta >= 0.5)  return CONTINUITY_TAGS.IMPROVING;
  if (delta <= -0.5) return CONTINUITY_TAGS.DECLINING;

  return CONTINUITY_TAGS.NEUTRAL;
}
