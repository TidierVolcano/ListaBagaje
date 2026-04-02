/* ═══════════════════════════════════════════════
   PackRo — Service Worker
   Strategie: Cache-First cu fallback la rețea.
   Tot conținutul aplicației e cached la instalare.
═══════════════════════════════════════════════ */

const CACHE_NAME = 'packro-v2';

// Resurse de pre-cached la instalare (shell-ul aplicației)
const PRECACHE_URLS = [
  './index.html',
  './manifest.json'
];

// Resurse externe (fonturi Google) — cached la primul acces
const RUNTIME_CACHE = 'packro-runtime-v1';

// ── Install: pre-cache shell-ul ──────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: curăță cache-urile vechi ───────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== RUNTIME_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Cache-First, cu runtime cache pt resurse externe ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignoră requesturi non-GET (POST, etc.)
  if (event.request.method !== 'GET') return;

  // Ignoră requesturi chrome-extension sau alte scheme
  if (!url.protocol.startsWith('http')) return;

  // Strategia pentru fonturi Google — cache la primul acces, apoi offline
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => cached); // dacă rețeaua pică, returnează ce avem
        })
      )
    );
    return;
  }

  // Strategia principală: Cache-First
  // 1. Caută în cache
  // 2. Dacă nu e, fetch din rețea și salvează în cache
  // 3. Dacă nici rețeaua nu merge, servim ce avem în cache (index.html ca fallback)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Salvează în cache doar răspunsuri valide de pe aceeași origine
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return response;
      }).catch(() => {
        // Fallback la index.html pentru navigare
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
