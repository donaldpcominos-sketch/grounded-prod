import { db } from '../lib/firebase.js';
import { doc, getDoc, getDocFromServer, setDoc, serverTimestamp } from 'firebase/firestore';
import { getTodayKey } from '../utils.js';

export async function getTodayWellnessCheckin(userId) {
  const todayKey = getTodayKey();
  const ref = doc(db, 'users', userId, 'wellnessCheckins', todayKey);

  // Always read from server on load — prevents yesterday's cached mood/energy
  // appearing as today's values due to Firestore offline persistence.
  try {
    const snapshot = await getDocFromServer(ref);
    if (!snapshot.exists()) {
      return { hydrationGlasses: 0, mood: '', energy: '' };
    }
    return snapshot.data();
  } catch {
    // Offline — fall back to cache, but strip mood/energy so they start blank
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      return { hydrationGlasses: 0, mood: '', energy: '' };
    }
    const data = snapshot.data();
    // Only trust hydration from cache — mood/energy should not carry over
    return { hydrationGlasses: data.hydrationGlasses ?? 0, mood: '', energy: '' };
  }
}

export async function saveTodayWellnessCheckin(userId, data) {
  const todayKey = getTodayKey();
  const ref = doc(db, 'users', userId, 'wellnessCheckins', todayKey);

  await setDoc(ref, {
    date: todayKey,
    hydrationGlasses: data.hydrationGlasses ?? 0,
    mood: data.mood ?? '',
    energy: data.energy ?? '',
    updatedAt: serverTimestamp()
  }, { merge: true });
}
