import { describe, expect, it } from "vitest";
import { deriveProductLaunchCards } from "@/lib/feed/derivers/product-launch";
import type { ProductHuntResult } from "@/lib/data/fetch-producthunt";

const AT = "2026-06-19T00:00:00.000Z";

describe("deriveProductLaunchCards", () => {
  it("returns [] on a failed fetch (graceful, never fabricated)", () => {
    const r: ProductHuntResult = { ok: false, posts: [], generatedAt: AT };
    expect(deriveProductLaunchCards(r)).toEqual([]);
  });

  it("returns [] when the token is unset (ok but empty)", () => {
    const r: ProductHuntResult = { ok: true, posts: [], generatedAt: AT };
    expect(deriveProductLaunchCards(r)).toEqual([]);
  });

  it("emits a cited PRODUCT_LAUNCH card with name + tagline headline", () => {
    const r: ProductHuntResult = {
      ok: true,
      generatedAt: AT,
      posts: [
        {
          id: "12345",
          name: "Filvy",
          tagline: "Your family's document vault with AI search",
          url: "https://www.producthunt.com/posts/filvy",
          votesCount: 42,
          createdAt: AT,
        },
      ],
    };
    const cards = deriveProductLaunchCards(r);
    expect(cards).toHaveLength(1);
    expect(cards[0].type).toBe("PRODUCT_LAUNCH");
    expect(cards[0].sourceName).toBe("Product Hunt");
    expect(cards[0].sourceUrl).toBe("https://www.producthunt.com/posts/filvy");
    expect(cards[0].headline).toBe("Filvy: Your family's document vault with AI search");
    expect(cards[0].meta.votes).toBe(42);
  });

  it("skips posts missing an id or url", () => {
    const r: ProductHuntResult = {
      ok: true,
      generatedAt: AT,
      posts: [
        { id: "", name: "x", tagline: "y", url: "", votesCount: 0, createdAt: AT },
      ],
    };
    expect(deriveProductLaunchCards(r)).toEqual([]);
  });
});
