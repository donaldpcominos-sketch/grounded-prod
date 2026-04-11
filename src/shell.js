import { navigateTo } from './router.js';
import { signOutUser } from './services/auth.js';

/**
 * NAV_ITEMS defines the bottom nav.
 * icon: inline SVG path data
 * Add new modules here as they're built.
 */
const NAV_ITEMS = [
  {
    name: 'today',
    label: 'Today',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>`
  },
  {
    name: 'habits',
    label: 'Habits',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/>
      <path d="M8 12l3 3 5-5"/>
    </svg>`
  },
  {
    name: 'workouts',
    label: 'Move',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 4v16M18 4v16M3 8h3M18 8h3M3 16h3M18 16h3"/>
    </svg>`
  },
  {
    name: 'nico',
    label: 'Nico',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2C8 2 5 5 5 8c0 4 3 6 4 9h6c1-3 4-5 4-9 0-3-3-6-7-6z"/>
      <path d="M9 17v1a3 3 0 0 0 6 0v-1"/>
    </svg>`
  },
  {
    name: 'profile',
    label: 'More',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>`
  }
];

export function renderShell(user) {
  const appEl = document.getElementById('app');

  appEl.innerHTML = `
    <div class="app-shell">
      <div id="view-container" class="view-container"></div>
      <nav class="bottom-nav">
        ${NAV_ITEMS.map(item => `
          <button
            class="nav-item"
            data-nav="${item.name}"
            aria-label="${item.label}"
          >
            <span class="nav-icon">${item.icon}</span>
            <span class="nav-dot" aria-hidden="true"></span>
          </button>
        `).join('')}
      </nav>
    </div>
  `;

  // Wire nav clicks
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigateTo(btn.dataset.nav);
    });
  });

  return document.getElementById('view-container');
}

export function renderAuthScreen() {
  const appEl = document.getElementById('app');
  appEl.innerHTML = `
    <main class="auth-screen">
      <div class="auth-inner">
        <section class="auth-card">
          <div class="auth-header">
            <p class="eyebrow">Grounded</p>
            <h1 class="auth-title">A calm space<br>for your day.</h1>
            <p class="auth-subtitle">
              Sign in to begin building your daily wellness rhythm.
            </p>
          </div>
          <button id="loginBtn" class="btn-primary">
            Sign in with Google
          </button>
          <p id="authStatus" class="status-text"></p>
        </section>
      </div>
    </main>
  `;
}
