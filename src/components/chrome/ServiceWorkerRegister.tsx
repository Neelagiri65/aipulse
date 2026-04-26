"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js once on mount. Skipped on localhost dev (Next.js
 * HMR + a stale SW cache don't mix), in unsupported browsers, and
 * when navigator.serviceWorker is missing. Failures are swallowed —
 * the SW is offline-niceness, not a critical path.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // In dev (next dev) HMR conflicts with a cached app shell; skip
    // registration on localhost/127.0.0.1 to avoid stale-asset surprises.
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return;

    navigator.serviceWorker
      .register("/sw.js")
      .catch(() => {
        // Swallow — the SW is best-effort. A failed registration just
        // means no offline cache; the app still works online.
      });
  }, []);

  return null;
}
