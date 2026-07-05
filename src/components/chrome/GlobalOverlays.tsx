"use client";

/**
 * GlobalOverlays — single mount point for app-wide floating chrome
 * that should appear on every page: the consent banner (for covered
 * jurisdictions that haven't answered) and the subscribe modal (beta-
 * gated until the digest ships).
 *
 * Both are client-only — they read cookies + fetch /api/consent. Keeping
 * them in one component means the root layout stays a server component
 * and only crosses the client boundary once.
 *
 * Render contract:
 *   - ConsentBanner mounts everywhere. It internally decides whether to
 *     render based on jurisdiction + Sec-GPC + aip_consent cookie.
 *   - SubscribeModal is gated on `useBetaEnabled` here so bundle-level
 *     dead-code analysis keeps the form chunk deferred for non-beta
 *     visitors.
 *   - /subscribe, /newsletter, /privacy*, and /admin* routes suppress
 *     the overlays so the page itself owns the subscribe and consent
 *     surface and we don't render two forms, a banner-over-preferences
 *     stack, or the public subscribe modal floating over an
 *     operator-only ledger.
 *   - /digest/* suppresses ONLY the modal (the tile board has its own
 *     subscribe band); the consent banner still mounts there.
 */

import { usePathname } from "next/navigation";
import { ConsentBanner } from "@/components/consent/ConsentBanner";
import { SubscribeModal } from "@/components/subscribe/SubscribeModal";
import { AnalyticsMount } from "@/components/chrome/AnalyticsMount";
import { useBetaEnabled } from "@/lib/hooks/use-beta-enabled";

export function GlobalOverlays(): React.JSX.Element | null {
  const pathname = usePathname();
  const beta = useBetaEnabled();
  const suppress =
    pathname?.startsWith("/subscribe") ||
    pathname?.startsWith("/newsletter") ||
    pathname?.startsWith("/privacy") ||
    pathname?.startsWith("/admin");
  // /digest/{date} carries its own subscribe band (DigestTileBoard), so
  // the floating modal would be a second form — and it physically
  // overlaps the band's button. Modal-only: the consent banner must
  // still mount there (digest pages are public shared-link landings).
  const suppressModal = suppress || pathname?.startsWith("/digest");
  return (
    <>
      {/* AnalyticsMount is always rendered — it self-gates on consent +
          Sec-GPC so we never dispatch without permission. Keeping it
          above the pathname suppression means /privacy pages are still
          counted (when allowed) so we can see how often the notice is
          read. */}
      <AnalyticsMount />
      {!suppress && <ConsentBanner />}
      {!suppressModal && beta ? <SubscribeModal /> : null}
    </>
  );
}
