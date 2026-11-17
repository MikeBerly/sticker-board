// Offline support: serve the app from the cache, and refresh the cache in the background.
// After changing any app file, bump CACHE so devices pick up the new version on next launch.
const CACHE = 'sticker-board-v5';
const FILES = [
  './', './index.html', './styles.css', './app.js', './model.js', './store.js', './emoji.js', './ideas.js', './firebase-config.js', './firebase-store.js',
  './manifest.webmanifest', './icon.svg', './icon-180.png', './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Cache our own files and the Firebase library (so the synced app can open offline).
  const cacheable = url.origin === location.origin || url.href.startsWith('https://www.gstatic.com/firebasejs/');
  if (e.request.method !== 'GET' || !cacheable) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const fresh = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
