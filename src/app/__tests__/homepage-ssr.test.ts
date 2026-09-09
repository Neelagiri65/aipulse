import { describe, it, expect } from "vitest";
import { revalidate } from "@/app/page";

/**
 * The homepage's server HTML is the only version of gawk.dev an AI answer
 * engine ever sees: GPTBot, ClaudeBot, PerplexityBot and CCBot — all four
 * invited by name in robots.ts — do not execute JavaScript, and Googlebot
 * indexes raw HTML long before its render pass catches up. Before this, that
 * HTML read "connecting… / awaiting first poll" in 2,054 characters.
 *
 * The crawler-visible content itself is asserted in the Playwright spec with
 * `javaScriptEnabled: false`. This pins the number that decides how stale that
 * HTML is allowed to be.
 */
describe("homepage prerender", () => {
  it("revalidates on the status sources' own 5-minute cadence", () => {
    // Faster re-serves identical upstream numbers; slower ages the
    // crawler-visible HTML past the freshness the page claims.
    expect(revalidate).toBe(300);
  });
});
