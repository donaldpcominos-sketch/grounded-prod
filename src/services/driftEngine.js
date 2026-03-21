/**
 * services/driftEngine.js — Drift Engine
 *
 * Phase 4 (AI/ML): Detects whether the user is at risk of drifting
 * from the app. This is an internal signal only — never shown to the user.
 *
 * Drift does NOT change resolvedState.
 * Drift only influences tone/copy branch selection.
 * All logic is deterministic. No ML.
 *
 * atRiskOfDrift = true when:
 *   - gapHours > 18 (not opened in 18+ hours)
 *   OR
 *   - openCountDeclining2Days (open count declining over last 2 days)
 *   OR
 *   - noUnpromptedOpenIn48h (no unprompted open in 48 hours)
 */

import { STATES }          from './stateEngine.js';
import { CONTINUITY_TAGS } from './patternEngine.js';
import { TONES }           from './toneEngine.js';

export function deriveAtRiskOfDrift(metrics) {
  const {
    gapHours                = 0,
    openCountDeclining2Days = false,
    noUnpromptedOpenIn48h   = false,
  } = metrics;

  return (
    gapHours > 18            ||
    openCountDeclining2Days  ||
    noUnpromptedOpenIn48h
  );
}

export function getBehaviourTrend(metrics) {
  const { openCounts = [], gapHours = 0 } = metrics;
  if (openCounts.length < 2) return 'UNKNOWN';
  const recent = openCounts.slice(-2);
  const delta  = recent[1] - recent[0];
  if (gapHours > 36 && delta >= 0) return 'RETURNING';
  if (delta < 0)                   return 'DECLINING';
  if (delta >= 0)                  return 'STABLE';
  return 'UNKNOWN';
}

export function deriveTone(context) {
  const { resolvedState, continuityTag, isNight = false, atRiskOfDrift = false } = context;

  if (resolvedState === STATES.SURVIVAL || continuityTag === CONTINUITY_TAGS.SUSTAINED_HARD || isNight) {
    return TONES.GENTLE;
  }
  if (continuityTag === CONTINUITY_TAGS.IMPROVING) return TONES.GROUNDED;
  if (continuityTag === CONTINUITY_TAGS.SUSTAINED_STABLE && resolvedState === STATES.STABLE) return TONES.OPEN;
  if (atRiskOfDrift) return 'DRIFT';
  return TONES.STEADY;
}
