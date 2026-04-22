"use client";

/**
 * useBetaEnabled — client-side hook that decides whether the
 * beta-gated subscribe surfaces should render for this visitor.
 *
 * As of Session 34 (digest ships) the default is ON; the gate exists
 * only so `NEXT_PUBLIC_BETA_ENABLED="off"` can kill-switch the
 * subscribe UI fast. Overrides (`?beta=1` or the aip_beta cookie) still
 * force-on, so an operator can test the production surface even while
 * kill-switched.
 *
 * Returns `null` during the first render to avoid a hydration flash;
 * callers should treat null as "not yet known".
 */

import { useEffect, useState } from "react";
import { BETA_COOKIE_NAME, hasCookie } from "@/lib/beta";

export function useBetaEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("beta") === "1") {
      setEnabled(true);
      return;
    }
    if (
      typeof document !== "undefined" &&
      hasCookie(document.cookie, BETA_COOKIE_NAME)
    ) {
      setEnabled(true);
      return;
    }

    const env = process.env.NEXT_PUBLIC_BETA_ENABLED;
    setEnabled(env !== "off");
  }, []);
  return enabled;
}
