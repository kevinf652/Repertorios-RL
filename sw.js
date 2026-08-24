const CACHE_NAME = 'repertorios-rl-v2.441';
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
