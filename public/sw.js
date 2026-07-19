const CACHE_NAME = 'bee-tracker-v4';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.svg',
  // Calendar guides — needed offline at the apiary
  '/calendar/swiss-hive-drone-frame.webp',
  '/calendar/swiss-hive-exterior.webp',
  '/calendar/swiss-hive-feeding.webp',
  '/calendar/swiss-hive-flight-entrance.webp',
  '/calendar/swiss-hive-harvest.webp',
  '/calendar/swiss-hive-honey-super.webp',
  '/calendar/swiss-hive-rear-frames.webp',
  '/calendar/swiss-hive-treatment.webp',
  '/calendar/swiss-hive-weight-check.webp',
  '/calendar/swiss-hive-winter.webp'
];

async function precacheAssets(cache) {
  // Cache each asset individually so one missing/failed URL does not break install
  await Promise.all(
    ASSETS.map(async (url) => {
      try {
        await cache.add(url);
      } catch (err) {
        console.warn('[Service Worker] Failed to precache', url, err);
      }
    })
  );
}

function isStaticAsset(url) {
  return /\.(?:js|css|png|jpg|jpeg|webp|svg|woff2?|ico|json)$/i.test(url.pathname)
    || url.pathname.startsWith('/calendar/')
    || url.pathname.startsWith('/assets/');
}

function prefersSaveData(request) {
  return request.headers.get('Save-Data') === 'on';
}

// Install Event - cache assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching static assets');
        return precacheAssets(cache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event - clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener('fetch', (e) => {
  // Only cache GET requests
  if (e.request.method !== 'GET') return;

  // Skip non-http(s) and cross-origin API calls
  const url = new URL(e.request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Navigations / HTML -> network-first, so the app shell is always fresh
  // (falls back to cache only when offline).
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((networkResponse) => {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', responseToCache));
          return networkResponse;
        })
        .catch(() => caches.match(e.request).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // Only runtime-cache same-origin responses
  const isSameOrigin = url.origin === self.location.origin;
  const saveData = prefersSaveData(e.request);
  const staticAsset = isSameOrigin && isStaticAsset(url);

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // On Save-Data or static assets: prefer cache, skip background revalidation traffic
        if (saveData || staticAsset) {
          return cachedResponse;
        }
        // Otherwise stale-while-revalidate
        fetch(e.request)
          .then((networkResponse) => {
            if (isSameOrigin && networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
            }
          })
          .catch(() => {/* Ignore network errors offline */});
        return cachedResponse;
      }

      return fetch(e.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        if (isSameOrigin) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }

        return networkResponse;
      }).catch(() => {
        // Fallback for offline if not found in cache
        if (e.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return undefined;
      });
    })
  );
});

// --- Background Sync & Notification capability hooks (for PWA compliance) ---
self.addEventListener('sync', (e) => {
  console.log('[Service Worker] Background Sync event triggered:', e.tag);
});

self.addEventListener('periodicsync', (e) => {
  console.log('[Service Worker] Periodic Background Sync event triggered:', e.tag);
});

self.addEventListener('push', (e) => {
  console.log('[Service Worker] Push Notification received');
  const title = 'Hively Update';
  const options = {
    body: 'Es gibt Neuigkeiten bei deinen Bienenvölkern!',
    icon: '/icon-192.png',
    badge: '/icon-192.png'
  };
  e.waitUntil(self.registration.showNotification(title, options));
});
