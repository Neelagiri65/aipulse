"use client";

/**
 * AnalyticsMount — single client component that wires Vercel Analytics
 * while honouring Sec-GPC + consent.
 *
 * Render path:
 *   1. On mount, GET /api/consent to learn {gpc, covered, categories}.
 *   2. Mirror gpc + covered onto <html data-sec-gpc="1" / data-jurisdiction-covered="1">
 *      so the `track()` wrapper (which reads the DOM, not state) can
 *      make its own decisions without re-fetching.
 *   3. Only mount <Analytics/> when the decision function says tracking
 *      is allowed. When it's not, we render nothing so the @vercel/analytics
 *      network call never happens at all — we don't just drop events
 *      client-side; we don't even load the beacon.
 *
 * Re-evaluation: when the consent banner lands a new answer, the
 * aip_consent cookie changes. We poll the cookie lightly (500ms) and
 * re-evaluate. If analytics just became allowed, we mount <Analytics/>.
 * If it just became revoked, we unmount (the SDK has no runtime "off"
 * switch, so we rely on unmount to stop further dispatches).
 */

import { Analytics } from "@vercel/analytics/next";
import { useEffect, useState } from "react";
import { isTrackingAllowed } from "@/lib/analytics";
import { readConsentCookie } from "@/lib/consent-cookies";
import type { ConsentCategories } from "@/lib/data/consent";

type ConsentGetResponse = {
  ok: boolean;
  gpc: boolean;
  covered: boolean;
  categories: ConsentCategories;
};

export function AnalyticsMount(): React.JSX.Element | null {
  const [state, setState] = useState<ConsentGetResponse | null>(null);
  const [categories, setCategories] = useState<ConsentCategories | null>(null);

  // Fetch once; the server endpoint mints the visitor id + returns
  // covered/gpc so we never need to duplicate the jurisdiction table
  // client-side.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/consent", {
          method: "GET",
          credentials: "include",
        });
        if (!r.ok) return;
        const body = (await r.json()) as ConsentGetResponse;
        if (cancelled) return;
        setState(body);
      } catch {
        /* fail-soft: no analytics if we can't fetch consent state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirror signals onto <html> so track() can read them without plumbing.
  useEffect(() => {
    if (!state || typeof document === "undefined") return;
    const html = document.documentElement;
    html.setAttribute("data-sec-gpc", state.gpc ? "1" : "0");
    html.setAttribute(
      "data-jurisdiction-covered",
      state.covered ? "1" : "0",
    );
  }, [state]);

  // Keep an effective view of the categories that reflects the current
  // aip_consent cookie (the banner may answer mid-session and update it
  // behind the fetch). Initialise from server response; poll cookie.
  useEffect(() => {
    if (!state) return;
    setCategories(state.categories);
  }, [state]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const t = setInterval(() => {
      const cookieCats = readConsentCookie(document.cookie);
      if (!cookieCats) return;
      setCategories((prev) => {
        if (
          prev &&
          prev.analytics === cookieCats.analytics &&
          prev.marketing === cookieCats.marketing
        ) {
          return prev;
        }
        return cookieCats;
      });
    }, 500);
    return () => clearInterval(t);
  }, []);

  if (!state) return null;
  const allowed = isTrackingAllowed({
    covered: state.covered,
    gpc: state.gpc,
    categories,
  });
  if (!allowed) return null;
  return <Analytics />;
}
