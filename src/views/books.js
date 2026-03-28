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
import { fetchBookRecommendations } from '../services/ai.js';

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

function renderAIRecommendations(aiState) {
  if (!aiState?.hasRequested) {
    return `
      <div class="books-recommendations">
        <p class="books-recommendations-heading">Suggested for you</p>
        <div class="books-recommendation-list">
          <div class="books-recommendation-item">
            <p class="books-recommendation-text">Get tailored suggestions based on what you've finished reading.</p>
          </div>
        </div>
        <div class="books-add-row">
          <button class="books-add-btn" id="loadBookRecommendationsBtn">Recommend a Book</button>
        </div>
      </div>
    `;
  }

  if (aiState.loading) {
    return `
      <div class="books-recommendations">
        <p class="books-recommendations-heading">Suggested for you</p>
        <div class="books-recommendation-list">
          <div class="books-recommendation-item">
            <p class="books-recommendation-text">Finding recommendations…</p>
          </div>
        </div>
      </div>
    `;
  }

  if (aiState.error) {
    return `
      <div class="books-recommendations">
        <p class="books-recommendations-heading">Suggested for you</p>
        <div class="books-recommendation-list">
          <div class="books-recommendation-item">
            <p class="books-recommendation-text">Unable to load recommendations right now.</p>
          </div>
        </div>
        <div class="books-add-row">
          <button class="books-add-btn" id="loadBookRecommendationsBtn">Try Again</button>
        </div>
      </div>
    `;
  }

  const signals = Array.isArray(aiState?.data?.signals) ? aiState.data.signals : [];
  const recommendations = Array.isArray(aiState?.data?.recommendations)
    ? aiState.data.recommendations
    : [];

  if (signals.length === 0 && recommendations.length === 0) {
    return `
      <div class="books-recommendations">
        <p class="books-recommendations-heading">Suggested for you</p>
        <div class="books-recommendation-list">
          <div class="books-recommendation-item">
            <p class="books-recommendation-text">Not enough reading history yet to suggest something meaningful.</p>
          </div>
        </div>
        <div class="books-add-row">
          <button class="books-add-btn" id="loadBookRecommendationsBtn">Try Again</button>
        </div>
      </div>
    `;
  }

  const signalItems = signals.map(signal => `
    <div class="books-recommendation-item">
      <p class="books-recommendation-text">${signal}</p>
    </div>
  `).join('');

  const recommendationItems = recommendations.map(rec => `
    <div class="books-recommendation-item">
      <p class="books-recommendation-title">${rec.title || ''}${rec.author ? ` — ${rec.author}` : ''}</p>
      <p class="books-recommendation-text">${rec.reason || ''}</p>
    </div>
  `).join('');

  return `
    <div class="books-recommendations">
      <p class="books-recommendations-heading">Suggested for you</p>
      <div class="books-recommendation-list">
        ${signalItems}
        ${recommendationItems}
      </div>
      <div class="books-add-row">
        <button class="books-add-btn" id="loadBookRecommendationsBtn">Refresh Suggestions</button>
      </div>
    </div>
  `;
}

// ─── renderAIRecommendations ──────────────────────────────────────────────────

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const books = Array.isArray(body.books) ? body.books : [];

    const finishedBooks = books
      .filter(book => book && book.status === 'finished')
      .slice(0, 8)
      .map(book => ({
        title: book.title || '',
        author: book.author || '',
        rating: book.rating ?? null,
        notes: (book.notes || '').slice(0, 200),
      }));

    if (finishedBooks.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          signals: [],
          recommendations: [],
        }),
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Missing GEMINI_API_KEY',
        }),
      };
    }

    const prompt = `
Return valid JSON only.

Shape:
{
  "signals": ["...", "..."],
  "recommendations": [
    {
      "title": "...",
      "author": "...",
      "reason": "..."
    }
  ]
}

Rules:
- Max 2 signals
- Max 2 recommendations
- Each signal must be short
- Each reason must be short
- No markdown
- No code fences
- No text outside JSON

Finished books:
${JSON.stringify(finishedBooks)}
`.trim();

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            topP: 0.8,
            maxOutputTokens: 1200,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Gemini request failed',
          details: errorText,
        }),
      };
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const finishReason = data?.candidates?.[0]?.finishReason || '';

    if (!rawText) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Gemini returned empty content',
          finishReason,
        }),
      };
    }

    if (finishReason === 'MAX_TOKENS') {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Gemini response was truncated',
          finishReason,
          raw: rawText,
        }),
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Gemini returned invalid JSON',
          finishReason,
          raw: rawText,
          details: error.message,
        }),
      };
    }

    const normalized = {
      signals: Array.isArray(parsed.signals)
        ? parsed.signals
            .filter(item => typeof item === 'string' && item.trim())
            .slice(0, 2)
        : [],
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.slice(0, 2).map(rec => ({
            title: typeof rec?.title === 'string' ? rec.title : '',
            author: typeof rec?.author === 'string' ? rec.author : '',
            reason: typeof rec?.reason === 'string' ? rec.reason : '',
          }))
        : [],
    };

    return {
      statusCode: 200,
      body: JSON.stringify(normalized),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Server error',
        details: error.message,
      }),
    };
  }
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
        ${renderAIRecommendations(viewState.ai)}

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

    const viewState = {
      books,
      ai: {
  hasRequested: false,
  loading: false,
  data: null,
  error: null,
},
    };

    // ── Render ───────────────────────────────────────────────────────────────

    function render() {
      container.innerHTML = renderView(viewState);
      bindActions();
    }

    render();

    // ── Bottom sheet ─────────────────────────────────────────────────────────
    //
    // openSheet(config) mounts a bottom sheet onto document.body and returns a
    // Promise that resolves with the submitted result object, or null if the
    // user cancels.
    //
    // config shape:
    // {
    //   title:    string,
    //   body:     string (optional explanatory text),
    //   fields:   [ { id, label, type, placeholder, value, rows } ],
    //   confirm:  string  (primary button label),
    //   cancel:   string  (cancel button label, defaults to 'Cancel'),
    //   danger:   bool    (true makes the confirm button use the danger style),
    // }
    //
    // Resolves with: { [fieldId]: value, ... } or null on cancel.

    function openSheet(config) {
      return new Promise(resolve => {
        const fieldsHtml = (config.fields || []).map(f => {
          if (f.type === 'textarea') {
            return `
              <div class="bsheet-field">
                <label class="bsheet-label" for="bsheet-${f.id}">${f.label}</label>
                <textarea
                  class="bsheet-textarea textarea"
                  id="bsheet-${f.id}"
                  placeholder="${f.placeholder || ''}"
                  rows="${f.rows || 3}"
                >${f.value || ''}</textarea>
              </div>
            `;
          }
          return `
            <div class="bsheet-field">
              <label class="bsheet-label" for="bsheet-${f.id}">${f.label}</label>
              <input
                class="bsheet-input"
                id="bsheet-${f.id}"
                type="${f.type || 'text'}"
                placeholder="${f.placeholder || ''}"
                value="${f.value || ''}"
                autocomplete="off"
              />
            </div>
          `;
        }).join('');

        const bodyHtml = config.body
          ? `<p class="bsheet-body">${config.body}</p>`
          : '';

        const confirmClass = config.danger
          ? 'bsheet-btn bsheet-btn--danger'
          : 'bsheet-btn bsheet-btn--primary';

        const el = document.createElement('div');
        el.className = 'bsheet-overlay';
        el.innerHTML = `
          <div class="bsheet" role="dialog" aria-modal="true">
            <div class="bsheet-handle"></div>
            <p class="bsheet-title">${config.title}</p>
            ${bodyHtml}
            ${fieldsHtml}
            <div class="bsheet-actions">
              <button class="${confirmClass}" id="bsheetConfirm">${config.confirm}</button>
              <button class="bsheet-btn bsheet-btn--cancel" id="bsheetCancel">${config.cancel || 'Cancel'}</button>
            </div>
          </div>
        `;

        document.body.appendChild(el);

        requestAnimationFrame(() => el.classList.add('bsheet-overlay--open'));

        function close(result) {
          el.classList.remove('bsheet-overlay--open');
          el.addEventListener('transitionend', () => el.remove(), { once: true });
          resolve(result);
        }

        el.getElementById = (id) => el.querySelector(`#${id}`);

        el.querySelector('#bsheetConfirm').addEventListener('click', () => {
          const result = {};
          (config.fields || []).forEach(f => {
            const input = el.querySelector(`#bsheet-${f.id}`);
            result[f.id] = input ? input.value : '';
          });
          close(result);
        });

        el.querySelector('#bsheetCancel').addEventListener('click', () => close(null));

        el.addEventListener('click', (e) => {
          if (e.target === el) close(null);
        });

        requestAnimationFrame(() => {
          const first = el.querySelector('input, textarea');
          if (first) first.focus();
        });
      });
    }

    // ── Shared helpers ────────────────────────────────────────────────────────

    function parseRating(input) {
      const trimmed = (input || '').trim();
      if (trimmed === '' || !/^\d+$/.test(trimmed)) return null;
      const n = Number(trimmed);
      return (n >= 1 && n <= 5) ? n : null;
    }

    // ── AI ────────────────────────────────────────────────────────────────────

    async function loadAIRecommendations() {
  try {
    viewState.ai.hasRequested = true;
    viewState.ai.loading = true;
    viewState.ai.error = null;
    render();

    const data = await fetchBookRecommendations(viewState.books);

    viewState.ai.data = data;
  } catch (error) {
    viewState.ai.error = error.message || 'Failed to load recommendations';
  } finally {
    viewState.ai.loading = false;
    render();
  }
}

    // ── Refresh ──────────────────────────────────────────────────────────────

    async function refreshBooks() {
  viewState.books = await listBooks(user.uid);

  viewState.ai.data = null;
  viewState.ai.error = null;
  viewState.ai.loading = false;
  viewState.ai.hasRequested = false;

  render();
}

    // ── Action dispatch ──────────────────────────────────────────────────────

    async function handleAction(action, bookId) {
      const book = viewState.books.find(b => b.id === bookId);
      if (!book) return;

      try {
        if (action === 'archive') {
          const result = await openSheet({
            title:   'Archive this book?',
            body:    'It will be removed from your active lists, but not permanently deleted.',
            fields:  [],
            confirm: 'Archive',
            cancel:  'Keep it',
            danger:  true,
          });
          if (!result) return;
          await archiveBook(user.uid, bookId);
          await refreshBooks();
          return;
        }

        if (action === 'edit-reflection') {
          const result = await openSheet({
            title:   'Edit reflection',
            fields:  [
              {
                id:          'rating',
                label:       'Rating (1–5, optional)',
                type:        'text',
                placeholder: 'e.g. 4',
                value:       book.rating ?? '',
              },
              {
                id:          'notes',
                label:       'What stayed with you?',
                type:        'textarea',
                placeholder: 'A line or two is plenty…',
                value:       book.notes ?? '',
                rows:        3,
              },
            ],
            confirm: 'Save',
          });
          if (!result) return;
          await updateBook(user.uid, bookId, {
            ...book,
            rating: parseRating(result.rating),
            notes:  result.notes.trim(),
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
          const result = await openSheet({
            title:   `Finished — "${book.title}"`,
            fields:  [
              {
                id:          'rating',
                label:       'Rating (1–5, optional)',
                type:        'text',
                placeholder: 'e.g. 4',
                value:       '',
              },
              {
                id:          'notes',
                label:       'What stayed with you? (optional)',
                type:        'textarea',
                placeholder: 'A line or two is plenty…',
                value:       '',
                rows:        3,
              },
            ],
            confirm: 'Save reflection',
            cancel:  'Skip',
          });

          updatedBook.rating = result ? parseRating(result.rating) : null;
          updatedBook.notes  = result ? result.notes.trim() : '';
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

        btn.disabled = true;
        await handleAction(action, bookId);
        btn.disabled = false;
      });

      document.getElementById('loadBookRecommendationsBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('loadBookRecommendationsBtn');
  if (btn) btn.disabled = true;

  await loadAIRecommendations();

  const nextBtn = document.getElementById('loadBookRecommendationsBtn');
  if (nextBtn) nextBtn.disabled = false;
});  

      document.getElementById('addBookBtn')?.addEventListener('click', async () => {
        const result = await openSheet({
          title:  'Add a book',
          fields: [
            {
              id:          'title',
              label:       'Title',
              type:        'text',
              placeholder: 'Book title',
              value:       '',
            },
            {
              id:          'author',
              label:       'Author (optional)',
              type:        'text',
              placeholder: 'Author name',
              value:       '',
            },
          ],
          confirm: 'Add to list',
        });

        if (!result) return;

        const title = result.title.trim();
        if (!title) return;

        try {
          await createBook(user.uid, {
            title,
            author: result.author.trim(),
            status: 'to-read',
          });
          await refreshBooks();
        } catch {
          showToast('Could not add book — try again.', 'error');
        }
      });
    }

  
  },
};