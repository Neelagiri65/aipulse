/**
 * Layer A trust test — NEWS (Hacker News) deriver.
 *
 * Output-invariant, per prd-trust-harness §1: exercise the REAL deriver and
 * assert its OUTPUT satisfies the invariants — not merely that it "runs".
 * The incident this guards is the S88 class (a stale item served as live)
 * and the #53 class (a broken/mis-hosted source link). deriveNewsCards
 * enforces a 6h window; this pins that the window IS the freshness
 * guarantee, so a regression that drops the filter fails HERE.
 */

import { describe, expect, it } from "vitest";

import { deriveNewsCards } from "@/lib/feed/derivers/news";
import type { HnWireItem, HnWireResult } from "@/lib/data/wire-hn";
import { FEED_TRIGGERS } from "@/lib/feed/thresholds";
import { auditItem, checkFresh, checkResolvableSource } from "@/lib/trust/invariants";

const NOW = Date.parse("2026-04-27T12:00:00.000Z");
const WINDOW_MS = FEED_TRIGGERS.NEWS_HN_WINDOW_HOURS * 60 * 60 * 1000;

function item(
  partial: Partial<HnWireItem> & Pick<HnWireItem, "id" | "points" | "createdAtI">,
): HnWireItem {
  return {
    id: partial.id,
    title: partial.title ?? "Show HN: a thing",
    url: partial.url ?? null,
    author: partial.author ?? "user",
    points: partial.points,
    numComments: partial.numComments ?? 0,
    createdAtI: partial.createdAtI,
    createdAt: partial.createdAt ?? new Date(partial.createdAtI * 1000).toISOString(),
    firstSeenTs: partial.firstSeenTs ?? new Date(NOW).toISOString(),
    lastRefreshTs: partial.lastRefreshTs ?? new Date(NOW).toISOString(),
    kind: "hn",
    lat: partial.lat ?? null,
    lng: partial.lng ?? null,
    locationLabel: partial.locationLabel ?? null,
  };
}

const baseResult: HnWireResult = {
  ok: true,
  items: [],
  points: [],
  polledAt: new Date(NOW).toISOString(),
  coverage: { itemsTotal: 0, itemsWithLocation: 0, geocodeResolutionPct: 0 },
  meta: { lastFetchOkTs: null, staleMinutes: null },
  source: "redis",
};

describe("NEWS (HN) — Layer A trust invariants", () => {
  it("a fresh, popular story yields a trustworthy card (fresh + attributed)", () => {
    const cards = deriveNewsCards(
      { ...baseResult, items: [item({ id: "1", points: 240, createdAtI: NOW / 1000 - 60 * 60 })] },
      NOW,
    );
    expect(cards).toHaveLength(1);
    const violations = auditItem([
      checkFresh(cards[0].timestamp, NOW, WINDOW_MS),
      checkResolvableSource(cards[0].sourceUrl),
    ]);
    expect(violations).toEqual([]);
  });

  it("INCIDENT (S88): a stale story mixed with a fresh one — only the fresh ships, and it passes freshness", () => {
    const cards = deriveNewsCards(
      {
        ...baseResult,
        items: [
          item({ id: "fresh", points: 200, createdAtI: NOW / 1000 - 60 * 60 }), // 1h
          item({ id: "stale", points: 900, createdAtI: NOW / 1000 - 7 * 60 * 60 }), // 7h > 6h window
        ],
      },
      NOW,
    );
    // The stale story is dropped by the deriver — never served as live.
    expect(cards.map((c) => c.meta?.hnId)).toEqual(["fresh"]);
    // And EVERY emitted card independently passes the freshness invariant.
    for (const c of cards) {
      expect(checkFresh(c.timestamp, NOW, WINDOW_MS)).toBeNull();
    }
  });

  it("attribution points at the HN comments page (not a mis-host / nested link)", () => {
    const cards = deriveNewsCards(
      { ...baseResult, items: [item({ id: "42", points: 150, createdAtI: NOW / 1000 - 30 * 60 })] },
      NOW,
    );
    expect(cards[0].sourceUrl).toBe("https://news.ycombinator.com/item?id=42");
    expect(checkResolvableSource(cards[0].sourceUrl)).toBeNull();
  });
});
