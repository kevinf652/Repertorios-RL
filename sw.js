const CACHE_NAME = 'repertorios-rl-v2.889';
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
    }).then(function() {
      return self.clients.claim(); // Toma el control de las pestañas abiertas inmediatamente
    })
  );
});

// FETCH - Serve files from cache or network
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Retorna el recurso desde el caché si existe, sino lo busca en la red
        return response || fetch(event.request);
      })
  );
});