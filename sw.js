const CACHE_NAME = 'repertorios-rl-v3.243'; // ⬅️ Bump en cada deploy
const AUDIO_CACHE_NAME = 'repertorios-audio-v1';
const AUDIO_HOST = 'repertorios-r2-api.kevinf652.workers.dev';

const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './app.js',
  './styles.css',
  './admin.js',
  './admin.css',
  './social.js',
  './social.css',
  './guest-lock.js',
  './help.css',
  './help.js',
  './notifications.js',
  './notifications.css'
];

// ============================================================
// INSTALL
// - Precachea el app shell.
// - Si un archivo falla, NO rompe todo el install (add individual).
// - NO llama a skipWaiting() aquí: se hace bajo mensaje del cliente.
// ============================================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(
        urlsToCache.map(url =>
          cache.add(url).catch(err => {
            // Un 404 no debe tumbar todo el install
            console.warn('[SW] No se pudo cachear:', url, err);
          })
        )
      );
    })
  );
});

// ============================================================
// MESSAGE - El cliente confirma que quiere activar el SW nuevo
// ============================================================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ============================================================
// ACTIVATE - Limpia cachés viejos (nunca la de audio) + claim()
// ============================================================
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(names =>
        Promise.all(
          names.map(name => {
            if (name !== CACHE_NAME && name !== AUDIO_CACHE_NAME) {
              console.log('[SW] Borrando caché viejo:', name);
              return caches.delete(name);
            }
          })
        )
      ),
      // Limpieza de la caché de audio (bug histórico)
      caches.open(AUDIO_CACHE_NAME).then(cache =>
        cache.keys().then(requests =>
          Promise.all(
            requests.map(req => {
              const reqUrl = new URL(req.url);
              if (!reqUrl.pathname.startsWith('/file/')) {
                return cache.delete(req);
              }
            })
          )
        )
      )
    ]).then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH
// - Audios R2: cache-first en su propia caché.
// - App shell: network-first con fallback a caché.
//   ⬅️ CAMBIO CLAVE: network-first garantiza que si hay red,
//   siempre se sirve lo más nuevo. El caché solo entra offline.
// ============================================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Audios R2 → cache-first (para offline)
  if (
    url.hostname === AUDIO_HOST &&
    url.pathname.startsWith('/file/') &&
    event.request.method === 'GET'
  ) {
    event.respondWith(
      caches.open(AUDIO_CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(res => {
            if (res && res.ok) cache.put(event.request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // Solo GET del mismo origen → network-first con fallback a caché
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(res => {
        // Guarda/actualiza copia en caché
        if (res && res.ok) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        }
        return res;
      })
      .catch(() =>
        // Sin red → tira del caché
        caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Fallback final: index.html para navegaciones
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        })
      )
  );
});