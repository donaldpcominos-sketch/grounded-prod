/**
 * services/entitlements.js — Entitlement Scaffolding
 *
 * Phase 3: Lightweight entitlement layer. No UI impact. No feature gating yet.
 * Provides a stable interface for future entitlement checks without
 * any current restrictions or user-visible behaviour.
 *
 * Design intent:
 * - All users currently receive the FREE tier
 * - Tier is read from users/{userId}/presence/config (entitlementTier field)
 * - Falls back to FREE if missing or unreadable
 * - No UI, no messaging, no paywall — scaffolding only
 *
 * Future: premium tiers can be added here without touching call sites.
 */

import { db } from '../lib/firebase.js';
import { doc, getDoc } from 'firebase/firestore';

// ─── Tiers ────────────────────────────────────────────────────────────────────

export const ENTITLEMENT_TIERS = Object.freeze({
  FREE:    'FREE',
  // PREMIUM: 'PREMIUM',  — reserved for future use
});

// ─── Default ──────────────────────────────────────────────────────────────────

const DEFAULT_TIER = ENTITLEMENT_TIERS.FREE;

// ─── Session cache ────────────────────────────────────────────────────────────

let _cachedTier = null;

// ─── Read entitlement ─────────────────────────────────────────────────────────

/**
 * Resolve the user's current entitlement tier.
 * Cached per session — only one Firestore read per session.
 * Always returns a valid tier string — never throws.
 *
 * @param {string} userId
 * @returns {Promise<string>} ENTITLEMENT_TIERS value
 */
export async function getEntitlementTier(userId) {
  if (_cachedTier) return _cachedTier;

  try {
    const snap = await getDoc(doc(db, 'users', userId, 'presence', 'config'));
    if (snap.exists()) {
      const tier = snap.data().entitlementTier;
      if (tier && Object.values(ENTITLEMENT_TIERS).includes(tier)) {
        _cachedTier = tier;
        return _cachedTier;
      }
    }
  } catch {
    // Non-critical — fall through to default
  }

  _cachedTier = DEFAULT_TIER;
  return _cachedTier;
}

/**
 * Check if the user has a specific entitlement tier or higher.
 * Currently always returns true for FREE (which is everyone).
 *
 * @param {string} userId
 * @param {string} requiredTier
 * @returns {Promise<boolean>}
 */
export async function hasEntitlement(userId, requiredTier) {
  const tier = await getEntitlementTier(userId);

  // Tier hierarchy: FREE
  // All current users qualify for FREE-gated features
  if (requiredTier === ENTITLEMENT_TIERS.FREE) return true;

  return tier === requiredTier;
}
