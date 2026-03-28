// src/domain/books.js
//
// All book product logic lives here.
// This file is pure: it receives data as arguments and returns decisions or
// transformed objects. It does not touch Firestore, the DOM, or any service.
//
// Callers are responsible for providing already-fetched book data.
// Timestamps (createdAt, updatedAt) are the responsibility of the service layer.

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_STATUSES = ['to-read', 'reading', 'finished', 'stopped'];
const VALID_FEEDBACK_TYPES = ['positive', 'negative', 'neutral'];

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isValidStatus(status) {
  return VALID_STATUSES.includes(status);
}

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

function normalizeRating(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 5) return null;
  return Math.round(n);
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeFeedbackType(value) {
  return VALID_FEEDBACK_TYPES.includes(value) ? value : null;
}

// ─── normalizeBook ────────────────────────────────────────────────────────────

export function normalizeBook(book) {
  if (!book || typeof book !== 'object') {
    return {
      id:             null,
      title:          '',
      author:         '',
      status:         'to-read',
      coverUrl:       null,
      description:    '',
      categories:     [],
      source:         'manual',
      rating:         null,
      notes:          '',
      startedAt:      null,
      finishedAt:     null,
      stoppedAt:      null,
      feedbackType:   null,
      feedbackReason: '',
      feedbackNotes:  '',
      archivedReason: '',
      createdAt:      null,
      updatedAt:      null,
      isArchived:     false,
    };
  }

  return {
    id:             book.id ?? null,
    title:          normalizeText(book.title),
    author:         normalizeText(book.author),
    status:         isValidStatus(book.status) ? book.status : 'to-read',
    coverUrl:       book.coverUrl ?? null,
    description:    normalizeText(book.description),
    categories:     normalizeCategories(book.categories),
    source:         typeof book.source === 'string' ? book.source : 'manual',
    rating:         normalizeRating(book.rating),
    notes:          normalizeText(book.notes),
    startedAt:      book.startedAt ?? null,
    finishedAt:     book.finishedAt ?? null,
    stoppedAt:      book.stoppedAt ?? null,
    feedbackType:   normalizeFeedbackType(book.feedbackType),
    feedbackReason: normalizeText(book.feedbackReason),
    feedbackNotes:  normalizeText(book.feedbackNotes),
    archivedReason: normalizeText(book.archivedReason),
    createdAt:      book.createdAt ?? null,
    updatedAt:      book.updatedAt ?? null,
    isArchived:     book.isArchived === true,
  };
}

// ─── validateBookInput ────────────────────────────────────────────────────────

export function validateBookInput(input) {
  const errors = {};

  if (!input?.title || typeof input.title !== 'string' || input.title.trim().length === 0) {
    errors.title = 'Title is required.';
  }

  if (input?.status !== undefined && !isValidStatus(input.status)) {
    errors.status = `Status must be one of: ${VALID_STATUSES.join(', ')}.`;
  }

  if (input?.rating !== undefined && input.rating !== null && input.rating !== '') {
    const n = Number(input.rating);
    if (!Number.isFinite(n) || n < 1 || n > 5) {
      errors.rating = 'Rating must be a number between 1 and 5, or left blank.';
    }
  }

  if (
    input?.categories !== undefined &&
    input.categories !== null &&
    typeof input.categories !== 'string' &&
    !Array.isArray(input.categories)
  ) {
    errors.categories = 'Categories must be a list of text values.';
  }

  if (
    input?.feedbackType !== undefined &&
    input.feedbackType !== null &&
    !VALID_FEEDBACK_TYPES.includes(input.feedbackType)
  ) {
    errors.feedbackType = `Feedback type must be one of: ${VALID_FEEDBACK_TYPES.join(', ')}.`;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// ─── applyBookStatusTransition ────────────────────────────────────────────────

export function applyBookStatusTransition(book, nextStatus, now = new Date().toISOString()) {
  const normalized = normalizeBook(book);

  if (!isValidStatus(nextStatus)) {
    return normalized;
  }

  const updated = { ...normalized, status: nextStatus };

  switch (nextStatus) {
    case 'to-read':
      updated.startedAt = null;
      updated.finishedAt = null;
      updated.stoppedAt = null;
      break;

    case 'reading':
      updated.startedAt = normalized.startedAt ?? now;
      updated.finishedAt = null;
      updated.stoppedAt = null;
      break;

    case 'finished':
      updated.startedAt = normalized.startedAt ?? now;
      updated.finishedAt = now;
      updated.stoppedAt = null;
      break;

    case 'stopped':
      updated.startedAt = normalized.startedAt ?? now;
      updated.finishedAt = null;
      updated.stoppedAt = now;
      break;
  }

  return updated;
}

// ─── getBooksByStatus ─────────────────────────────────────────────────────────

export function getBooksByStatus(books) {
  const result = { toRead: [], reading: [], finished: [], stopped: [] };

  if (!Array.isArray(books)) return result;

  for (const raw of books) {
    const book = normalizeBook(raw);

    if (book.isArchived) continue;

    switch (book.status) {
      case 'to-read':
        result.toRead.push(book);
        break;
      case 'reading':
        result.reading.push(book);
        break;
      case 'finished':
        result.finished.push(book);
        break;
      case 'stopped':
        result.stopped.push(book);
        break;
    }
  }

  return result;
}

// ─── getBookSummary ───────────────────────────────────────────────────────────

export function getBookSummary(books) {
  const { toRead, reading, finished, stopped } = getBooksByStatus(books);

  const toReadCount = toRead.length;
  const readingCount = reading.length;
  const finishedCount = finished.length;
  const stoppedCount = stopped.length;

  return {
    totalCount: toReadCount + readingCount + finishedCount + stoppedCount,
    toReadCount,
    readingCount,
    finishedCount,
    stoppedCount,
  };
}

// ─── getBookRecommendations ───────────────────────────────────────────────────

export function getBookRecommendations(books) {
  if (!Array.isArray(books)) return [];

  const finished = books
    .map(normalizeBook)
    .filter(book => !book.isArchived && book.status === 'finished');

  if (finished.length === 0) return [];

  const signals = [];

  const highlyRated = finished.filter(book => book.rating >= 4);
  if (highlyRated.length >= 2) {
    signals.push({
      title: 'You know what you enjoy',
      message: `${highlyRated.length} of your finished books landed at 4 or 5 stars. You have a clear sense of what resonates — trust that instinct when choosing what to read next.`,
    });
  }

  const withNotes = finished.filter(book => book.notes && book.notes.trim().length > 0);
  if (withNotes.length >= 2) {
    signals.push({
      title: 'Reflective reading suits you',
      message: `You've left notes on ${withNotes.length} finished books. Taking time to capture what stayed with you tends to make the reading stick.`,
    });
  }

  const categoryCounts = {};
  for (const book of finished) {
    for (const cat of book.categories || []) {
      if (cat) categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
  }

  const topCategory = Object.entries(categoryCounts)
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)[0];

  if (topCategory) {
    signals.push({
      title: 'A theme is emerging',
      message: `Several of your finished books touch on ${topCategory[0]}. That's worth leaning into.`,
    });
  }

  if (signals.length === 0) {
    signals.push({
      title: 'Keep going',
      message: 'Rate and note a few more finished books and your reading signals will start to take shape.',
    });
  }

  return signals.slice(0, 3);
}