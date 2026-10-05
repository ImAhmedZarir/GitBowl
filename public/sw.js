// public/sw.js
// GitBowl Service Worker for Offline Repository Browsing (Section 5.4)
const CACHE_NAME = "gitbowl-cache-v1";
const STATIC_ASSETS = ["/", "/explore", "/search", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and Supabase auth mutation endpoints
  if (event.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/auth/") || url.pathname.startsWith("/api/public/git/")) {
    return;
  }

  // Network-first with cache fallback for repository data and web routes
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache successful response for offline reading
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // Offline fallback: serve from cache if available
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // Return offline fallback page if navigation request
        if (event.request.mode === "navigate") {
          return caches.match("/");
        }

        return new Response("Offline: Content cached when online", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        });
      }),
  );
});
