/**
 * services/copyResolver.js — Copy Resolver
 *
 * Phase 4 (Copy): Resolves the correct copy block from the structured map.
 * Single entry point for all Today copy resolution.
 *
 * Resolution order:
 *   1. Night → NIGHT_COPY always
 *   2. state × continuityTag × variantBranch from TODAY_COPY_MAP
 *   3. state × continuityTag × 'base' (branch fallback)
 *   4. state × NEUTRAL × 'base' (tag fallback)
 *   5. FALLBACK_COPY (final safe fallback — never throws)
 *
 * All selection is deterministic. No randomness.
 */

import {
  TODAY_COPY_MAP,
  NIGHT_COPY,
  FALLBACK_COPY,
} from '../data/todayCopyMap.js';
import { CONTINUITY_TAGS } from './patternEngine.js';

// ─── Variant branch ───────────────────────────────────────────────────────────

/**
 * Resolve the variant branch key from drift/flatDay signals.
 *
 * @param {{
 *   atRiskOfDrift?: boolean,
 *   flatDayFlag?:   boolean,
 * }} context
 * @returns {'drift'|'flatDay'|'base'}
 */
export function resolveVariantBranch({ atRiskOfDrift = false, flatDayFlag = false }) {
  // drift takes priority over flatDay
  if (atRiskOfDrift) return 'drift';
  if (flatDayFlag)   return 'flatDay';
  return 'base';
}

// ─── First line key ───────────────────────────────────────────────────────────

/**
 * Return a stable key identifying the resolved copy variant.
 * Used for analytics and daily snapshot.
 *
 * @param {{
 *   resolvedState:  string,
 *   continuityTag:  string,
 *   isNight:        boolean,
 * }} context
 * @param {string} variantBranch
 * @returns {string}
 */
export function getFirstLineKey(context, variantBranch) {
  if (context.isNight) return 'NIGHT';
  return `${context.resolvedState}__${context.continuityTag}__${variantBranch}`;
}

// ─── Core resolution ──────────────────────────────────────────────────────────

/**
 * Resolve the copy block for the current context.
 * Never throws. Always returns a valid copy object.
 *
 * @param {{
 *   resolvedState:  string,
 *   continuityTag:  string,
 *   isNight:        boolean,
 *   atRiskOfDrift?: boolean,
 *   flatDayFlag?:   boolean,
 * }} context
 * @returns {{ headline: string, reassurance: string, status: string|null }}
 */
export function resolveTodayCopy(context) {
  const {
    resolvedState,
    continuityTag = CONTINUITY_TAGS.NEUTRAL,
    isNight       = false,
    atRiskOfDrift = false,
    flatDayFlag   = false,
  } = context;

  if (isNight) return { ...NIGHT_COPY };

  const branch = resolveVariantBranch({ atRiskOfDrift, flatDayFlag });

  return (
    TODAY_COPY_MAP[resolvedState]?.[continuityTag]?.[branch]            ??
    TODAY_COPY_MAP[resolvedState]?.[continuityTag]?.['base']            ??
    TODAY_COPY_MAP[resolvedState]?.[CONTINUITY_TAGS.NEUTRAL]?.['base']  ??
    { ...FALLBACK_COPY }
  );
}
