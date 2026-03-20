// src/services/journal.js
import { db } from '../lib/firebase.js';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs
} from 'firebase/firestore';
import { getTodayKey } from '../utils.js';
import { getTodayPrompt } from '../data/prompts.js';

// ─── Get today's journal entry ─────────────────────────────────────────────────
// Returns { date, prompt, entry }
// - If a Firestore entry exists for today: uses the saved prompt (so it never changes mid-day)
// - If no entry yet: uses getTodayPrompt() from the curated bank

export async function getTodayJournalEntry(userId) {
  const dateKey = getTodayKey();
  const ref = doc(db, 'users', userId, 'journalEntries', dateKey);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();
    return {
      date: dateKey,
      prompt: data.prompt || getTodayPrompt(),
      entry: data.entry || ''
    };
  }

  // No entry yet — return the curated prompt for today
  return {
    date: dateKey,
    prompt: getTodayPrompt(),
    entry: ''
  };
}

// ─── Save today's journal entry ────────────────────────────────────────────────
// Saves { prompt, entry } — prompt is preserved as whatever was shown to the user

export async function saveTodayJournalEntry(userId, { prompt, entry }) {
  const dateKey = getTodayKey();
  const ref = doc(db, 'users', userId, 'journalEntries', dateKey);
  await setDoc(ref, { prompt, entry, savedAt: new Date().toISOString() }, { merge: true });
}

// ─── Get recent journal entries ────────────────────────────────────────────────
// Returns the last 20 entries, newest first, as [{ date, prompt, entry }]
// Sorted client-side — avoids Firestore composite index requirement on __name__

export async function getRecentJournalEntries(userId) {
  const colRef = collection(db, 'users', userId, 'journalEntries');
  const snap = await getDocs(colRef);
  const entries = snap.docs.map(d => ({
    date: d.id,
    prompt: d.data().prompt || '',
    entry: d.data().entry || ''
  }));
  // Sort descending by date string (YYYY-MM-DD sorts lexicographically)
  entries.sort((a, b) => b.date.localeCompare(a.date));
  return entries.slice(0, 20);
}
