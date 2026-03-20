// sw.js — Grounded service worker
// Cache version — bump this string whenever you deploy a significant update
const CACHE_NAME = 'grounded-v2';

// The minimal set of assets that form the app shell.
const SHELL_ASSETS = [
  '/',
  '/index.html',
];

// ─── Install: cache the app shell ────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// ─── Activate: clean up old caches ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch: network-first with offline fallback ───────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      })
      .catch(() =>
        caches.match(event.request).then(
          (cached) => cached || caches.match('/index.html')
        )
      )
  );
});

// ─── FCM: handle incoming push messages ──────────────────────────────────────
// Firebase Messaging SDK handles its own push events when the app is in the
// foreground via the main thread. This handler catches background pushes.
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: 'Grounded', body: event.data.text() } };
  }

  const title = payload?.notification?.title || 'Grounded';
  const options = {
    body: payload?.notification?.body || 'Your check-in is ready.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'grounded-reminder',      // replaces previous notification of same type
    renotify: false,
    data: {
      url: payload?.data?.url || '/',
    },
    actions: [
      { action: 'open', title: 'Open Grounded' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── FCM: handle notification tap ────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If the app is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl);
          return;
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ─── FCM: background message handler (Firebase Messaging compat) ─────────────
// This is required by Firebase Messaging when the app is backgrounded.
// Firebase will inject its own listener via importScripts in newer SDKs,
// but we keep this stub so the SW is valid even without that.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
