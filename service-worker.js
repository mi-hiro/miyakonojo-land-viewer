const CACHE_NAME = "miyakonojo-land-viewer-v55";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./history.html",
  "./styles.css",
  "./app.js",
  "./history.js",
  "./manifest.json",
  "./route-values.json",
  "./fixed-asset-route-values.json",
  "./collection-history.json",
  "./athome-photo-fill-history.json",
  "./hazard-zones.json",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
  );
});
