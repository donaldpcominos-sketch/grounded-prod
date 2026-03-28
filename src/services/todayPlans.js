// src/services/todayPlans.js
//
// Firestore persistence for Today Plans, and the AI copy-enrichment call.
//
// Firestore path: users/{userId}/todayPlans/{dateKey}
//
// This file owns:
//   - Saving and loading plan documents to/from Firestore
//   - Calling the AI enrichment Netlify function
//   - Merging AI-enhanced copy back onto the 3 recommendations
//
// This file does NOT own:
//   - Scoring or ranking (domain/todayPlans.js)
//   - Place fetching or enrichment (services/places.js)
//   - Any UI logic

import { db } from '../lib/firebase.js';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  orderBy,
  limit,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { getTodayKey } from '../utils.js';

// ─── Firestore helpers ────────────────────────────────────────────────────────

function planRef(userId, dateKey) {
  return doc(db, 'users', userId, 'todayPlans', dateKey);
}

function plansCollectionRef(userId) {
  return collection(db, 'users', userId, 'todayPlans');
}

// ─── Save ─────────────────────────────────────────────────────────────────────

export async function saveTodayPlan(userId, context, recommendations) {
  const dateKey = getTodayKey();
  await setDoc(planRef(userId, dateKey), {
    dateKey,
    context,
    recommendations,
    createdAt:  serverTimestamp(),
    updatedAt:  serverTimestamp(),
  }, { merge: true });
}

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function loadTodayPlan(userId) {
  const dateKey = getTodayKey();
  const snap    = await getDoc(planRef(userId, dateKey));
  return snap.exists() ? snap.data() : null;
}

export async function loadRecentPlans(userId, count = 5) {
  const q    = query(plansCollectionRef(userId), orderBy('dateKey', 'desc'), limit(count));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
}

// ─── AI copy enrichment ───────────────────────────────────────────────────────
//
// Calls the Netlify function that runs Claude Haiku.
// If the call fails for any reason, returns the original recommendations unchanged.
// The domain has already set deterministic `description` and `whyNow` fields,
// so the UI is never blocked on this.
//
// Returns: Recommendation[] (length 3, always)

export async function enrichRecommendationsWithAi(recommendations, context) {
  if (!Array.isArray(recommendations) || recommendations.length !== 3) {
    return recommendations;
  }

  // Build the minimal payload — only what the AI needs for copy
  const candidatePayload = recommendations.map(r => ({
    id:     r.id,
    name:   r.name,
    subtype: r.subtype,
    role:   r.role,
    tags:   r.tags,
    indoorOutdoor: r.indoorOutdoor,
  }));

  const contextPayload = {
    parentMood: context.parentMood,
    nicoMood:   context.nicoMood,
    weather:    context.weather,
    duration:   context.duration,
    vibe:       context.vibe,
  };

  try {
    const res = await fetch('/.netlify/functions/plan-recommendations', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        candidates: candidatePayload,
        context:    contextPayload,
      }),
    });

    if (!res.ok) return recommendations; // function unavailable — use deterministic copy

    const json = await res.json();

    if (!json.ok || !Array.isArray(json.enhancements) || json.enhancements.length !== 3) {
      return recommendations; // AI returned unusable data — use deterministic copy
    }

    // Merge AI-enhanced copy onto recommendations (id must match)
    return recommendations.map((rec, i) => {
      const enhancement = json.enhancements[i];
      // Final safety check — id must match exactly
      if (!enhancement || enhancement.id !== rec.id) return rec;
      return {
        ...rec,
        description: enhancement.description || rec.description,
        whyNow:      enhancement.whyNow      || rec.whyNow,
      };
    });

  } catch {
    // Network error, timeout, parse failure — always fall back gracefully
    return recommendations;
  }
}
