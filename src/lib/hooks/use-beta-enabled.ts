"use client";

/**
 * useBetaEnabled — client-side hook that decides whether beta-gated
 * features should render for this visitor.
 *
 * Read order mirrors `isBetaEnabled` in src/lib/beta.ts:
 *   1. NEXT_PUBLIC_BETA_ENABLED === "all" → on for everyone
 *   2. `?beta=1` in the current URL      → on (middleware also stamps
 *      the aip_beta cookie, so subsequent visits stay on)
 *   3. aip_beta cookie present            → on
 *   4. Otherwise                           → off
 *
 * Returns `null` during the first render to avoid a flash of beta UI
 * during hydration; callers should treat null as "not yet known".
 */

import { useEffect, useState } from "react";
import { BETA_COOKIE_NAME, hasCookie } from "@/lib/beta";

export function useBetaEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const env = process.env.NEXT_PUBLIC_BETA_ENABLED;
    if (env === "all") {
      setEnabled(true);
      return;
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get("beta") === "1") {
      setEnabled(true);
      return;
    }
    if (typeof document !== "undefined" && hasCookie(document.cookie, BETA_COOKIE_NAME)) {
      setEnabled(true);
      return;
    }
    setEnabled(false);
  }, []);
  return enabled;
}
