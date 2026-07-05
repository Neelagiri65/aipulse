/**
 * Layer A trust test — PRODUCT_LAUNCH (Product Hunt) deriver.
 *
 * Output-invariant (prd-trust-harness §1). PH is a RANKING feed, not a
 * recency feed: its top-AI list legitimately includes products several days
 * old (observed span ~6 days on prod), so there is deliberately NO freshness
 * window — the card shows the post's real `createdAt`, honestly. The incident
 * this guards is the `generatedAt` FABRICATION: a post with a missing/
 * unparseable `createdAt` must NOT be stamped with "now" (which renders a
 * dateless product as "just launched" — the S88 class). It is dropped instead.
 */

import { describe, expect, it } from "vitest";

import { deriveProductLaunchCards } from "@/lib/feed/derivers/product-launch";
import type { ProductHuntPost, ProductHuntResult } from "@/lib/data/fetch-producthunt";
import { auditItem, checkResolvableSource } from "@/lib/trust/invariants";

const NOW = Date.parse("2026-04-30T12:00:00.000Z");

function post(overrides: Partial<ProductHuntPost> & Pick<ProductHuntPost, "id">): ProductHuntPost {
  return {
    id: overrides.id,
    name: overrides.name ?? "Some AI Tool",
    tagline: overrides.tagline ?? "Does a thing with AI",
    url: overrides.url ?? `https://www.producthunt.com/products/${overrides.id}`,
    votesCount: overrides.votesCount ?? 120,
    createdAt: overrides.createdAt ?? new Date(NOW - 2 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

const baseResult: ProductHuntResult = {
  ok: true,
  posts: [],
  generatedAt: new Date(NOW).toISOString(),
};

describe("PRODUCT_LAUNCH (Product Hunt) — Layer A trust invariants", () => {
  it("a dated launch yields a trustworthy card (attributed to producthunt.com, honest timestamp)", () => {
    const created = new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3d old — legit for a ranking
    const cards = deriveProductLaunchCards({
      ...baseResult,
      posts: [post({ id: "glaze-4", createdAt: created })],
    });
    expect(cards).toHaveLength(1);
    expect(auditItem([checkResolvableSource(cards[0].sourceUrl)])).toEqual([]);
    expect(new URL(cards[0].sourceUrl!).host).toBe("www.producthunt.com");
    // The card's timestamp traces to the REAL createdAt — not fabricated as "now".
    expect(cards[0].timestamp).toBe(created);
  });

  it("INCIDENT (generatedAt fabrication): a dateless post is DROPPED, never stamped 'now'", () => {
    const datedIso = new Date(NOW - 24 * 60 * 60 * 1000).toISOString();
    const cards = deriveProductLaunchCards({
      ...baseResult,
      posts: [
        post({ id: "dated", createdAt: datedIso }),
        post({ id: "undated", createdAt: "" }),
        post({ id: "bad-date", createdAt: "not-a-timestamp" }),
      ],
    });
    // Only the genuinely-dated post survives; neither dateless post is
    // stamped with generatedAt (which would read as a just-launched product).
    expect(cards).toHaveLength(1);
    expect(cards[0].timestamp).toBe(datedIso);
    expect(cards[0].timestamp).not.toBe(baseResult.generatedAt);
  });

  it("a post with no url is dropped (no unlinkable launch claim)", () => {
    const cards = deriveProductLaunchCards({
      ...baseResult,
      posts: [{ ...post({ id: "nolink" }), url: "" }],
    });
    expect(cards).toEqual([]);
  });
});
