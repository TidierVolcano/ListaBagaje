/* ═══════════════════════════════════════════════
   PackRo — Service Worker
   Strategii:
     • index.html  → Network-First  (mereu versiunea nouă când ești online)
     • Fonturi      → Cache-First    (nu se schimbă niciodată)
     • Altele       → Cache-First    (alte resurse statice)
═══════════════════════════════════════════════ */

const CACHE_NAME    = 'packro-v9';
const RUNTIME_CACHE = 'packro-runtime-v9';

// Resurse pre-cached la instalare
const PRECACHE_URLS = [
  './index.html',
  './manifest.json'
];

// ── Install: pre-cache shell-ul ──────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())  // activează imediat, nu așteptă tab-uri deschise
  );
});

// ── Activate: curăță TOATE cache-urile vechi ─────
self.addEventListener('activate', event => {
  const KNOWN = [CACHE_NAME, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => !KNOWN.includes(k))  // șterge tot ce nu e în lista curentă
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())  // preia controlul imediat pe toate tab-urile
  );
});

// ── Fetch ─────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignoră non-GET și scheme non-http
  if (event.request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // ① Fonturi Google — Cache-First (nu se schimbă niciodată)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(event.request, RUNTIME_CACHE));
    return;
  }

  // ② index.html — Network-First
  //    Mereu încearcă rețeaua → dacă reușește, actualizează cache-ul
  //    Dacă ești offline → servește din cache (funcționează fără net)
  const isNavigation = event.request.mode === 'navigate'
    || url.pathname === '/'
    || url.pathname.endsWith('/index.html');

  if (isNavigation) {
    event.respondWith(networkFirst(event.request, CACHE_NAME));
    return;
  }

  // ③ Tot restul (manifest.json, etc.) — Cache-First
  event.respondWith(cacheFirst(event.request, CACHE_NAME));
});

/* ──────────────────────────────────────────────────
   Strategii reutilizabile
────────────────────────────────────────────────── */

/**
 * Network-First:
 * 1. Încearcă rețeaua
 * 2. Dacă reușește → salvează în cache și returnează răspunsul proaspăt
 * 3. Dacă pică rețeaua → returnează versiunea din cache
 */
async function networkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());  // actualizează cache-ul în fundal
    }
    return networkResponse;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback final: caută index.html în orice cache disponibil
    return caches.match('./index.html');
  }
}

/**
 * Cache-First:
 * 1. Caută în cache
 * 2. Dacă nu e → fetch din rețea și salvează
 * 3. Dacă nici rețeaua nu merge → null (browser va afișa eroare)
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return cached ?? null;
  }
}
