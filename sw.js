// Offline support. With internet, the app always loads its newest files (so updates show up on the
// next launch); the saved copy is used only when offline or when the network is very slow.
// Bump CACHE when the list of FILES changes.
const CACHE = 'sticker-board-v13';
const FILES = [
  './', './index.html', './styles.css', './app.js', './model.js', './store.js', './emoji.js', './ideas.js', './jars.js', './fun.js', './firebase-config.js', './firebase-store.js',
  './manifest.webmanifest', './icon.svg', './icon-180.png', './icon-512.png',
];
const NETWORK_WAIT_MS = 4000; // after this, fall back to the saved copy

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // The Firebase library's address includes its version, so the saved copy never goes stale.
  if (url.href.startsWith('https://www.gstatic.com/firebasejs/')) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        const res = await fetch(e.request);
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      })
    );
    return;
  }
  if (url.origin !== location.origin) return;
  // Our own files: newest from the network, saved copy as the fallback.
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const network = fetch(e.request, { cache: 'no-cache' }).then((res) => {
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      });
      const slow = new Promise((resolve) => setTimeout(resolve, NETWORK_WAIT_MS));
      try {
        const first = await Promise.race([network, slow]);
        if (first) return first;
      } catch {
        // offline: use the saved copy below
      }
      const cached = await cache.match(e.request, { ignoreSearch: true });
      return cached || network;
    })
  );
});
