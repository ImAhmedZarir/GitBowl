// public/sw.js
// GitBowl Service Worker - Cache versioned static assets safely without caching private API data
const CACHE_NAME = "gitbowl-cache-v2";
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

// Clear cache upon logout or explicit cache clear event
self.addEventListener("message", (event) => {
  if (event.data && (event.data.action === "LOGOUT" || event.data.action === "CLEAR_CACHE")) {
    caches.delete(CACHE_NAME).catch(() => {});
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Strictly skip non-GET requests
  if (event.request.method !== "GET") return;

  // NEVER cache API endpoints, raw files, or authenticated requests
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/raw/") ||
    url.pathname.startsWith("/pages/") ||
    event.request.headers.has("authorization")
  ) {
    return;
  }

  // Network-first with cache fallback for public static pages and assets
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Only cache public 200 OK responses that do not set sensitive cookies
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          !networkResponse.headers.get("set-cookie") &&
          !url.pathname.startsWith("/settings")
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // Offline fallback
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        if (event.request.mode === "navigate") {
          return caches.match("/") || new Response("Offline", { status: 503 });
        }

        return new Response("Offline: Content cached when online", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        });
      }),
  );
});
