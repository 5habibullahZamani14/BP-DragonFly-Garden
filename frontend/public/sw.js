const CACHE_NAME = "dragonfly-garden-pwa-v3";
const URLS_TO_CACHE = ["/", "/favicon.ico", "/manifest.webmanifest"];

const isNetworkOnlyRequest = (request) =>
  request.method !== "GET" ||
  request.destination === "" ||
  new URL(request.url).origin !== self.location.origin;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (!response.ok) return response;
          return caches.open(CACHE_NAME)
            .then((cache) => cache.put(event.request, response.clone()))
            .then(() => response, () => response);
        })
        .catch(() => caches.match(event.request).then((cachedResponse) =>
          cachedResponse || caches.match("/")
        ))
    );
    return;
  }

  if (isNetworkOnlyRequest(event.request)) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response.ok) return response;
        return caches.open(CACHE_NAME)
          .then((cache) => cache.put(event.request, response.clone()))
          .then(() => response, () => response);
      })
      .catch(async () => (await caches.match(event.request)) || Response.error())
  );
});
