// Makes the app installable, and keeps the shell usable when the network
// drops.
//
// Why this file exists: Chrome on Android will not offer "Install app" —
// the thing that puts a real icon in the app drawer and opens the app in a
// window with no URL bar — unless the page registers a service worker with
// a fetch handler. Without one it offers only a bookmark shortcut, which
// opens in a browser tab. That is what this app did before: people were
// "installing" it and getting a website.
//
// The strategy is network-first, on purpose. A weather app that serves
// yesterday's forecast from a cache in order to look fast is worse than one
// that waits a moment. Cache-first would also pin old JS after a deploy
// until the cache happened to be cleared, which is a miserable bug to chase
// on someone else's phone. The cache here is a fallback for when the
// network has actually failed, and nothing more.

const CACHE = 'mausam-v1';

// The shell, not the data. Enough to draw the app with no network. The
// JS modules are left out deliberately: there are twenty-five of them and a
// hand-maintained list would go stale silently, so they are cached as they
// are fetched instead. The forecast itself is never cached — see below.
const SHELL = [
  './',
  './index.html',
  './radar.html',
  './alerts.html',
  './saved.html',
  './css/styles.css',
  './manifest.json',
  './assets/icon-192.png',
];

self.addEventListener('install', (e) => {
  // addAll fails the whole install if any one file 404s, which would leave
  // the app uninstallable for a typo. Each file is added on its own so a
  // missing one costs only that file.
  e.waitUntil(caches.open(CACHE).then((c) =>
    Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  // Drop caches from older versions, then take over the open pages so an
  // update lands on this visit rather than the next one.
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Everything cross-origin is the weather: Open-Meteo's forecast, the
  // geocoder, the topojson for the map. None of it should be served stale,
  // so it goes straight to the network with no involvement from here.
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(request)
      .then((res) => {
        // Opaque and error responses are not worth keeping.
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit
        // A navigation to a page that was never visited still deserves the
        // app rather than the browser's offline dinosaur.
        || (request.mode === 'navigate' ? caches.match('./index.html') : undefined))),
  );
});
