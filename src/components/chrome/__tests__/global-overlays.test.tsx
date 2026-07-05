/**
 * GlobalOverlays suppression matrix. The render contract (see component
 * doc) has two tiers: full suppression (page owns subscribe + consent)
 * and modal-only suppression (/digest/* — the tile board carries its own
 * subscribe band, but the consent banner must still mount on a public
 * shared-link landing).
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/lib/hooks/use-beta-enabled", () => ({ useBetaEnabled: () => true }));
vi.mock("@/components/consent/ConsentBanner", () => ({
  ConsentBanner: () => <div data-testid="consent-banner" />,
}));
vi.mock("@/components/subscribe/SubscribeModal", () => ({
  SubscribeModal: () => <div data-testid="subscribe-modal" />,
}));
vi.mock("@/components/chrome/AnalyticsMount", () => ({
  AnalyticsMount: () => <div data-testid="analytics-mount" />,
}));

import { GlobalOverlays } from "@/components/chrome/GlobalOverlays";

function renderAt(path: string): string {
  pathname = path;
  return renderToStaticMarkup(<GlobalOverlays />);
}

describe("GlobalOverlays suppression matrix", () => {
  it("dashboard (/) mounts banner + modal", () => {
    const html = renderAt("/");
    expect(html).toContain("consent-banner");
    expect(html).toContain("subscribe-modal");
  });

  it("/digest/{date} suppresses ONLY the modal — the board has its own band; banner stays", () => {
    const html = renderAt("/digest/2026-07-05");
    expect(html).toContain("consent-banner");
    expect(html).not.toContain("subscribe-modal");
  });

  it.each(["/subscribe", "/newsletter", "/privacy", "/admin"])(
    "%s suppresses banner and modal (page owns the surface)",
    (path) => {
      const html = renderAt(path);
      expect(html).not.toContain("consent-banner");
      expect(html).not.toContain("subscribe-modal");
    },
  );

  it("analytics mounts everywhere, including suppressed routes", () => {
    expect(renderAt("/admin")).toContain("analytics-mount");
    expect(renderAt("/digest/2026-07-05")).toContain("analytics-mount");
  });
});
