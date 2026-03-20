// ─── views/shopping.js ───────────────────────────────────────────────────────

import {
  subscribeSoloList, addSoloItem, tickSoloItem, deleteSoloItem, clearTickedSoloItems,
  getSharedListId, createSharedList, joinSharedList, leaveSharedList,
  subscribeSharedList, addSharedItem, tickSharedItem, deleteSharedItem, clearTickedSharedItems
} from '../services/shopping.js';
import { showToast } from '../utils.js';

// ─── Render helpers ───────────────────────────────────────────────────────────

function renderItems(items) {
  if (!items.length) {
    return `<p class="shopping-empty">Nothing on the list yet — add something above.</p>`;
  }

  return items.map(item => `
    <div class="shopping-item${item.ticked ? ' shopping-item--ticked' : ''}" data-id="${item.id}">
      <button class="shopping-tick-btn" data-tick="${item.id}" aria-label="${item.ticked ? 'Untick' : 'Tick'} item" aria-pressed="${item.ticked}">
        <span class="shopping-tick-circle">${item.ticked ? '✓' : ''}</span>
      </button>
      <span class="shopping-item-text">${escapeHtml(item.text)}</span>
      <button class="shopping-delete-btn" data-delete="${item.id}" aria-label="Delete item">✕</button>
    </div>
  `).join('');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSharedSection(sharedListId) {
  if (sharedListId) {
    return `
      <div class="shopping-shared-panel" id="sharedPanel">
        <div class="shopping-shared-header">
          <div>
            <p class="card-label">Shared list</p>
            <p class="shopping-shared-code">Code: <strong>${sharedListId}</strong></p>
          </div>
          <button class="shopping-leave-btn" id="leaveSharedBtn">Leave</button>
        </div>
        <div class="shopping-list" id="sharedList">
          <p class="shopping-empty">Loading…</p>
        </div>
        <div class="shopping-input-row mt-3">
          <input type="text" id="sharedInput" class="shopping-input" placeholder="Add to shared list…" maxlength="80" />
          <button class="shopping-add-btn" id="addSharedBtn" aria-label="Add">+</button>
        </div>
        <button class="shopping-clear-btn mt-3" id="clearSharedBtn">Clear ticked items</button>
      </div>
    `;
  }

  return `
    <div class="shopping-shared-panel shopping-shared-panel--unlinked" id="sharedPanel">
      <p class="card-label">Shared list</p>
      <p class="card-body mt-1">Link with your partner so you both see the same list in real-time.</p>
      <div class="shopping-link-actions mt-4">
        <button class="btn-primary flex-1" id="createSharedBtn">Create shared list</button>
      </div>
      <div class="shopping-join-row mt-3">
        <input type="text" id="joinCodeInput" class="shopping-input" placeholder="Enter partner's code…" maxlength="6" style="text-transform:uppercase;" />
        <button class="shopping-add-btn" id="joinSharedBtn" aria-label="Join">→</button>
      </div>
      <p class="shopping-join-hint mt-2">If your partner already created a list, enter their 6-letter code above.</p>
    </div>
  `;
}

function renderView(sharedListId) {
  return `
    <main class="view-scroll">
      <div class="view-inner">

        <header class="page-header">
          <p class="eyebrow">Grounded</p>
          <div class="header-row">
            <div>
              <h1 class="page-title">Shopping</h1>
              <p class="page-subtitle">Woolworths list</p>
            </div>
          </div>
        </header>

        <!-- Solo list -->
        <div class="card" id="soloSection">
          <div class="card-row">
            <div>
              <p class="card-label">Your list</p>
              <p class="card-body mt-1">Tap to tick off as you go.</p>
            </div>
          </div>

          <div class="shopping-input-row mt-4">
            <input type="text" id="soloInput" class="shopping-input" placeholder="Add an item…" maxlength="80" />
            <button class="shopping-add-btn" id="addSoloBtn" aria-label="Add">+</button>
          </div>

          <div class="shopping-list mt-3" id="soloList">
            <p class="shopping-empty">Loading…</p>
          </div>

          <button class="shopping-clear-btn mt-3" id="clearSoloBtn">Clear ticked items</button>
        </div>

        <!-- Shared list -->
        <div class="card mt-3">
          ${renderSharedSection(sharedListId)}
        </div>

      </div>
    </main>
  `;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export const ShoppingView = {
  async init(container, user) {
    container.innerHTML = `<div class="loading-state"><p>Loading your list…</p></div>`;

    const sharedListId = await getSharedListId(user.uid).catch(() => null);

    container.innerHTML = renderView(sharedListId);

    // Unsubscribe handles — cleaned up if view is torn down
    let unsubSolo   = null;
    let unsubShared = null;

    // ── Solo list ──
    const soloListEl  = document.getElementById('soloList');
    const soloInput   = document.getElementById('soloInput');
    const addSoloBtn  = document.getElementById('addSoloBtn');
    const clearSoloBtn = document.getElementById('clearSoloBtn');

    unsubSolo = subscribeSoloList(user.uid, items => {
      soloListEl.innerHTML = renderItems(items);
      bindItemEvents(soloListEl, user.uid, null);
    });

    async function addSolo() {
      const text = soloInput.value.trim();
      if (!text) return;
      soloInput.value = '';
      try {
        await addSoloItem(user.uid, text);
      } catch {
        showToast('Could not add item — try again', 'error');
      }
    }

    addSoloBtn.addEventListener('click', addSolo);
    soloInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSolo(); } });

    clearSoloBtn.addEventListener('click', async () => {
      try {
        await clearTickedSoloItems(user.uid);
        showToast('Cleared', 'success', 1400);
      } catch {
        showToast('Could not clear — try again', 'error');
      }
    });

    // ── Shared list ──
    function bindSharedPanel(code) {
      if (!code) {
        // Unlinked state — bind create + join
        document.getElementById('createSharedBtn')?.addEventListener('click', async () => {
          try {
            const newCode = await createSharedList(user.uid);
            showToast(`List created! Code: ${newCode}`, 'success', 4000);
            // Re-init view with new code
            ShoppingView.init(container, user);
          } catch {
            showToast('Could not create list — try again', 'error');
          }
        });

        const joinBtn       = document.getElementById('joinSharedBtn');
        const joinCodeInput = document.getElementById('joinCodeInput');

        async function doJoin() {
          const code = joinCodeInput.value.trim().toUpperCase();
          if (code.length < 4) { showToast('Enter a valid code', 'error'); return; }
          try {
            await joinSharedList(user.uid, code);
            showToast('Joined shared list!', 'success', 2000);
            ShoppingView.init(container, user);
          } catch (err) {
            showToast(err.message || 'Could not join — check the code', 'error');
          }
        }

        joinBtn?.addEventListener('click', doJoin);
        joinCodeInput?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doJoin(); } });
        return;
      }

      // Linked state — subscribe and wire inputs
      const sharedListEl  = document.getElementById('sharedList');
      const sharedInput   = document.getElementById('sharedInput');
      const addSharedBtn  = document.getElementById('addSharedBtn');
      const clearSharedBtn = document.getElementById('clearSharedBtn');
      const leaveBtn      = document.getElementById('leaveSharedBtn');

      unsubShared = subscribeSharedList(code, items => {
        sharedListEl.innerHTML = renderItems(items);
        bindItemEvents(sharedListEl, null, code);
      });

      async function addShared() {
        const text = sharedInput.value.trim();
        if (!text) return;
        sharedInput.value = '';
        try {
          await addSharedItem(code, text);
        } catch {
          showToast('Could not add item — try again', 'error');
        }
      }

      addSharedBtn.addEventListener('click', addShared);
      sharedInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addShared(); } });

      clearSharedBtn.addEventListener('click', async () => {
        try {
          await clearTickedSharedItems(code);
          showToast('Cleared', 'success', 1400);
        } catch {
          showToast('Could not clear — try again', 'error');
        }
      });

      leaveBtn.addEventListener('click', async () => {
        if (!confirm('Leave the shared list? Your partner\'s list will stay intact.')) return;
        try {
          if (unsubShared) { unsubShared(); unsubShared = null; }
          await leaveSharedList(user.uid);
          showToast('Left shared list', 'info', 2000);
          ShoppingView.init(container, user);
        } catch {
          showToast('Could not leave — try again', 'error');
        }
      });
    }

    bindSharedPanel(sharedListId);

    // ── Item interaction (tick / delete) ──
    function bindItemEvents(listEl, userId, sharedCode) {
      listEl.querySelectorAll('[data-tick]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id     = btn.dataset.tick;
          const ticked = btn.getAttribute('aria-pressed') !== 'true';
          try {
            if (sharedCode) {
              await tickSharedItem(sharedCode, id, ticked);
            } else {
              await tickSoloItem(userId, id, ticked);
            }
          } catch {
            showToast('Could not update — try again', 'error');
          }
        });
      });

      listEl.querySelectorAll('[data-delete]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.delete;
          try {
            if (sharedCode) {
              await deleteSharedItem(sharedCode, id);
            } else {
              await deleteSoloItem(userId, id);
            }
          } catch {
            showToast('Could not delete — try again', 'error');
          }
        });
      });
    }
  }
};
