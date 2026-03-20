// src/utils.js

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayDisplay() {
  return new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

export function getDaySeed() {
  const today = new Date();
  return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
}

export function pickByDaySeed(arr) {
  return arr[getDaySeed() % arr.length];
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

export function truncateText(text, maxLength = 100) {
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) + '…' : text;
}

// ─── Inline status helper (legacy — kept for backward compat) ─────────────────
// Shows a message in an element, then clears it after a delay.

export function showStatus(el, message, duration = 2000) {
  if (!el) return;
  el.textContent = message;
  setTimeout(() => { el.textContent = ''; }, duration);
}

// ─── Toast notification ───────────────────────────────────────────────────────
// showToast(message, type, duration)
//   type: 'success' | 'error' | 'info'
//   duration: ms before auto-dismiss (0 = no auto-dismiss)

export function showToast(message, type = 'info', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast--visible'));

  function dismiss() {
    toast.classList.remove('toast--visible');
    toast.classList.add('toast--exit');
    setTimeout(() => toast.remove(), 300);
  }

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }

  toast.addEventListener('click', dismiss);

  return dismiss;
}
