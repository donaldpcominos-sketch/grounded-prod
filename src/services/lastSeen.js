// src/services/lastSeen.js
// Tracks lastActiveAt on the user doc — debounced to once per session.
// Returns gap info for the return message card in today.js.

import { db } from '../lib/firebase.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

let _writtenThisSession = false;

/**
 * Write lastActiveAt to Firestore, at most once per JS session.
 * Call this from any view init — only the first call per session fires.
 */
export async function touchLastActive(userId) {
  if (_writtenThisSession) return;
  _writtenThisSession = true;
  try {
    await setDoc(
      doc(db, 'users', userId),
      { lastActiveAt: serverTimestamp() },
      { merge: true }
    );
  } catch {
    // Non-critical — swallow silently
  }
}

/**
 * Read the lastActiveAt timestamp and return gap info.
 * Returns: { lastActiveAt: Date|null, gapHours: number }
 */
export async function getLastActiveGap(userId) {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (!snap.exists()) return { lastActiveAt: null, gapHours: 0 };
    const data = snap.data();
    if (!data.lastActiveAt) return { lastActiveAt: null, gapHours: 0 };
    const lastDate = data.lastActiveAt.toDate();
    const gapMs = Date.now() - lastDate.getTime();
    const gapHours = gapMs / (1000 * 60 * 60);
    return { lastActiveAt: lastDate, gapHours };
  } catch {
    return { lastActiveAt: null, gapHours: 0 };
  }
}
