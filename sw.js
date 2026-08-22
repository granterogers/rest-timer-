const CACHE_NAME = "rest-timer-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./assets/button-green.png",
  "./assets/background-blue.png",
  "./assets/silence.wav"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// The app shell (markup/script/style/version marker) must never be served
// from the browser's own HTTP cache, even under a "network-first" fetch()
// call - if the HTTP cache still considers index.html fresh while app.js
// happens to revalidate (or vice versa), the page can load with a JS/HTML
// version mismatch and throw on a since-removed element, silently killing
// event handlers. Images/audio are left cache-friendly since a stale asset
// there can't break functionality the way a stale script can.
const APP_SHELL_PATTERN = /\.(html|js|css|json)$/;

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isAppShell = event.request.mode === "navigate" || APP_SHELL_PATTERN.test(url.pathname);
  const networkRequest = isAppShell
    ? new Request(event.request, { cache: "no-store" })
    : event.request;

  // Network-first: always prefer a fresh copy so new deploys show up
  // immediately, falling back to the cache only when offline.
  event.respondWith(
    fetch(networkRequest)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
