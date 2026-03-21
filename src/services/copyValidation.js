/**
 * services/copyValidation.js — Copy Validation
 *
 * Phase 4 (Copy): Validates copy strings and the full copy map.
 * Used at build time or during dev — not in the render hot path.
 *
 * Rules enforced:
 *   - No advice language ("try", "start", "improve", "better", "good job")
 *   - No directional language ("next", "moving forward", "progress")
 *   - No implied expectation ("you should", "you can", "time to")
 *   - Minimum length: 5 chars
 *   - Maximum length: 80 chars
 */

import { STATES } from './stateEngine.js';
import { CONTINUITY_TAGS } from './patternEngine.js';
import { TODAY_COPY_MAP }   from './todayCopyMap.js';

// ─── Disallowed patterns ──────────────────────────────────────────────────────

const DISALLOWED = [
  /\btry\b/i,
  /\bstart\b/i,
  /\bimprove\b/i,
  /\bbetter\b/i,
  /\bgood job\b/i,
  /\bwell done\b/i,
  /\bprogress\b/i,
  /\bmoving forward\b/i,
  /\bnext step\b/i,
  /\byou should\b/i,
  /\byou can do\b/i,
  /\btime to\b/i,
  /\bkeep going\b/i,
  /\bkeep it up\b/i,
];

const MIN_LENGTH = 5;
const MAX_LENGTH = 80;

// ─── Line validation ──────────────────────────────────────────────────────────

/**
 * Validate a headline or reassurance string.
 * Returns { valid: boolean, errors: string[] }
 *
 * @param {string|null} line
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateLine(line, fieldName = 'line') {
  const errors = [];

  if (line === null) return { valid: true, errors: [] };
  if (typeof line !== 'string') {
    return { valid: false, errors: [`${fieldName}: must be a string or null`] };
  }

  if (line.length < MIN_LENGTH) errors.push(`${fieldName}: too short (${line.length} chars)`);
  if (line.length > MAX_LENGTH) errors.push(`${fieldName}: too long (${line.length} chars)`);

  for (const pattern of DISALLOWED) {
    if (pattern.test(line)) {
      errors.push(`${fieldName}: disallowed pattern "${pattern.source}" in "${line}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateFirstLine(line) {
  return validateLine(line, 'headline');
}

export function validateReassurance(line) {
  return validateLine(line, 'reassurance');
}

// ─── Full map validation ──────────────────────────────────────────────────────

/**
 * Validate the entire copy map.
 * Returns { valid: boolean, errors: string[] }
 *
 * @param {object} [copyMap] — defaults to TODAY_COPY_MAP
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCopyMap(copyMap = TODAY_COPY_MAP) {
  const allErrors = [];
  const branches  = ['base', 'drift', 'flatDay'];

  for (const state of Object.values(STATES)) {
    for (const tag of Object.values(CONTINUITY_TAGS)) {
      for (const branch of branches) {
        const block = copyMap[state]?.[tag]?.[branch];
        if (!block) {
          allErrors.push(`MISSING: ${state} × ${tag} × ${branch}`);
          continue;
        }

        const headlineResult    = validateFirstLine(block.headline);
        const reassuranceResult = validateReassurance(block.reassurance);
        const statusResult      = validateLine(block.status, 'status');

        allErrors.push(...headlineResult.errors.map(e    => `${state}×${tag}×${branch}: ${e}`));
        allErrors.push(...reassuranceResult.errors.map(e => `${state}×${tag}×${branch}: ${e}`));
        allErrors.push(...statusResult.errors.map(e      => `${state}×${tag}×${branch}: ${e}`));
      }
    }
  }

  return { valid: allErrors.length === 0, errors: allErrors };
}
