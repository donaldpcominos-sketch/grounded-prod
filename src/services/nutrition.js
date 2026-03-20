// src/services/nutrition.js
// Firestore ops for nutrition logs.
// Path: users/{userId}/nutritionLogs/{date}
// Shape: { nourished: bool, note: string }

import { db } from '../lib/firebase.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Fetch today's nutrition log for a user.
 * Returns { nourished: false, note: '' } if no record exists yet.
 */
export async function getTodayNutritionLog(userId) {
  const ref  = doc(db, 'users', userId, 'nutritionLogs', todayKey());
  const snap = await getDoc(ref);
  if (!snap.exists()) return { nourished: false, note: '' };
  const data = snap.data();
  return {
    nourished: data.nourished ?? false,
    note:      data.note      ?? ''
  };
}

/**
 * Save (merge) nutrition log data for today.
 * @param {string} userId
 * @param {{ nourished?: boolean, note?: string }} data
 */
export async function saveTodayNutritionLog(userId, data) {
  const ref = doc(db, 'users', userId, 'nutritionLogs', todayKey());
  await setDoc(ref, {
    ...data,
    updatedAt: serverTimestamp()
  }, { merge: true });
}
