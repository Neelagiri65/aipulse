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
 *   - /subscribe and /privacy* routes suppress the overlays so the
 *     page itself owns the subscribe and consent surface and we don't
 *     render two forms or a banner-over-preferences stack.
 */

import { usePathname } from "next/navigation";
import { ConsentBanner } from "@/components/consent/ConsentBanner";
import { SubscribeModal } from "@/components/subscribe/SubscribeModal";
import { useBetaEnabled } from "@/lib/hooks/use-beta-enabled";

export function GlobalOverlays(): React.JSX.Element | null {
  const pathname = usePathname();
  const beta = useBetaEnabled();
  const suppress =
    pathname?.startsWith("/subscribe") || pathname?.startsWith("/privacy");
  if (suppress) return null;
  return (
    <>
      <ConsentBanner />
      {beta ? <SubscribeModal /> : null}
    </>
  );
}
