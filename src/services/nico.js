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

// ─── Nap mutations ────────────────────────────────────────────────────────────

// Replaces the nap at napIndex with updatedNap { start, end }.
// Reads the current log first so completedActivities are never clobbered.
export async function updateNap(userId, napIndex, updatedNap) {
  const ref  = doc(db, 'users', userId, 'nicoLogs', getTodayKey());
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : { naps: [], completedActivities: [] };

  const naps = Array.isArray(data.naps) ? [...data.naps] : [];
  if (napIndex < 0 || napIndex >= naps.length) return;
  naps[napIndex] = { ...updatedNap };

  await setDoc(ref, {
    ...data,
    naps,
    date: getTodayKey(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

// Removes the nap at napIndex from today's log.
// Reads the current log first so completedActivities are never clobbered.
export async function deleteNap(userId, napIndex) {
  const ref  = doc(db, 'users', userId, 'nicoLogs', getTodayKey());
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : { naps: [], completedActivities: [] };

  const naps = Array.isArray(data.naps) ? [...data.naps] : [];
  if (napIndex < 0 || napIndex >= naps.length) return;
  naps.splice(napIndex, 1);

  await setDoc(ref, {
    ...data,
    naps,
    date: getTodayKey(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}
