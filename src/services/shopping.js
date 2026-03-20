// ─── services/shopping.js ────────────────────────────────────────────────────
// Handles solo shopping list (per-user) and shared list between two accounts.
//
// Solo list:   users/{userId}/shoppingList/{itemId}
// Shared list: sharedLists/{sharedListId}/items/{itemId}
//              sharedLists/{sharedListId} has .members: [uid1, uid2]
//
// Shared linking flow:
//   1. User A calls createSharedList() → gets a sharedListId
//   2. User A shares the 6-char code with partner
//   3. User B calls joinSharedList(code) → both accounts now read/write same list

import { db } from '../lib/firebase.js';
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  deleteDoc, updateDoc, onSnapshot, query, orderBy,
  serverTimestamp, where
} from 'firebase/firestore';

// ─── Solo list ────────────────────────────────────────────────────────────────

export function subscribeSoloList(userId, onChange) {
  const ref = collection(db, 'users', userId, 'shoppingList');
  const q   = query(ref, orderBy('createdAt', 'asc'));
  return onSnapshot(q, snap => {
    onChange(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function addSoloItem(userId, text) {
  const ref = collection(db, 'users', userId, 'shoppingList');
  await addDoc(ref, { text, ticked: false, createdAt: serverTimestamp() });
}

export async function tickSoloItem(userId, itemId, ticked) {
  const ref = doc(db, 'users', userId, 'shoppingList', itemId);
  await updateDoc(ref, { ticked });
}

export async function deleteSoloItem(userId, itemId) {
  const ref = doc(db, 'users', userId, 'shoppingList', itemId);
  await deleteDoc(ref);
}

export async function clearTickedSoloItems(userId) {
  const ref  = collection(db, 'users', userId, 'shoppingList');
  const q    = query(ref, where('ticked', '==', true));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
}

// ─── Shared list ──────────────────────────────────────────────────────────────

// Get the shared list ID stored on the user's profile (null if not linked)
export async function getSharedListId(userId) {
  const ref  = doc(db, 'users', userId);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data().sharedListId || null) : null;
}

// Create a new shared list — caller becomes first member
export async function createSharedList(userId) {
  // Generate a short 6-char code from a random ID
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const listRef = doc(db, 'sharedLists', code);
  await setDoc(listRef, { members: [userId], createdAt: serverTimestamp() });
  // Save the code on the user profile
  await updateDoc(doc(db, 'users', userId), { sharedListId: code });
  return code;
}

// Join an existing shared list by code
export async function joinSharedList(userId, code) {
  const listRef  = doc(db, 'sharedLists', code.toUpperCase());
  const listSnap = await getDoc(listRef);
  if (!listSnap.exists()) throw new Error('List not found — check the code and try again.');
  const { members } = listSnap.data();
  if (members.includes(userId)) {
    // Already a member — just save to profile
    await updateDoc(doc(db, 'users', userId), { sharedListId: code.toUpperCase() });
    return;
  }
  if (members.length >= 2) throw new Error('This list already has two members.');
  await updateDoc(listRef, { members: [...members, userId] });
  await updateDoc(doc(db, 'users', userId), { sharedListId: code.toUpperCase() });
}

// Leave / unlink the shared list (does not delete it for the other person)
export async function leaveSharedList(userId) {
  const code = await getSharedListId(userId);
  if (!code) return;
  const listRef  = doc(db, 'sharedLists', code);
  const listSnap = await getDoc(listRef);
  if (listSnap.exists()) {
    const filtered = listSnap.data().members.filter(m => m !== userId);
    await updateDoc(listRef, { members: filtered });
  }
  await updateDoc(doc(db, 'users', userId), { sharedListId: null });
}

export function subscribeSharedList(code, onChange) {
  const ref = collection(db, 'sharedLists', code, 'items');
  const q   = query(ref, orderBy('createdAt', 'asc'));
  return onSnapshot(q, snap => {
    onChange(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function addSharedItem(code, text) {
  const ref = collection(db, 'sharedLists', code, 'items');
  await addDoc(ref, { text, ticked: false, createdAt: serverTimestamp() });
}

export async function tickSharedItem(code, itemId, ticked) {
  const ref = doc(db, 'sharedLists', code, 'items', itemId);
  await updateDoc(ref, { ticked });
}

export async function deleteSharedItem(code, itemId) {
  const ref = doc(db, 'sharedLists', code, 'items', itemId);
  await deleteDoc(ref);
}

export async function clearTickedSharedItems(code) {
  const ref  = collection(db, 'sharedLists', code, 'items');
  const q    = query(ref, where('ticked', '==', true));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
}
