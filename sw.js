/* Gastos — service worker: app shell offline, cache-first con actualización en segundo plano */
const CACHE = "gastos-v1";
const SHELL = ["./", "index.html", "styles.css", "app.js", "manifest.json", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-180.png"];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (ev) => {
  const url = new URL(ev.request.url);
  // Nunca interceptar llamadas externas (API de Claude, tasas de cambio)
  if (url.origin !== location.origin) return;
  // Network-first: siempre la versión más nueva; el caché es el respaldo offline
  ev.respondWith(
    fetch(ev.request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(ev.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(ev.request))
  );
});
