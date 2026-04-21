/**
 * analytics — thin wrapper around @vercel/analytics that honours
 * Sec-GPC + the user's stored consent before firing any event.
 *
 * The wrapper exists because Vercel Analytics' default behaviour is
 * "fire every event you pass it". Our product contract is the opposite:
 *
 *   - If Sec-GPC:1 is present, the browser has already refused. We
 *     treat that as an immovable no, even if the user somehow clicked
 *     "accept all" afterwards (GPC is a legal signal in CA; overriding
 *     it silently is worse than not tracking).
 *   - If the visitor is in a covered jurisdiction and hasn't granted
 *     analytics, we don't fire. Default-deny.
 *   - If the visitor is in a non-covered jurisdiction, analytics are
 *     on by default (GDPR doesn't apply; the privacy notice explains
 *     we still log page views either way).
 *
 * Keeping `isTrackingAllowed` pure means we can unit test the decision
 * table without a browser. The `track` wrapper reads the cookie +
 * Sec-GPC header (from document.cookie / navigator in the browser; from
 * passed overrides when server-rendering) and delegates the actual
 * dispatch to @vercel/analytics.
 */

import { track as vercelTrack } from "@vercel/analytics";
import type { ConsentCategories } from "@/lib/data/consent";

export type AnalyticsEventName =
  | "panel_open"
  | "subscribe_submit"
  | "share_click";

export type AnalyticsEventProps = Record<
  string,
  string | number | boolean | null
>;

export type TrackingContext = {
  /** Is the visitor in a jurisdiction that requires opt-in? */
  covered: boolean;
  /** Does the browser send Sec-GPC:1? */
  gpc: boolean;
  /** Analytics category state from the aip_consent cookie. Null = user
   *  has never answered (for covered visitors, default-deny). */
  categories: ConsentCategories | null;
};

/**
 * Decide whether a tracking event may fire for this visitor. Pure
 * function — no global reads — so the test suite covers every branch
 * without a browser.
 */
export function isTrackingAllowed(ctx: TrackingContext): boolean {
  if (ctx.gpc) return false;
  if (!ctx.covered) return true;
  if (!ctx.categories) return false;
  return ctx.categories.analytics === true;
}

/**
 * Reason codes for observability / tests. If a call is blocked we never
 * throw — a blocked event is a valid outcome — but surfacing why lets
 * us assert the right branch fired in unit tests.
 */
export type TrackOutcome =
  | { fired: true }
  | { fired: false; reason: "gpc" | "no-consent" | "ssr" };

export type TrackDeps = {
  dispatch?: typeof vercelTrack;
  contextResolver?: () => TrackingContext | null;
};

export function track(
  event: AnalyticsEventName,
  props: AnalyticsEventProps = {},
  deps: TrackDeps = {},
): TrackOutcome {
  const ctx = (deps.contextResolver ?? resolveContextFromDom)();
  if (!ctx) return { fired: false, reason: "ssr" };
  if (ctx.gpc) return { fired: false, reason: "gpc" };
  if (!isTrackingAllowed(ctx)) return { fired: false, reason: "no-consent" };
  (deps.dispatch ?? vercelTrack)(event, props);
  return { fired: true };
}

/**
 * Resolve tracking context from the current document — reads the
 * aip_consent cookie for categories, and the data-sec-gpc attribute we
 * mirror from the server onto <html> (since navigator.globalPrivacyControl
 * is not universally available and Sec-GPC is a request header the
 * client can't see directly). The covered flag is mirrored the same
 * way. Both attributes are set server-side by the /api/consent GET
 * response writing aip_consent and by a small layout bootstrap that
 * reads the `sec-gpc` + `x-vercel-ip-country` headers.
 *
 * Returns null during SSR so the wrapper short-circuits safely.
 */
function resolveContextFromDom(): TrackingContext | null {
  if (typeof document === "undefined") return null;
  const html = document.documentElement;
  const gpcAttr = html.getAttribute("data-sec-gpc");
  const coveredAttr = html.getAttribute("data-jurisdiction-covered");
  const gpc = gpcAttr === "1";
  const covered = coveredAttr === "1";
  const cookie = readCookie(document.cookie, "aip_consent");
  let categories: ConsentCategories | null = null;
  if (cookie) {
    try {
      const parsed = JSON.parse(decodeURIComponent(cookie));
      if (parsed && typeof parsed === "object") {
        categories = {
          necessary: true,
          analytics: Boolean(parsed.analytics),
          marketing: Boolean(parsed.marketing),
        };
      }
    } catch {
      categories = null;
    }
  }
  return { covered, gpc, categories };
}

function readCookie(header: string, name: string): string | null {
  const needle = `${name}=`;
  for (const raw of header.split(";")) {
    const part = raw.trim();
    if (part.startsWith(needle)) return part.slice(needle.length);
  }
  return null;
}
