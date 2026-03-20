import { db } from '../lib/firebase.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getTodayKey } from '../utils.js';

export async function getTodayWellnessCheckin(userId) {
  const todayKey = getTodayKey();
  const ref = doc(db, 'users', userId, 'wellnessCheckins', todayKey);
  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    return { hydrationGlasses: 0, mood: '', energy: '' };
  }

  return snapshot.data();
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
