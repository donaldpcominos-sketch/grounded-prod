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
  applyBookStatusTransition,
} from '../domain/books.js';
import {
  listBooks,
  createBook,
  updateBook,
  archiveBook,
} from '../services/books.js';

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

  return `
    <div class="book-card">
      <div class="book-card-body">
        <div class="book-card-title-row">
          <p class="book-card-title">${book.title}</p>
          <span class="book-card-status">${statusLabel}</span>
        </div>
        ${author}
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

      try {
        if (action === 'archive') {
          await archiveBook(user.uid, bookId);
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
