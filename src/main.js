import './style.css';

import { onAuthChange, signInWithGoogle, ensureUserProfile } from './services/auth.js';
import { renderShell, renderAuthScreen } from './shell.js';
import { registerRoute, setViewContainer, setUser, navigateTo } from './router.js';
import { TodayView } from './views/today.js';
import { WorkoutsView } from './views/workouts.js';
import { ShoppingView } from './views/shopping.js';
import { ProfileView } from './views/profile.js';
import { NicoView } from './views/nico.js';
import { HabitsView } from './views/habits.js';
import { showOnboardingIfNeeded } from './views/onboarding.js';
import { db } from './lib/firebase.js';
import { doc, getDoc } from 'firebase/firestore';
import { BooksView } from './views/books.js';
import { TodayPlansView } from './views/todayPlans.js';

registerRoute('today',    TodayView);
registerRoute('workouts', WorkoutsView);
registerRoute('shopping', ShoppingView);
registerRoute('nico',     NicoView);
registerRoute('profile',  ProfileView);
registerRoute('habits',   HabitsView);
registerRoute('books', BooksView);
registerRoute('today-plans', TodayPlansView);

// ─── PWA: register service worker ────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('SW registration failed:', err));
  });
}

// ─── PWA: capture beforeinstallprompt ────────────────────────────────────────
window.__pwaInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__pwaInstallPrompt = e;
});

// ─── Offline banner ───────────────────────────────────────────────────────────

function showOfflineBanner() {
  if (document.getElementById('offline-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'offline-banner';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.textContent = 'You\'re offline. Changes will save when you reconnect.';
  document.body.prepend(banner);
}

function hideOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  banner.classList.add('offline-banner--hiding');
  setTimeout(() => banner.remove(), 400);
}

window.addEventListener('offline', showOfflineBanner);
window.addEventListener('online', hideOfflineBanner);
if (!navigator.onLine) showOfflineBanner();

// ─── Auth ─────────────────────────────────────────────────────────────────────

onAuthChange(async (user) => {
  if (user) {
    try {
      await ensureUserProfile(user);
      const viewContainer = renderShell(user);
      setViewContainer(viewContainer);
      setUser(user);
      navigateTo('today');

      const snap = await getDoc(doc(db, 'users', user.uid));
      const data = snap.exists() ? snap.data() : {};
      if (!data.onboarded) {
        showOnboardingIfNeeded(user);
      }
    } catch (err) {
      console.error('Error initialising app:', err);
      document.getElementById('app').innerHTML = `
        <main class="error-screen">
          <div class="error-card">
            <h1>Grounded</h1>
            <p>Something went wrong while loading your dashboard.</p>
            <pre>${err.message}</pre>
          </div>
        </main>
      `;
    }
  } else {
    renderAuthScreen();
    document.getElementById('loginBtn').addEventListener('click', async () => {
      const statusEl = document.getElementById('authStatus');
      try {
        statusEl.textContent = 'Signing in…';
        await signInWithGoogle();
      } catch (err) {
        console.error('Login error:', err);
        statusEl.textContent = `Login failed: ${err.message}`;
      }
    });
  }
});
