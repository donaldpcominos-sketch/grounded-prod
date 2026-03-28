// src/domain/books.js
//
// All book product logic lives here.
// This file is pure: it receives data as arguments and returns decisions or
// transformed objects. It does not touch Firestore, the DOM, or any service.
//
// Callers are responsible for providing already-fetched book data.
// Timestamps (createdAt, updatedAt) are the responsibility of the service layer.

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_STATUSES = ['to-read', 'reading', 'finished'];

// ─── Internal helpers ─────────────────────────────────────────────────────────

// Returns true if the value is one of the three permitted status strings.
function isValidStatus(status) {
  return VALID_STATUSES.includes(status);
}

// Coerce any incoming categories value into a plain array of non-empty strings.
// Accepts: undefined, null, a string, or an array.
function normalizeCategories(value) {
  if (!value) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value
      .filter(v => typeof v === 'string' && v.trim().length > 0)
      .map(v => v.trim());
  }
  return [];
}

// Coerce a rating value to a number 1–5, or null.
// Rejects objects, out-of-range numbers, and non-numeric strings.
function normalizeRating(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 5) return null;
  return Math.round(n);
}

// ─── normalizeBook ────────────────────────────────────────────────────────────

// Returns a safe, consistent book object with all fields guaranteed to be present.
// Should be called on every Firestore document before use.
// Does NOT set createdAt or updatedAt — those are managed by the service layer.
export function normalizeBook(book) {
  if (!book || typeof book !== 'object') {
    return {
      id:          null,
      title:       '',
      author:      '',
      status:      'to-read',
      coverUrl:    null,
      description: '',
      categories:  [],
      source:      'manual',
      rating:      null,
      notes:       '',
      startedAt:   null,
      finishedAt:  null,
      createdAt:   null,
      updatedAt:   null,
      isArchived:  false,
    };
  }

  return {
    id:          book.id          ?? null,
    title:       typeof book.title === 'string'  ? book.title.trim()  : '',
    author:      typeof book.author === 'string' ? book.author.trim() : '',
    status:      isValidStatus(book.status)      ? book.status        : 'to-read',
    coverUrl:    book.coverUrl    ?? null,
    description: typeof book.description === 'string' ? book.description.trim() : '',
    categories:  normalizeCategories(book.categories),
    source:      typeof book.source === 'string' ? book.source : 'manual',
    rating:      normalizeRating(book.rating),
    notes:       typeof book.notes === 'string'  ? book.notes.trim()  : '',
    startedAt:   book.startedAt   ?? null,
    finishedAt:  book.finishedAt  ?? null,
    createdAt:   book.createdAt   ?? null,
    updatedAt:   book.updatedAt   ?? null,
    isArchived:  book.isArchived  === true,
  };
}

// ─── validateBookInput ────────────────────────────────────────────────────────

// Validates user-supplied create/edit input before it is written to Firestore.
// Returns { valid: boolean, errors: { fieldName: 'message' } }.
// An empty errors object means the input is valid.
export function validateBookInput(input) {
  const errors = {};

  // title — required
  if (!input?.title || typeof input.title !== 'string' || input.title.trim().length === 0) {
    errors.title = 'Title is required.';
  }

  // status — must be a valid value if supplied
  if (input?.status !== undefined && !isValidStatus(input.status)) {
    errors.status = `Status must be one of: ${VALID_STATUSES.join(', ')}.`;
  }

  // rating — null / empty is allowed; if supplied it must be 1–5
  if (input?.rating !== undefined && input.rating !== null && input.rating !== '') {
    const n = Number(input.rating);
    if (!Number.isFinite(n) || n < 1 || n > 5) {
      errors.rating = 'Rating must be a number between 1 and 5, or left blank.';
    }
  }

  // categories — accepted as omitted, string, or array; validated only on type
  if (
    input?.categories !== undefined &&
    input.categories !== null &&
    typeof input.categories !== 'string' &&
    !Array.isArray(input.categories)
  ) {
    errors.categories = 'Categories must be a list of text values.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// ─── applyBookStatusTransition ────────────────────────────────────────────────

// Applies lifecycle rules for a status change and returns a new normalised book.
// Does NOT mutate the original. Returns the original normalised book unchanged
// if nextStatus is invalid.
//
// Lifecycle rules:
//   to-read  → startedAt = null,  finishedAt = null
//   reading  → startedAt = now (if missing), finishedAt = null
//   finished → startedAt = now (if missing), finishedAt = now
//
// Edge cases handled explicitly:
//   finished → reading : finishedAt cleared, startedAt preserved if present
//   to-read  → finished: startedAt and finishedAt both set to now
export function applyBookStatusTransition(book, nextStatus, now = new Date().toISOString()) {
  const normalized = normalizeBook(book);

  if (!isValidStatus(nextStatus)) {
    return normalized;
  }

  // Shallow-clone so we never mutate the input.
  const updated = { ...normalized, status: nextStatus };

  switch (nextStatus) {
    case 'to-read':
      updated.startedAt  = null;
      updated.finishedAt = null;
      break;

    case 'reading':
      updated.startedAt  = normalized.startedAt ?? now;
      updated.finishedAt = null;
      break;

    case 'finished':
      updated.startedAt  = normalized.startedAt ?? now;
      updated.finishedAt = now;
      break;
  }

  return updated;
}

// ─── getBooksByStatus ─────────────────────────────────────────────────────────

// Groups an array of books by status. Archived books are excluded.
// Each book is normalised before grouping so callers can pass raw Firestore data.
//
// Returns: { toRead: [], reading: [], finished: [] }
export function getBooksByStatus(books) {
  const result = { toRead: [], reading: [], finished: [] };

  if (!Array.isArray(books)) return result;

  for (const raw of books) {
    const book = normalizeBook(raw);

    if (book.isArchived) continue;

    switch (book.status) {
      case 'to-read':  result.toRead.push(book);   break;
      case 'reading':  result.reading.push(book);  break;
      case 'finished': result.finished.push(book); break;
    }
  }

  return result;
}

// ─── getBookSummary ───────────────────────────────────────────────────────────

// Returns counts across all statuses. Archived books are excluded.
// Derives counts from getBooksByStatus so the grouping logic stays in one place.
//
// Returns: { totalCount, toReadCount, readingCount, finishedCount }
export function getBookSummary(books) {
  const { toRead, reading, finished } = getBooksByStatus(books);

  const toReadCount    = toRead.length;
  const readingCount   = reading.length;
  const finishedCount  = finished.length;

  return {
    totalCount: toReadCount + readingCount + finishedCount,
    toReadCount,
    readingCount,
    finishedCount,
  };
}

// ─── getBookRecommendations ───────────────────────────────────────────────────

// Derives a small set of calm, deterministic reading signals from the user's
// own finished books. No external calls, no randomness, no AI.
// Operates only on non-archived finished books.
//
// Returns: array of { title, message } — between 0 and 3 items.
// Returns [] when there are no finished books at all.
export function getBookRecommendations(books) {
  if (!Array.isArray(books)) return [];

  const finished = books.filter(b => !b.isArchived && b.status === 'finished');

  if (finished.length === 0) return [];

  const signals = [];

  // Signal 1 — highly rated books: the user is finding books they genuinely enjoy.
  const highlyRated = finished.filter(b => b.rating >= 4);
  if (highlyRated.length >= 2) {
    signals.push({
      title:   'You know what you enjoy',
      message: `${highlyRated.length} of your finished books landed at 4 or 5 stars. You have a clear sense of what resonates — trust that instinct when choosing what to read next.`,
    });
  }

  // Signal 2 — notes present on multiple books: reflective reading is a habit.
  const withNotes = finished.filter(b => b.notes && b.notes.trim().length > 0);
  if (withNotes.length >= 2) {
    signals.push({
      title:   'Reflective reading suits you',
      message: `You've left notes on ${withNotes.length} finished books. Taking time to capture what stayed with you tends to make the reading stick.`,
    });
  }

  // Signal 3 — repeated category across finished books: a theme is emerging.
  const categoryCounts = {};
  for (const book of finished) {
    for (const cat of (book.categories || [])) {
      if (cat) categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
  }
  const topCategory = Object.entries(categoryCounts)
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)[0];

  if (topCategory) {
    signals.push({
      title:   'A theme is emerging',
      message: `Several of your finished books touch on ${topCategory[0]}. That's worth leaning into.`,
    });
  }

  // Fallback — finished books exist but signals are thin.
  // Shown only when no richer signal fired, to avoid an empty section.
  if (signals.length === 0) {
    signals.push({
      title:   'Keep going',
      message: 'Rate and note a few more finished books and your reading signals will start to take shape.',
    });
  }

  return signals.slice(0, 3);
}
