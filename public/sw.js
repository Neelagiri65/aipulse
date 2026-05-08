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

// Bumped to v2 in the gawk rebrand window so any stale "v1" shell entries
// (cache-first HTML pointing at deployed-then-evicted hashed chunks) get
// purged on activation. After v2, HTML is network-first — see fetch handler.
const CACHE_VERSION = "v2";
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

  // HTML root: network-first with cache fallback. The HTML references
  // hashed JS/CSS chunks under /_next/static; serving cached HTML after
  // a deploy would point at chunk hashes the new deploy no longer hosts,
  // breaking client-side hydration (the visible symptom: a working-looking
  // page where forms / interactive components silently fail). Network-first
  // keeps freshness; the cache is the offline-graceful fallback only.
  if (url.pathname === "/") {
    event.respondWith(networkFirst(req, SHELL_CACHE));
    return;
  }

  // Immutable static assets (icons, manifest): cache-first — these don't
  // version with deploys and never reference hashed chunks. The cache is
  // versioned via CACHE_VERSION so a bump evicts on activation.
  if (
    url.pathname.startsWith("/icon") ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/apple-touch-icon.png"
  ) {
    event.respondWith(cacheFirst(req, SHELL_CACHE));
    return;
  }
});

// Web Push notification handler
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Gawk", body: event.data.text() };
  }
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || "gawk-alert",
    data: { url: payload.url || "/" },
    vibrate: [100, 50, 100],
  };
  event.waitUntil(self.registration.showNotification(payload.title || "Gawk", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "https://gawk.dev";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const match = clients.find((c) => c.url === url);
        if (match) return match.focus();
        return self.clients.openWindow(url);
      }),
  );
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

async function networkFirst(request, cacheName = API_CACHE) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}
