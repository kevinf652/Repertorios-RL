const CACHE_NAME = 'repertorios-rl-v2.42';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './app.js',
  './styles.css',
  './admin.js',
  './admin.css'
];

// INSTALL - Cache app shell
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('[SW] Cache opened');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// ACTIVATE - Clean old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// FETCH - Network first, fallback to cache (ensures auto-update)
self.addEventListener('fetch', function(event) {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip Supabase requests (always go to network)
  if (event.request.url.includes('supabase')) return;

  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        // Clone the response before caching
        var responseClone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(function() {
        // Network failed, try cache
        return caches.match(event.request);
      })
  );
});

// LISTEN for skip waiting message (for auto-update)
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
