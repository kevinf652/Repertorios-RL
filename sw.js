const CACHE_NAME = 'repertorios-rl-v2.890';
// Caché aparte para los audios (canciones y voces) descargados de R2. Tiene su
// propio nombre para que NUNCA se borre cuando se actualiza la app (ver "activate").
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

// ACTIVATE - Clean old caches (nunca la de audio)
self.addEventListener('activate', function(event) {    
  event.waitUntil(        
    caches.keys().then(function(cacheNames) {            
      return Promise.all(                
        cacheNames.map(function(cacheName) {                    
          if (cacheName !== CACHE_NAME && cacheName !== AUDIO_CACHE_NAME) {                        
            console.log('[SW] Deleting old cache:', cacheName);                        
            return caches.delete(cacheName);                    
          }                
        })      
      );        
    }).then(function() {
      return self.clients.claim(); // Toma el control de las pestañas abiertas inmediatamente
    })
  );
});

// FETCH - Serve files from cache or network.
// Para los audios de R2: "cache first" en su propia caché — la primera vez que se
// reproduce un audio estando en línea, queda guardado para poder escucharlo después
// sin conexión. Para todo lo demás (app shell): igual que antes.
self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);

  if (url.hostname === AUDIO_HOST && event.request.method === 'GET') {
    event.respondWith(
      caches.open(AUDIO_CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) return cached;
          return fetch(event.request).then(function(networkResponse) {
            if (networkResponse && networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(function(err) {
            // Sin conexión y sin copia guardada de este audio en particular
            throw err;
          });
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Retorna el recurso desde el caché si existe, sino lo busca en la red
        return response || fetch(event.request);
      })
  );
});