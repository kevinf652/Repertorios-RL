const CACHE_NAME = 'repertorios-rl-v3.250'; // ⬅️ Bump en cada deploy
const AUDIO_CACHE_NAME = 'repertorios-audio-v1';
const AUDIO_HOST = 'repertorios-r2-api.kevinf652.workers.dev';
const AUDIO_FILE_EXT = /\.(?:mp3|m4a|wav|ogg|oga|aac|webm|flac)$/i;

function isOfflineAudioUrl(url) {
  const isR2Audio = url.hostname === AUDIO_HOST && url.pathname.startsWith('/file/');
  const isLegacySupabaseAudio = url.hostname.endsWith('.supabase.co') &&
    url.pathname.startsWith('/storage/v1/object/public/') && AUDIO_FILE_EXT.test(url.pathname);
  return isR2Audio || isLegacySupabaseAudio;
}

// Cachea siempre la representación completa, nunca la solicitud Range parcial.
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
  // Si el reproductor pide varios rangos o un formato no estándar, el 200
  // completo sigue siendo una respuesta HTTP válida y conserva toda la copia.
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

// Los archivos propios de la app no deben reutilizar la caché HTTP del
// navegador durante una actualización. La Cache Storage del SW sigue siendo
// el respaldo offline; aquí solo se fuerza que la copia de red sea realmente
// nueva.
function isAppShellRequest(url, request) {
  if (request && request.mode === 'navigate') return true;
  return /\.(?:html?|css|js)$/i.test(url.pathname);
}

function freshNetworkRequest(request) {
  return new Request(request, { cache: 'no-store' });
}

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
          fetch(new Request(url, { cache: 'reload' }))
            .then(response => {
              if (!response.ok) throw new Error('HTTP ' + response.status);
              return cache.put(url, response);
            })
            .catch(err => {
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

// ============================================================
// FETCH
// - Audios R2: cache-first en su propia caché.
// - App shell: network-first con fallback a caché.
//   ⬅️ CAMBIO CLAVE: network-first garantiza que si hay red,
//   siempre se sirve lo más nuevo. El caché solo entra offline.
// ============================================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Audios → cache-first con copia completa.
  // En la primera reproducción se ignora Range, descarga el archivo entero,
  // espera a que quede guardado y luego responde con el segmento solicitado.
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
          // Await: al empezar a reproducirse, la copia completa ya está lista.
          await cache.put(cacheKey, response.clone());
        } catch (cacheError) {
          // No bloquear la reproducción por cuota/almacenamiento; sí registrar
          // que en este dispositivo no se pudo garantizar el uso offline.
          console.warn('[SW] No se pudo guardar el audio offline:', cacheError);
        }
        return audioResponseForRange(response, rangeHeader);
      }
      // Si el servidor no acepta una descarga completa, se devuelve su respuesta
      // para no ocultar errores HTTP ni guardar un 206 como si fuera el archivo.
      return response;
    })());
    return;
  }

  // Solo GET del mismo origen → network-first con fallback a caché
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  const networkRequest = isAppShellRequest(url, event.request)
    ? freshNetworkRequest(event.request)
    : event.request;

  event.respondWith(
    fetch(networkRequest)
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