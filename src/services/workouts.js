// src/services/workouts.js
// Firestore operations for workout sessions, streaks, and banned exercises.

import { db } from '../lib/firebase.js';
import {
  doc, getDoc, setDoc, collection,
  getDocs, serverTimestamp
} from 'firebase/firestore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDateKey(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ─── Workout session ops ──────────────────────────────────────────────────────

export async function getTodayWorkoutSession(userId) {
  const dateKey = getTodayKey();
  const ref = doc(db, 'users', userId, 'workoutSessions', dateKey);
  const snap = await getDoc(ref);
  return snap.exists() ? { ...snap.data(), dateKey } : null;
}

export async function saveWorkoutSession(userId, sessionData) {
  const dateKey = getTodayKey();
  const ref = doc(db, 'users', userId, 'workoutSessions', dateKey);
  await setDoc(ref, {
    ...sessionData,
    date: dateKey,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function completeWorkoutSession(userId, sessionData) {
  const dateKey = getTodayKey();
  const ref = doc(db, 'users', userId, 'workoutSessions', dateKey);
  await setDoc(ref, {
    ...sessionData,
    date: dateKey,
    status: 'complete',
    completedAt: serverTimestamp()
  }, { merge: true });
}

// ─── Recent sessions ──────────────────────────────────────────────────────────

export async function getRecentWorkoutSessions(userId, days = 30) {
  const ref = collection(db, 'users', userId, 'workoutSessions');
  const snap = await getDocs(ref);
  // Sort client-side by date key (YYYY-MM-DD) — no index required
  return snap.docs
    .map(d => ({ ...d.data(), dateKey: d.id }))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
    .slice(0, days);
}

// ─── Streak calculation (with grace day logic) ────────────────────────────────
//
// Rules:
//   - A completed session on a given day counts as an active day.
//   - A single missed day does NOT break the streak (grace day).
//   - Two or more consecutive missed days DOES break the streak.
//   - "Today" is excluded from the look-back if no session yet
//     (we don't penalise an in-progress day).
//
// Returns: { streak: number, hadGraceDay: boolean, graceDayUsedOn: string|null }

export async function getWorkoutStreak(userId) {
  const ref = collection(db, 'users', userId, 'workoutSessions');
  const snap = await getDocs(ref);
  // Sort client-side — no index required
  const allSessions = snap.docs.map(d => ({ ...d.data(), dateKey: d.id }));

  // Build a Set of completed date keys
  const completedDates = new Set(
    allSessions
      .filter(d => d.status === 'complete')
      .map(d => d.date || d.dateKey)
      .filter(Boolean)
  );

  const todayKey = getTodayKey();
  let streak = 0;
  let hadGraceDay = false;
  let graceDayUsedOn = null;
  let graceAvailable = true; // Only one grace day allowed per streak window
  let consecutiveMissed = 0;

  // Walk backwards from yesterday (or today if already done)
  // Start from today if completed, else from yesterday
  const startOffset = completedDates.has(todayKey) ? 0 : 1;

  for (let i = startOffset; i <= 60; i++) {
    const key = getDateKey(i);
    const isDone = completedDates.has(key);

    if (isDone) {
      streak++;
      consecutiveMissed = 0;
      // Grace day is replenished after a completed day
      graceAvailable = true;
    } else {
      consecutiveMissed++;

      if (consecutiveMissed === 1 && graceAvailable && streak > 0) {
        // Use the grace day — streak continues but we note it
        hadGraceDay = true;
        graceDayUsedOn = key;
        graceAvailable = false; // Can only use one grace day per streak
        // Don't increment streak for grace day, just continue
      } else {
        // Streak broken: either 2+ consecutive missed days,
        // or grace already used, or streak was 0
        break;
      }
    }
  }

  return { streak, hadGraceDay, graceDayUsedOn };
}

// ─── Banned exercises ─────────────────────────────────────────────────────────

export async function getBannedExercises(userId) {
  const ref = doc(db, 'users', userId);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data().bannedExercises || []) : [];
}

export async function banExercise(userId, exerciseId) {
  const banned = await getBannedExercises(userId);
  if (banned.includes(exerciseId)) return;
  await setDoc(doc(db, 'users', userId), {
    bannedExercises: [...banned, exerciseId],
    updatedAt: serverTimestamp()
  }, { merge: true });
}
