import { getTodayJournalEntry, saveTodayJournalEntry, getRecentJournalEntries } from '../services/journal.js';
import { touchLastActive } from '../services/lastSeen.js';
import { getTodayDisplay, truncateText, showToast } from '../utils.js';

let state = {
  screen: 'list',   // 'list' | 'entry'
  selectedEntry: null,
  user: null,
  container: null,
  todayEntry: null,
  recentEntries: []
};

function setState(patch) {
  Object.assign(state, patch);
  render();
}

// ─── Screen: List ─────────────────────────────────────────────────────────────

function renderList() {
  const { todayEntry, recentEntries } = state;
  const hasToday = !!todayEntry.entry?.trim();

  return `
    <main class="view-scroll">
      <div class="view-inner">

        <header class="page-header">
          <p class="eyebrow">Grounded</p>
          <h1 class="page-title">Journal</h1>
          <p class="page-subtitle">${getTodayDisplay()}</p>
        </header>

        <!-- Today's entry -->
        <section class="card card--journal-today">
          <div class="card-row">
            <div>
              <p class="card-label">Today's reflection</p>
              <p class="card-body mt-1">${hasToday ? 'You wrote today.' : 'You haven\'t written yet.'}</p>
            </div>
            <span class="badge">Journal</span>
          </div>

          <div class="prompt-block mt-4">
            <p class="prompt-eyebrow">Today's prompt</p>
            <p class="prompt-text">${todayEntry.prompt}</p>
          </div>

          <textarea
            id="journalEntry"
            rows="5"
            placeholder="Write whatever is on your mind..."
            class="textarea mt-4"
          >${todayEntry.entry || ''}</textarea>

          <div class="btn-row mt-4">
            <button class="btn-primary flex-1" id="saveJournalBtn">Save entry</button>
          </div>
          <p id="journalStatus" class="status-text mt-3"></p>
        </section>

        <!-- History -->
        <section class="card mt-3">
          <p class="card-label">Past entries</p>
          <p class="card-body mt-1">Your recent reflections.</p>

          <div class="journal-history-list mt-4">
            ${recentEntries.length === 0 ? `
              <div class="history-empty history-empty--warm">
                <p class="history-empty-headline">Your reflections will live here.</p>
                <p class="history-empty-sub">Write your first entry above.</p>
              </div>
            ` : recentEntries.map(entry => `
              <button class="journal-history-row" data-entry-date="${entry.date}">
                <div class="journal-history-row-inner">
                  <div>
                    <p class="journal-history-date">${formatDate(entry.date)}</p>
                    <p class="journal-history-preview">${truncateText(entry.entry || 'No entry saved.', 80)}</p>
                  </div>
                  <span class="journal-history-arrow">→</span>
                </div>
              </button>
            `).join('')}
          </div>
        </section>

      </div>
    </main>
  `;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const date = new Date(+y, +m - 1, +d);
  return date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
}

function bindListEvents() {
  const journalStatusEl = document.getElementById('journalStatus');
  const journalEntryEl  = document.getElementById('journalEntry');

  document.getElementById('saveJournalBtn')?.addEventListener('click', async () => {
    try {
      journalStatusEl.textContent = 'Saving…';
      const entry = journalEntryEl.value.trim();
      await saveTodayJournalEntry(state.user.uid, {
        prompt: state.todayEntry.prompt,
        entry
      });
      state.todayEntry = { ...state.todayEntry, entry };
      // Refresh recent entries in the background
      state.recentEntries = await getRecentJournalEntries(state.user.uid);
      journalStatusEl.textContent = '';
      showToast('Journal saved', 'success', 1800);
    } catch {
      journalStatusEl.innerHTML = `Save failed. <button class="retry-inline-btn" id="retryJournalBtn">Retry</button>`;
      document.getElementById('retryJournalBtn')?.addEventListener('click', async () => {
        journalStatusEl.textContent = 'Retrying…';
        try {
          const entry = journalEntryEl.value.trim();
          await saveTodayJournalEntry(state.user.uid, {
            prompt: state.todayEntry.prompt,
            entry
          });
          state.todayEntry = { ...state.todayEntry, entry };
          state.recentEntries = await getRecentJournalEntries(state.user.uid);
          journalStatusEl.textContent = '';
          showToast('Journal saved', 'success', 1800);
        } catch {
          journalStatusEl.textContent = 'Still offline. Entry preserved.';
        }
      });
    }
  });

  document.querySelectorAll('[data-entry-date]').forEach(btn => {
    btn.addEventListener('click', () => {
      const date = btn.dataset.entryDate;
      const entry = state.recentEntries.find(e => e.date === date);
      if (entry) setState({ screen: 'entry', selectedEntry: entry });
    });
  });
}

// ─── Screen: Entry detail ─────────────────────────────────────────────────────

function renderEntry() {
  const { selectedEntry } = state;
  return `
    <main class="view-scroll">
      <div class="view-inner">
        <button class="btn-back" id="backBtn">← Journal</button>

        <div class="entry-detail-date mt-3">
          <p class="page-title">${formatDate(selectedEntry.date)}</p>
        </div>

        ${selectedEntry.prompt ? `
          <div class="prompt-block mt-4">
            <p class="prompt-eyebrow">Prompt</p>
            <p class="prompt-text">${selectedEntry.prompt}</p>
          </div>
        ` : ''}

        <div class="entry-detail-body mt-4">
          ${selectedEntry.entry
            ? selectedEntry.entry.split('\n').filter(Boolean).map(p => `<p class="entry-paragraph">${p}</p>`).join('')
            : '<p class="entry-empty">No entry was saved for this day.</p>'
          }
        </div>
      </div>
    </main>
  `;
}

function bindEntryEvents() {
  document.getElementById('backBtn')?.addEventListener('click', () => setState({ screen: 'list', selectedEntry: null }));
}

// ─── Render dispatcher ────────────────────────────────────────────────────────

function render() {
  if (!state.container) return;
  switch (state.screen) {
    case 'list':
      state.container.innerHTML = renderList();
      bindListEvents();
      break;
    case 'entry':
      state.container.innerHTML = renderEntry();
      bindEntryEvents();
      break;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export const JournalView = {
  async init(container, user) {
    container.innerHTML = '<div class="loading-state"><p>Loading your journal…</p></div>';
    const [todayEntry, recentEntries] = await Promise.all([
      getTodayJournalEntry(user.uid),
      getRecentJournalEntries(user.uid)
    ]);
    // Touch last active — debounced, so safe to call from multiple views
    touchLastActive(user.uid);
    state = { screen: 'list', selectedEntry: null, user, container, todayEntry, recentEntries };
    render();
  }
};
