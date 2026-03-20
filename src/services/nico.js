// src/services/nico.js
import { db } from '../lib/firebase.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getTodayKey } from '../utils.js';

// ─── Nap log ──────────────────────────────────────────────────────────────────

export async function getTodayNicoLog(userId) {
  const ref = doc(db, 'users', userId, 'nicoLogs', getTodayKey());
  const snap = await getDoc(ref);
  if (!snap.exists()) return { naps: [], completedActivities: [] };
  return snap.data();
}

export async function saveNicoLog(userId, data) {
  const ref = doc(db, 'users', userId, 'nicoLogs', getTodayKey());
  await setDoc(ref, {
    ...data,
    date: getTodayKey(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}
