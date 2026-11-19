/* Prepdle service worker (§6.9): app-shell + immutable asset caching; never caches evaluate/results. */
const VERSION = 'v1';
const SHELL = `prepdle-shell-${VERSION}`;
const ASSETS = `prepdle-assets-${VERSION}`;
const PUZZLES = `prepdle-puzzles-${VERSION}`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/icons/icon.svg', '/manifest.webmanifest']).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => ![SHELL, ASSETS, PUZZLES].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Immutable, content-hashed assets: cache-first.
  if (url.pathname.startsWith('/dict/') || url.pathname.startsWith('/vocab/') || url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.open(ASSETS).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Puzzle JSON: network-first, fall back to cache (in-progress games can load offline).
  if (url.pathname.startsWith('/api/v1/puzzles/') && !url.pathname.endsWith('/evaluate')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(PUZZLES).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req)),
    );
    return;
  }

  // Navigations: network-first with cached shell fallback.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/'))),
    );
  }
});
