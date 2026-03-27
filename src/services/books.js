// src/services/books.js
//
// Firestore persistence for the Books system.
// This file owns reads, writes, and data normalisation only.
//
// Books path: users/{userId}/books/{bookId}
//
// All product logic (status transitions, lifecycle rules, grouping, summaries)
// lives in src/domain/books.js. This file does not duplicate that behaviour —
// it delegates to domain helpers where appropriate and persists the result.

import { db } from '../lib/firebase.js';
import {
  doc,
  collection,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

import { normalizeBook, validateBookInput } from '../domain/books.js';

// ─── Firestore ref helpers ────────────────────────────────────────────────────

function booksCol(userId) {
  return collection(db, 'users', userId, 'books');
}

function bookRef(userId, bookId) {
  return doc(db, 'users', userId, 'books', bookId);
}

// ─── listBooks ────────────────────────────────────────────────────────────────

// Fetches all books for a user and returns them as normalised objects.
// Returns all books — archived and non-archived — so callers and domain helpers
// (getBooksByStatus, getBookSummary) can filter consciously.
// Ordering is left to the caller; no server-side ordering is imposed.
export async function listBooks(userId) {
  const snap = await getDocs(booksCol(userId));

  return snap.docs.map(d => normalizeBook({ ...d.data(), id: d.id }));
}

// ─── getBook ──────────────────────────────────────────────────────────────────

// Fetches a single book by ID.
// Returns a normalised book object, or null if the document does not exist.
export async function getBook(userId, bookId) {
  const snap = await getDoc(bookRef(userId, bookId));

  if (!snap.exists()) return null;

  return normalizeBook({ ...snap.data(), id: snap.id });
}

// ─── createBook ───────────────────────────────────────────────────────────────

// Validates input, persists a new book document, and returns the normalised result.
// Throws if input is invalid — callers are responsible for running validateBookInput
// before calling this if they want to surface field-level errors in UI.
// createdAt and updatedAt are set here; the caller must not supply them.
export async function createBook(userId, input) {
  const { valid, errors } = validateBookInput(input);

  if (!valid) {
    const messages = Object.values(errors).join(' ');
    throw new Error(`Cannot create book: ${messages}`);
  }

  const normalized = normalizeBook({
    ...input,
    source:    input.source || 'manual',
    status:    input.status || 'to-read',
    isArchived: false,
  });

  // Strip id — Firestore will generate one via addDoc.
  const { id: _id, createdAt: _ca, updatedAt: _ua, ...fields } = normalized;

  const docRef = await addDoc(booksCol(userId), {
    ...fields,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return normalizeBook({ ...fields, id: docRef.id });
}

// ─── updateBook ───────────────────────────────────────────────────────────────

// Merges updates onto an existing book document and returns the normalised result.
// Preserves createdAt. Always refreshes updatedAt.
// Callers must apply status transition logic via applyBookStatusTransition
// (src/domain/books.js) before passing the payload here.
export async function updateBook(userId, bookId, updates) {
  const { createdAt: _ca, id: _id, ...safeUpdates } = updates;

  await setDoc(bookRef(userId, bookId), {
    ...safeUpdates,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return getBook(userId, bookId);
}

// ─── archiveBook ──────────────────────────────────────────────────────────────

// Soft-deletes a book by setting isArchived = true.
// Does not remove the document. Domain and views must treat isArchived books
// as inactive — getBooksByStatus and getBookSummary already exclude them.
export async function archiveBook(userId, bookId) {
  await setDoc(bookRef(userId, bookId), {
    isArchived: true,
    updatedAt:  serverTimestamp(),
  }, { merge: true });
}
