import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { BentoBoard } from "@/components/board/BentoBoard";
import type { Card, FeedResponse } from "@/lib/feed/types";

const baseCurrentState: FeedResponse["currentState"] = {
  topModel: { name: "—", sourceUrl: "" },
  toolHealth: { operational: 3, degraded: 0, total: 3 },
  latestPaper: { title: "—", sourceUrl: "" },
};

function feed(overrides: Partial<FeedResponse> = {}): FeedResponse {
  return {
    cards: [],
    quietDay: false,
    currentState: baseCurrentState,
    lastComputed: "2026-06-30T00:00:00.000Z",
    ...overrides,
  };
}

const launchCard: Card = {
  id: "launch-1",
  type: "PRODUCT_LAUNCH",
  severity: 50,
  headline: "Some AI tool launched",
  sourceName: "Product Hunt",
  sourceUrl: "https://www.producthunt.com",
  timestamp: "2026-06-30T00:00:00.000Z",
  meta: {},
};

describe("BentoBoard — degraded ≠ quiet", () => {
  it("labels a degraded Models tile 'source degraded', NOT 'quiet'", () => {
    const html = renderToStaticMarkup(
      <BentoBoard
        feed={feed({
          degradedSources: [
            {
              source: "OpenRouter",
              reason:
                "ranking source degraded — showing catalogue order; rank movements unavailable",
            },
          ],
        })}
      />,
    );
    expect(html).toContain("source degraded");
    expect(html).toContain("rank movements unavailable");
    // The Models tile must NOT have collapsed to the quiet copy.
    expect(html).toContain("Models");
  });

  it("a genuinely empty healthy domain still reads 'quiet'", () => {
    // No degradedSources → empty Releases/Models tiles fall through to quiet.
    const html = renderToStaticMarkup(<BentoBoard feed={feed()} />);
    expect(html).toContain("quiet — no activity in window");
    expect(html).not.toContain("source degraded");
  });

  it("renders cards for a busy domain", () => {
    const html = renderToStaticMarkup(
      <BentoBoard feed={feed({ cards: [launchCard] })} />,
    );
    expect(html).toContain("Some AI tool launched");
  });
});

describe("BentoBoard — quarantined (containment actuation)", () => {
  it("renders a quarantined Models tile with reasons + last-known anchor, wins over degraded", () => {
    const html = renderToStaticMarkup(
      <BentoBoard
        feed={feed({
          containedSources: [
            {
              source: "OpenRouter",
              reasons: ["sanity: 400 above max 150"],
              lastKnownAt: "2026-07-04T09:00:00.000Z",
            },
          ],
          degradedSources: [
            { source: "OpenRouter", reason: "should be shadowed by quarantine" },
          ],
        })}
      />,
    );
    expect(html).toContain("source quarantined");
    expect(html).toContain("sanity: 400 above max 150");
    expect(html).toContain("last known value");
    expect(html).not.toContain("should be shadowed by quarantine");
  });

  it("renders the honest empty when no trustworthy value was ever observed", () => {
    const html = renderToStaticMarkup(
      <BentoBoard
        feed={feed({
          containedSources: [
            {
              source: "SDK registries",
              reasons: ["freshness: undated output"],
              lastKnownAt: null,
            },
          ],
        })}
      />,
    );
    expect(html).toContain("no trustworthy value available");
  });

  it("shows the ADDITIVE monitoring-impaired badge without hiding data", () => {
    const html = renderToStaticMarkup(
      <BentoBoard feed={feed({ cards: [launchCard], monitoringImpaired: true })} />,
    );
    expect(html).toContain("monitoring impaired");
    expect(html).toContain("Some AI tool launched");
  });

  it("a healthy feed shows neither quarantine nor monitoring badges", () => {
    const html = renderToStaticMarkup(<BentoBoard feed={feed({ cards: [launchCard] })} />);
    expect(html).not.toContain("source quarantined");
    expect(html).not.toContain("monitoring impaired");
  });
});

/**
 * A stale badge that shows a time and no date reads as "this morning".
 *
 * The badge appears precisely when a live fetch FAILED and the board is
 * serving last-known data. It rendered `◐ as of 06:22 UTC` — no date — so
 * week-old fallback data was indistinguishable from data fetched minutes ago.
 * The badge is the one element whose entire job is to say the number is old,
 * and it was the element making it look fresh.
 *
 * Nothing failed when this was fixed: 2650 tests passed before and after,
 * because no test looked at what the badge said. Hence this file.
 *
 * The format is `stampUtc`, the house format — deliberately NOT an adaptive
 * "show the date only when it is not today". Adaptive output depends on `now`,
 * which differs between the server render and the client render and would
 * reintroduce a hydration mismatch that a static-markup suite cannot see.
 */
describe("the board's staleness stamps carry their date", () => {
  const WEEK_OLD = "2026-06-23T06:22:00.000Z";

  it("names the date on the stale badge, not just the time", () => {
    const html = renderToStaticMarkup(
      <BentoBoard
        feed={feed({
          cards: [launchCard],
          staleSources: [{ source: "Product Hunt", staleAsOf: WEEK_OLD }],
        })}
      />,
    );
    expect(html).toContain("23/06/2026 06:22 UTC");
    // The bare time alone must not be what the reader sees.
    expect(html).not.toMatch(/as of\s*06:22 UTC/);
  });

  it("stamps the board's own compute time with a date", () => {
    const html = renderToStaticMarkup(
      <BentoBoard feed={feed({ cards: [launchCard], lastComputed: WEEK_OLD })} />,
    );
    expect(html).toContain("23/06/2026 06:22 UTC");
  });
});
