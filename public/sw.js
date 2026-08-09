const CACHE_NAME = 'pontodigital-cache-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/pwa-icon.png',
  '/pwa-icon-512.png',
  '/manifest.json'
];

// Install a service worker and precache core shell
self.addEventListener('install', event => {
  self.skipWaiting(); // Force active status immediately on update
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Precaching app shell...');
        return cache.addAll(urlsToCache);
      }).catch(err => {
        console.warn('[Service Worker] Precaching warning (expected in development):', err);
      })
  );
});

// Activate the service worker and remove outdated caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Claiming clients...');
      return self.clients.claim();
    })
  );
});

// Fetch handler - Network-First with Cache Fallback
self.addEventListener('fetch', event => {
  // Only handle GET requests and local scope origin requests
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Let authentication, Firestore operations, and API endpoints run normally through the network
  if (url.pathname.startsWith('/api') || url.pathname.includes('firestore') || url.pathname.includes('__')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // If the request succeeds, clone the response and cache it
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // If the network request fails, look in the cache
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If a page navigation fails (offline), fall back to the root shell index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
      })
  );
});
