import { describe, expect, it } from "vitest";

import { auditServedOutput, type FeedCardLike } from "@/lib/trust/auditor";

const NOW = Date.parse("2026-07-05T12:00:00Z");
const FRESH = "2026-07-05T11:30:00Z";

describe("auditServedOutput — Layer B live invariants", () => {
  it("clean served output → ok, no findings", () => {
    const r = auditServedOutput({
      now: NOW,
      globe: {
        points: [
          { meta: { type: "PushEvent", repo: "torvalds/linux", createdAt: FRESH } },
          { meta: { type: "PullRequestEvent", repo: "org/x", createdAt: FRESH } },
        ],
      },
      feed: {
        lastComputed: FRESH,
        cards: [{ type: "MODEL_MOVER", sourceUrl: "https://openrouter.ai/rankings", timestamp: FRESH }],
      },
      modelUsage: { ordering: "top-weekly", generatedAt: FRESH, rows: [{}, {}] },
    });
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
    expect(r.checked).toEqual({ globe: 2, feed: 1, "model-usage": 2 });
  });

  it("catches the #54 class: a served WatchEvent dot", () => {
    const r = auditServedOutput({
      now: NOW,
      globe: { points: [{ meta: { type: "WatchEvent", repo: "spam/dead", createdAt: FRESH } }] },
    });
    expect(r.ok).toBe(false);
    expect(r.findings[0]).toMatchObject({ feed: "globe", invariant: "verifiable" });
  });

  it("catches the #53 class: a nested-host card source link", () => {
    const r = auditServedOutput({
      now: NOW,
      feed: {
        lastComputed: FRESH,
        cards: [
          {
            type: "NEW_RELEASE",
            sourceUrl: "https://github.com/gitlab.com/gitlab-org/gitlab-runner",
            timestamp: FRESH,
          },
        ],
      },
    });
    expect(r.findings.some((f) => f.invariant === "attributed")).toBe(true);
  });

  it("catches the S88 class: a stale dot served as live", () => {
    const r = auditServedOutput({
      now: NOW,
      globe: { points: [{ meta: { type: "PushEvent", repo: "x/y", createdAt: "2026-07-04T00:00:00Z" } }] },
    });
    expect(r.findings.some((f) => f.feed === "globe" && f.invariant === "fresh")).toBe(true);
  });

  it("catches the S91 class: a usage ranking on a catalogue-fallback ordering", () => {
    const r = auditServedOutput({
      now: NOW,
      modelUsage: { ordering: "catalogue-fallback", generatedAt: FRESH, rows: [{}, {}, {}] },
    });
    expect(r.findings.some((f) => f.feed === "model-usage" && f.invariant === "real")).toBe(true);
  });

  it("a catalogue-fallback with ZERO rows is cold-start, not a violation", () => {
    const r = auditServedOutput({
      now: NOW,
      modelUsage: { ordering: "catalogue-fallback", generatedAt: FRESH, rows: [] },
    });
    expect(r.findings.some((f) => f.feed === "model-usage" && f.invariant === "real")).toBe(false);
  });

  describe("per-card freshness (deriver-window types only)", () => {
    const feedOf = (cards: FeedCardLike[]) => ({ lastComputed: FRESH, cards });

    it("catches the frozen-ingest class: a month-old RESEARCH card served as newest", () => {
      const r = auditServedOutput({
        now: NOW,
        feed: feedOf([
          { type: "RESEARCH", sourceUrl: "https://arxiv.org/abs/2406.00001", timestamp: "2026-06-05T12:00:00Z" },
        ]),
      });
      expect(
        r.findings.some((f) => f.feed === "feed" && f.invariant === "fresh" && f.sample.startsWith("RESEARCH")),
      ).toBe(true);
    });

    it("a 6-day RESEARCH card is within the 7d deriver window + slack — clean", () => {
      const r = auditServedOutput({
        now: NOW,
        feed: feedOf([
          { type: "RESEARCH", sourceUrl: "https://arxiv.org/abs/2406.00002", timestamp: "2026-06-29T12:00:00Z" },
        ]),
      });
      expect(r.findings).toEqual([]);
    });

    it("catches a 3-day NEWS card (12h window + slack exceeded)", () => {
      const r = auditServedOutput({
        now: NOW,
        feed: feedOf([
          { type: "NEWS", sourceUrl: "https://news.ycombinator.com/item?id=1", timestamp: "2026-07-02T12:00:00Z" },
        ]),
      });
      expect(r.findings.some((f) => f.invariant === "fresh" && f.sample.startsWith("NEWS"))).toBe(true);
    });

    it("a 20h NEWS card (reddit 12h window, feed up to 12h behind) — clean", () => {
      const r = auditServedOutput({
        now: NOW,
        feed: feedOf([
          { type: "NEWS", sourceUrl: "https://reddit.com/r/x/comments/1", timestamp: "2026-07-04T16:00:00Z" },
        ]),
      });
      expect(r.findings).toEqual([]);
    });

    it("PRODUCT_LAUNCH is a ranking feed — a 6-day-old entry is NOT staleness", () => {
      const r = auditServedOutput({
        now: NOW,
        feed: feedOf([
          { type: "PRODUCT_LAUNCH", sourceUrl: "https://www.producthunt.com/posts/x", timestamp: "2026-06-29T12:00:00Z" },
        ]),
      });
      expect(r.findings).toEqual([]);
    });

    it("catches an expired LAB_HIGHLIGHT (20d — past the 7d claim window + slack)", () => {
      const r = auditServedOutput({
        now: NOW,
        feed: feedOf([
          { type: "LAB_HIGHLIGHT", sourceUrl: "https://www.anthropic.com", timestamp: "2026-06-15T12:00:00Z" },
        ]),
      });
      expect(r.findings.some((f) => f.invariant === "fresh" && f.sample.startsWith("LAB_HIGHLIGHT"))).toBe(true);
    });

    it("a 10-day LAB_HIGHLIGHT is within 2×(7d window + feed budget) — clean", () => {
      const r = auditServedOutput({
        now: NOW,
        feed: feedOf([
          { type: "LAB_HIGHLIGHT", sourceUrl: "https://www.anthropic.com", timestamp: "2026-06-25T12:00:00Z" },
        ]),
      });
      expect(r.findings).toEqual([]);
    });

    it("types with no deriver-declared window are skipped, never defaulted", () => {
      const r = auditServedOutput({
        now: NOW,
        feed: feedOf([
          { type: "MODEL_MOVER", sourceUrl: "https://openrouter.ai/rankings", timestamp: "2026-06-20T12:00:00Z" },
        ]),
      });
      expect(r.findings).toEqual([]);
    });

    it("a gated type with NO timestamp is a violation (freshness unverifiable)", () => {
      const r = auditServedOutput({
        now: NOW,
        feed: feedOf([{ type: "RESEARCH", sourceUrl: "https://arxiv.org/abs/2406.00003" }]),
      });
      expect(
        r.findings.some((f) => f.invariant === "fresh" && f.detail.includes("unverifiable")),
      ).toBe(true);
    });
  });
});
