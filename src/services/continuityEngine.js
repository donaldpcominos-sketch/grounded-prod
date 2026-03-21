/**
 * services/continuityEngine.js — Continuity Engine v2
 *
 * Phase 4 (AI/ML): Derives continuityTag with confidence gating.
 * Replaces the raw deriveContinuityTag call in stateEngine.js.
 *
 * Key improvement over patternEngine.js deriveContinuityTag:
 *   - Confidence scored before committing to a new tag
 *   - Previous tag preserved when confidence is below threshold
 *   - Pattern requires confirmation over multiple days (not just ratio)
 *
 * Deterministic. No ML. No randomness.
 * Used by: stateEngine.resolveAndPersistState
 */

import { STATES } from './stateEngine.js';
import { CONTINUITY_TAGS } from './patternEngine.js';
import {
  SIGNAL_WEIGHTS,
  CONTINUITY_CONFIDENCE_THRESHOLD,
  MIN_HISTORY_FOR_PATTERN,
} from './signalWeights.js';

// ─── State numeric weight ─────────────────────────────────────────────────────

const STATE_WEIGHT = {
  'SURVIVAL':     0,
  'LOW_CAPACITY': 1,
  'STABLE':       2,
};

function weightOf(state) {
  return STATE_WEIGHT[state] ?? 1;
}

// ─── Signal scoring ───────────────────────────────────────────────────────────

/**
 * Score a single history entry against the weights map.
 *
 * @param {object} entry — daily history snapshot
 * @returns {object} { survivalScore, stableScore, absenceScore }
 */
function scoreEntry(entry) {
  let survivalScore = 0;
  let stableScore   = 0;
  let absenceScore  = 0;

  if (entry.resolvedState === STATES.SURVIVAL)     survivalScore += SIGNAL_WEIGHTS.resolvedState_SURVIVAL;
  if (entry.resolvedState === STATES.STABLE)       stableScore   += SIGNAL_WEIGHTS.resolvedState_STABLE;

  const ratio    = entry.habitsDoneRatio ?? 0;
  const gapHours = entry.gapHours        ?? 0;

  if (ratio >= 0.6)    stableScore   += SIGNAL_WEIGHTS.highHabitRatio;
  if (ratio <= 0.2)    survivalScore += SIGNAL_WEIGHTS.lowHabitRatio;
  if (gapHours > 36)   absenceScore  += SIGNAL_WEIGHTS.longGap;
  if (entry.nightOpen) survivalScore += SIGNAL_WEIGHTS.nightOpen;

  return { survivalScore, stableScore, absenceScore };
}

// ─── Confidence calculation ───────────────────────────────────────────────────

/**
 * Derive confidence (0–1) that the candidate tag is correct.
 * Based on signal totals across the history window.
 *
 * @param {Array<object>} history      — oldest-first
 * @param {string}        candidateTag — proposed CONTINUITY_TAGS value
 * @returns {number} 0–1
 */
export function getContinuityConfidence(history, candidateTag) {
  if (!history || history.length < MIN_HISTORY_FOR_PATTERN) return 0;

  let supportWeight = 0;
  let totalWeight   = 0;

  for (const entry of history) {
    const { survivalScore, stableScore, absenceScore } = scoreEntry(entry);
    const entryTotal = survivalScore + stableScore + absenceScore + 1; // +1 floor

    let support = 0;
    switch (candidateTag) {
      case CONTINUITY_TAGS.SUSTAINED_HARD:
        support = survivalScore + absenceScore;
        break;
      case CONTINUITY_TAGS.SUSTAINED_STABLE:
        support = stableScore;
        break;
      case CONTINUITY_TAGS.IMPROVING:
      case CONTINUITY_TAGS.DECLINING:
        // Trend-based — confidence derived from delta magnitude (handled below)
        support = 1;
        break;
      default:
        support = 0;
    }

    supportWeight += support;
    totalWeight   += entryTotal;
  }

  if (totalWeight === 0) return 0;
  return Math.min(1, supportWeight / totalWeight);
}

// ─── Pattern confirmation ─────────────────────────────────────────────────────

/**
 * Returns true if the candidate tag is confirmed by at least N consecutive
 * matching entries at the end of the history window.
 *
 * @param {Array<object>} history
 * @param {string}        candidateTag
 * @param {{ minStreak?: number }} [options]
 * @returns {boolean}
 */
export function hasConfirmedPattern(history, candidateTag, options = {}) {
  const minStreak = options.minStreak ?? 2;
  if (!history || history.length < minStreak) return false;

  // Check the most recent N entries (end of array = most recent)
  const recent = history.slice(-minStreak);

  return recent.every(entry => {
    switch (candidateTag) {
      case CONTINUITY_TAGS.SUSTAINED_HARD:
        return entry.resolvedState === STATES.SURVIVAL ||
               (entry.gapHours ?? 0) > 36;
      case CONTINUITY_TAGS.SUSTAINED_STABLE:
        return entry.resolvedState === STATES.STABLE;
      default:
        return true; // Trend tags don't require streak confirmation
    }
  });
}

// ─── Core derivation v2 ───────────────────────────────────────────────────────

/**
 * Derive a continuity tag from history + signals.
 * Preserves previousTag when confidence is below threshold.
 *
 * @param {Array<object>} history       — oldest-first daily history snapshots
 * @param {object}        [signals]     — today's raw signals (optional enrichment)
 * @param {string}        [previousTag] — currently committed tag (defaults to NEUTRAL)
 * @returns {string} CONTINUITY_TAGS value
 */
export function deriveContinuityTagV2(history, signals = {}, previousTag = CONTINUITY_TAGS.NEUTRAL) {
  const states = history.map(h => h.resolvedState).filter(Boolean);

  if (states.length < MIN_HISTORY_FOR_PATTERN) return previousTag;

  const total         = states.length;
  const survivalCount = states.filter(s => s === STATES.SURVIVAL).length;
  const stableCount   = states.filter(s => s === STATES.STABLE).length;

  // ── Candidate resolution ────────────────────────────────────────────────────

  let candidateTag = CONTINUITY_TAGS.NEUTRAL;

  if (survivalCount / total >= 0.5) {
    candidateTag = CONTINUITY_TAGS.SUSTAINED_HARD;
  } else if (stableCount / total >= 0.6) {
    candidateTag = CONTINUITY_TAGS.SUSTAINED_STABLE;
  } else {
    // Trend: compare first-half vs second-half
    const mid      = Math.floor(states.length / 2);
    const early    = states.slice(0, mid);
    const late     = states.slice(mid);
    const avgEarly = early.reduce((acc, s) => acc + weightOf(s), 0) / (early.length || 1);
    const avgLate  = late.reduce((acc, s)  => acc + weightOf(s), 0) / (late.length  || 1);
    const delta    = avgLate - avgEarly;

    if (delta >= 0.5)      candidateTag = CONTINUITY_TAGS.IMPROVING;
    else if (delta <= -0.5) candidateTag = CONTINUITY_TAGS.DECLINING;
  }

  // ── Confidence gate ─────────────────────────────────────────────────────────

  // For streak-based tags, require confirmed pattern
  if (
    candidateTag === CONTINUITY_TAGS.SUSTAINED_HARD ||
    candidateTag === CONTINUITY_TAGS.SUSTAINED_STABLE
  ) {
    if (!hasConfirmedPattern(history, candidateTag, { minStreak: 2 })) {
      return previousTag;
    }
  }

  const confidence = getContinuityConfidence(history, candidateTag);

  if (confidence < CONTINUITY_CONFIDENCE_THRESHOLD) {
    // Not confident enough — preserve previous tag to avoid churn
    return previousTag;
  }

  return candidateTag;
}
