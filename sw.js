/* Gastos — service worker: app shell offline, cache-first con actualización en segundo plano */
const CACHE = "gastos-v2";
const SHELL = ["./", "index.html", "styles.css", "app.js", "config.js", "sync.js", "manifest.json", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-180.png"];

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
  // Network-first con revalidación (cache: no-cache salta el caché HTTP de GitHub Pages);
  // el caché del SW sigue siendo el respaldo offline
  ev.respondWith(
    fetch(new Request(ev.request, { cache: "no-cache" }))
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
