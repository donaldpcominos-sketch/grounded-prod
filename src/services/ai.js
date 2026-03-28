import { db, auth } from '../lib/firebase';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

function buildCacheKey(books, options) {
  const mode = options.mode || 'history';
  const userPrompt = (options.userPrompt || '').trim().toLowerCase();

  const relevantBooks = (books || [])
    .filter(b => b && !b.isArchived)
    .map(b => ({
      t: (b.title || '').toLowerCase(),
      a: (b.author || '').toLowerCase(),
      s: b.status || '',
      r: b.rating ?? null,
      n: (b.notes || '').slice(0, 60),
      fr: (b.feedbackReason || '').slice(0, 50),
      fn: (b.feedbackNotes || '').slice(0, 60),
    }))
    .sort((a, b) => a.t.localeCompare(b.t));

  const base = JSON.stringify({
    mode,
    userPrompt,
    books: relevantBooks,
  });

  // simple hash (fast, deterministic, no dependency)
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }

  return `v1_${mode}_${hash}`;
}

export async function fetchBookRecommendations(books, options = {}) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }

  const cacheKey = buildCacheKey(books, options);
  const cacheRef = doc(
    db,
    'users',
    user.uid,
    'bookRecommendationCache',
    cacheKey
  );

  // -----------------------------
  // 1. CHECK CACHE
  // -----------------------------
  try {
    const snap = await getDoc(cacheRef);

    if (snap.exists()) {
      const data = snap.data();

      const createdAt = data.createdAt?.toMillis?.() || 0;
      const now = Date.now();

      const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

      if (now - createdAt < MAX_AGE && data.result) {
  return {
    ...data.result,
    _meta: {
      source: 'cache',
      createdAt,
    },
  };
}
    }
  } catch {
    // silent fail — never block main flow
  }

  // -----------------------------
  // 2. CALL BACKEND (EXISTING)
  // -----------------------------
  const payload = {
    books,
    mode: options.mode || 'history',
    userPrompt: options.userPrompt || '',
  };

  const response = await fetch('/.netlify/functions/book-recommendations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = 'Failed to fetch book recommendations';

    try {
      const error = await response.json();
      if (error?.error) message = error.error;
    } catch {}

    throw new Error(message);
  }

  const result = await response.json();

const enriched = {
  ...result,
  _meta: {
    source: 'api',
    createdAt: Date.now(),
  },
};

  // -----------------------------
  // 3. WRITE CACHE (NON-BLOCKING)
  // -----------------------------
  try {
    await setDoc(cacheRef, {
  result,
      createdAt: serverTimestamp(),
      mode: options.mode || 'history',
      userPrompt: options.userPrompt || '',
      version: 1,
    });
  } catch {
    // ignore write failures
  }

  return enriched;
  
}