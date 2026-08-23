// Versión dinámica basada en timestamp o hash
const CACHE_NAME = 'repertorios-rl-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 10);
// O mejor: usa un número fijo que incrementas manualmente
// const CACHE_NAME = 'repertorios-rl-v2';

const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// INSTALL
self.addEventListener('install', function(event) {
  console.log('[SW] Installing new version:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('[SW] Cache opened');
        return cache.addAll(urlsToCache);
      })
      .then(function() {
        // Forzar que el nuevo SW tome control inmediatamente
        return self.skipWaiting();
      })
  );
});

// ACTIVATE - Clean old caches
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating new version:', CACHE_NAME);
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
    .then(function() {
      // Tomar control de todas las páginas
      return self.clients.claim();
    })
  );
});

// FETCH - Network first, fallback to cache
self.addEventListener('fetch', function(event) {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip Supabase requests (always go to network)
  if (event.request.url.includes('supabase')) return;

  // Skip the SW file itself (critical!)
  if (event.request.url.includes('sw.js')) return;

  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        // Solo cachear respuestas válidas
        if (response && response.status === 200) {
          var responseClone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(function() {
        return caches.match(event.request);
      })
  );
});

// MESSAGE listener
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});