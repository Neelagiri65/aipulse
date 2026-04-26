/**
 * AI Pulse service worker. Minimal offline-aware behaviour: app shell
 * cache (HTML/CSS/JS/icons) + network-first with cached fallback for
 * panel API responses, so an installed PWA opened with no network shows
 * the last-seen data instead of a hard fail.
 *
 * Versioned cache keys → bump CACHE_VERSION on shape change to evict
 * stale entries deterministically. The activate handler purges any
 * cache that doesn't match the current version.
 */

const CACHE_VERSION = "v1";
const SHELL_CACHE = `aipulse-shell-${CACHE_VERSION}`;
const API_CACHE = `aipulse-api-${CACHE_VERSION}`;

const SHELL_URLS = [
  "/",
  "/manifest.json",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        // Best-effort cache; one missing asset shouldn't fail install.
        Promise.all(
          SHELL_URLS.map((url) =>
            cache.add(url).catch(() => undefined),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Panel API endpoints: network-first, fall back to cache so an
  // offline open shows stale-but-real data instead of a hard fail.
  if (url.pathname.startsWith("/api/panels/") || url.pathname === "/api/status") {
    event.respondWith(networkFirst(req));
    return;
  }

  // Static shell + icons: cache-first; the cache is bumped on
  // CACHE_VERSION change so a deploy will invalidate stale entries
  // once the new SW activates.
  if (
    url.pathname === "/" ||
    url.pathname.startsWith("/icon") ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/apple-touch-icon.png"
  ) {
    event.respondWith(cacheFirst(req, SHELL_CACHE));
    return;
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    return cached || Response.error();
  }
}

async function networkFirst(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}
