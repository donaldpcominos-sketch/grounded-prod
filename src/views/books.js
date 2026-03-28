// src/views/books.js
//
// Books view — orchestration and rendering only.
// No product logic, no Firestore calls, no status transition rules.
//
// All behaviour comes from:
//   src/domain/books.js
//   src/services/books.js

import { showToast } from '../utils.js';
import {
  getBooksByStatus,
  getBookSummary,
  getBookRecommendations,
  applyBookStatusTransition,
} from '../domain/books.js';
import {
  listBooks,
  createBook,
  updateBook,
  archiveBook,
} from '../services/books.js';

// ─── renderRecommendations ────────────────────────────────────────────────────

function renderRecommendations(books) {
  const recommendations = getBookRecommendations(books);
  if (recommendations.length === 0) return '';

  const items = recommendations.map(rec => `
    <div class="books-recommendation-item">
      <p class="books-recommendation-title">${rec.title}</p>
      <p class="books-recommendation-text">${rec.message}</p>
    </div>
  `).join('');

  return `
    <div class="books-recommendations">
      <p class="books-recommendations-heading">Reading signals</p>
      <div class="books-recommendation-list">
        ${items}
      </div>
    </div>
  `;
}

// ─── renderSummary ────────────────────────────────────────────────────────────

function renderSummary(summary) {
  if (summary.totalCount === 0) return '';

  return `
    <div class="books-summary">
      <span class="books-summary-item">${summary.readingCount} reading</span>
      <span class="books-summary-item">${summary.toReadCount} to read</span>
      <span class="books-summary-item">${summary.finishedCount} finished</span>
    </div>
  `;
}

// ─── renderBookCard ───────────────────────────────────────────────────────────

function renderBookActions(book) {
  switch (book.status) {
    case 'to-read':
      return `
        <button class="book-action" data-action="start-reading" data-book-id="${book.id}">Start Reading</button>
        <button class="book-action book-action--subtle" data-action="archive" data-book-id="${book.id}">Archive</button>
      `;
    case 'reading':
      return `
        <button class="book-action" data-action="mark-finished" data-book-id="${book.id}">Mark Finished</button>
        <button class="book-action book-action--subtle" data-action="move-to-read" data-book-id="${book.id}">To-Read</button>
        <button class="book-action book-action--subtle" data-action="archive" data-book-id="${book.id}">Archive</button>
      `;
    case 'finished':
      return `
        <button class="book-action book-action--subtle" data-action="edit-reflection" data-book-id="${book.id}">Edit Reflection</button>
        <button class="book-action book-action--subtle" data-action="move-reading" data-book-id="${book.id}">Move to Reading</button>
        <button class="book-action book-action--subtle" data-action="archive" data-book-id="${book.id}">Archive</button>
      `;
    default:
      return '';
  }
}

const STATUS_LABELS = {
  'to-read':  'To Read',
  'reading':  'Reading',
  'finished': 'Finished',
};

function renderBookCard(book) {
  const author = book.author
    ? `<p class="book-card-author">${book.author}</p>`
    : '';

  const statusLabel = STATUS_LABELS[book.status] || book.status;

  const reflection = book.status === 'finished'
    ? [
        book.rating
          ? `<p class="book-card-rating">${'★'.repeat(book.rating)}${'☆'.repeat(5 - book.rating)}</p>`
          : '',
        book.notes
          ? `<p class="book-card-note">${book.notes}</p>`
          : '',
      ].join('')
    : '';

  return `
    <div class="book-card">
      <div class="book-card-body">
        <div class="book-card-title-row">
          <p class="book-card-title">${book.title}</p>
          <span class="book-card-status">${statusLabel}</span>
        </div>
        ${author}
        ${reflection}
      </div>
      <div class="book-card-actions">
        ${renderBookActions(book)}
      </div>
    </div>
  `;
}

// ─── renderBookSection ────────────────────────────────────────────────────────

function renderBookSection(heading, books, emptyText, sectionId) {
  const count = books.length;

  const content = count > 0
    ? `<div class="book-card-list">${books.map(renderBookCard).join('')}</div>`
    : `
        <div class="books-empty-state">
          <p class="books-empty-state-text">${emptyText}</p>
        </div>
      `;

  return `
    <section class="books-section" id="${sectionId}">
      <div class="books-section-heading-row">
        <h2 class="books-section-heading">${heading}</h2>
        ${count > 0 ? `<span class="books-section-count">${count}</span>` : ''}
      </div>
      ${content}
    </section>
  `;
}

// ─── renderView ───────────────────────────────────────────────────────────────

function renderView(viewState) {
  const { toRead, reading, finished } = getBooksByStatus(viewState.books);
  const summary = getBookSummary(viewState.books);

  return `
    <main class="view-scroll">
      <div class="view-inner">

        <header class="page-header">
          <p class="eyebrow">Grounded</p>
          <h1 class="page-title">Books</h1>
          <p class="page-subtitle">Keep track of what you want to read and what stayed with you.</p>
        </header>

        ${renderSummary(summary)}
        ${renderRecommendations(viewState.books)}

        <div class="books-add-row">
          <button class="books-add-btn" id="addBookBtn">Add a Book</button>
        </div>

        <div class="books-sections">
          ${renderBookSection('Currently Reading', reading, 'Nothing in progress yet.', 'section-reading')}
          ${renderBookSection('Want to Read',      toRead,  'Your reading list is empty.', 'section-to-read')}
          ${renderBookSection('Finished',          finished, 'No finished books yet.', 'section-finished')}
        </div>

      </div>
    </main>
  `;
}

// ─── BooksView ────────────────────────────────────────────────────────────────

export const BooksView = {
  async init(container, user) {
    container.innerHTML = '<div class="loading-state"><p>Loading your books…</p></div>';

    let books;
    try {
      books = await listBooks(user.uid);
    } catch {
      container.innerHTML = '<div class="loading-state"><p>Could not load books — try again.</p></div>';
      return;
    }

    const viewState = { books };

    // ── Render ───────────────────────────────────────────────────────────────

    container.innerHTML = renderView(viewState);

    // ── Refresh ──────────────────────────────────────────────────────────────

    async function refreshBooks() {
      viewState.books = await listBooks(user.uid);
      container.innerHTML = renderView(viewState);
      bindActions();
    }

    // ── Action dispatch ──────────────────────────────────────────────────────
    //
    // All card buttons use data-action and data-book-id attributes.
    // A single delegated listener on the sections container handles all of them.
    // After any mutation: re-fetch from source and re-render.

    async function handleAction(action, bookId) {
      const book = viewState.books.find(b => b.id === bookId);
      if (!book) return;

      // Strict integer-only rating parse — rejects decimals like "4.5".
      function parseRating(input) {
        const trimmed = (input || '').trim();
        if (trimmed === '' || !/^\d+$/.test(trimmed)) return null;
        const n = Number(trimmed);
        return (n >= 1 && n <= 5) ? n : null;
      }

      try {
        if (action === 'archive') {
          const confirmed = window.confirm(
            'Archive this book?\n\nIt will be removed from your active lists, but not permanently deleted.'
          );
          if (!confirmed) return;
          await archiveBook(user.uid, bookId);
          await refreshBooks();
          return;
        }

        if (action === 'edit-reflection') {
          const ratingInput = prompt(
            'Update your rating (1–5, optional):',
            book.rating ?? ''
          );
          if (ratingInput === null) return; // user cancelled

          const noteInput = prompt(
            'Update your note (optional):',
            book.notes ?? ''
          );
          if (noteInput === null) return; // user cancelled

          await updateBook(user.uid, bookId, {
            ...book,
            rating: parseRating(ratingInput),
            notes:  noteInput.trim(),
          });
          await refreshBooks();
          return;
        }

        const nextStatus = {
          'start-reading': 'reading',
          'mark-finished':  'finished',
          'move-to-read':   'to-read',
          'move-reading':   'reading',
        }[action];

        if (!nextStatus) return;

        const updatedBook = applyBookStatusTransition(book, nextStatus);

        if (action === 'mark-finished') {
          const ratingInput = prompt('How would you rate this book? (1–5, optional)') || '';
          updatedBook.rating = parseRating(ratingInput);

          const noteInput  = (prompt('What stayed with you from this book? (optional)') || '').trim();
          updatedBook.notes = noteInput;
        }

        await updateBook(user.uid, bookId, updatedBook);
        await refreshBooks();

      } catch {
        showToast('Something went wrong — try again.', 'error');
      }
    }

    // ── Bind ─────────────────────────────────────────────────────────────────

    function bindActions() {
      const sectionsEl = container.querySelector('.books-sections');
      if (!sectionsEl) return;

      sectionsEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const bookId = btn.dataset.bookId;
        if (!action || !bookId) return;

        // Disable the button immediately to prevent double-fire.
        btn.disabled = true;

        await handleAction(action, bookId);

        // If the button is still in the DOM after re-render, re-enable it.
        // In practice, re-render replaces the node, so this is a safety guard only.
        btn.disabled = false;
      });

      document.getElementById('addBookBtn')?.addEventListener('click', async () => {
        const title = (prompt('Book title:') || '').trim();
        if (!title) return;

        const author = (prompt('Author (optional):') || '').trim();

        try {
          await createBook(user.uid, {
            title,
            author: author || '',
            status: 'to-read',
          });
          await refreshBooks();
        } catch {
          showToast('Could not add book — try again.', 'error');
        }
      });
    }

    bindActions();
  },
};
