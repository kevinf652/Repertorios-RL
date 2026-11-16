const CACHE_NAME = 'repertorios-rl-v3.2515';
const AUDIO_CACHE_NAME = 'repertorios-audio-v1';
const NETWORK_TIMEOUT_MS = 2000;
const AUDIO_HOST = 'repertorios-r2-api.kevinf652.workers.dev';
const AUDIO_FILE_EXT = /\.(?:mp3|m4a|wav|ogg|oga|aac|webm|flac)$/i;

function isOfflineAudioUrl(url) {
  const isR2Audio = url.hostname === AUDIO_HOST && url.pathname.startsWith('/file/');
  const isLegacySupabaseAudio = url.hostname.endsWith('.supabase.co') &&
    url.pathname.startsWith('/storage/v1/object/public/') && AUDIO_FILE_EXT.test(url.pathname);
  return isR2Audio || isLegacySupabaseAudio;
}

function fullAudioRequest(request) {
  const headers = new Headers(request.headers);
  headers.delete('range');
  headers.delete('if-range');
  headers.delete('if-none-match');
  headers.delete('if-modified-since');
  return new Request(request, { headers });
}

async function audioResponseForRange(response, rangeHeader) {
  if (!rangeHeader || response.status !== 200) return response;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return response;

  const blob = await response.blob();
  const total = blob.size;
  let start;
  let end;
  if (match[1] === '') {
    const suffixLength = Number(match[2]);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return response;
    start = Math.max(0, total - suffixLength);
    end = total - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? total - 1 : Math.min(Number(match[2]), total - 1);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= total || end < start) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': 'bytes */' + total, 'Accept-Ranges': 'bytes' }
    });
  }

  const headers = new Headers(response.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Range', 'bytes ' + start + '-' + end + '/' + total);
  headers.set('Content-Length', String(end - start + 1));
  headers.delete('Content-Encoding');
  headers.delete('Content-MD5');
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers
  });
}

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

function isAppShellRequest(url, request) {
  if (request && request.mode === 'navigate') return true;
  return /\.(?:html?|css|js)$/i.test(url.pathname);
}

function freshNetworkRequest(request) {
  return new Request(request, { cache: 'no-store' });
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(
        urlsToCache.map(url =>
          fetch(new Request(url, { cache: 'reload' }))
            .then(response => {
              if (!response.ok) throw new Error('HTTP ' + response.status);
              return cache.put(url, response);
            })
            .catch(err => {
              console.warn('[SW] No se pudo cachear:', url, err);
            })
        )
      );
    })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

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
      caches.open(AUDIO_CACHE_NAME).then(cache =>
        cache.keys().then(requests =>
          Promise.all(
            requests.map(req => {
              const reqUrl = new URL(req.url);
              if (!isOfflineAudioUrl(reqUrl)) {
                return cache.delete(req);
              }
            })
          )
        )
      )
    ]).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (isOfflineAudioUrl(url) && event.request.method === 'GET') {
    event.respondWith((async () => {
      const cache = await caches.open(AUDIO_CACHE_NAME);
      const cacheKey = fullAudioRequest(event.request);
      const rangeHeader = event.request.headers.get('range');
      const cached = await cache.match(cacheKey);
      if (cached) return audioResponseForRange(cached, rangeHeader);

      const networkRequest = new Request(cacheKey, { cache: 'no-store' });
      const response = await fetch(networkRequest);
      if (response && response.ok && response.status === 200) {
        try {
          await cache.put(cacheKey, response.clone());
        } catch (cacheError) {
          console.warn('[SW] No se pudo guardar el audio offline:', cacheError);
        }
        return audioResponseForRange(response, rangeHeader);
      }
      return response;
    })());
    return;
  }

  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  const isNav = event.request.mode === 'navigate';
  const networkRequest = isAppShellRequest(url, event.request)
    ? freshNetworkRequest(event.request)
    : event.request;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    let cached = await cache.match(event.request, { ignoreSearch: isNav });
    if (!cached && isNav) cached = await cache.match('./index.html', { ignoreSearch: true });

    const networkPromise = fetch(networkRequest).then(res => {
      if (res && res.ok) cache.put(event.request, res.clone());
      return res;
    });

    if (!cached) return networkPromise;

    event.waitUntil(networkPromise.catch(() => {}));
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
    try {
      const res = await Promise.race([networkPromise, timeout]);
      if (res) return res;
    } catch (e) { /* sin red → cae a caché */ }
    return cached;
  })());
});
