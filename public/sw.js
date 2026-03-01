const CACHE_NAME = 'event-mgr-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/vite.svg',
  // Add other static assets here
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Network first, falling back to cache strategy
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone the response to cache it
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          // Don't cache API calls or non-GET requests
          if (event.request.method === 'GET' && !event.request.url.includes('/api/')) {
             cache.put(event.request, responseClone);
          }
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});