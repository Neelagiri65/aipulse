/**
 * Layer A trust test — RESEARCH (arXiv) deriver.
 *
 * Output-invariant (prd-trust-harness §1). Unlike HN/reddit, arXiv is a
 * recency feed with NO upstream age bound in `fetch-research`: a frozen
 * ingest would serve a month-old cache as "newest research" (the S88 class).
 * deriveResearchCards now applies a 7-day freshness gate (RESEARCH_MAX_AGE_MS)
 * — generous enough to clear arXiv's weekday cadence + a long weekend, tight
 * enough to drop a genuinely stale paper. This test pins that gate and the
 * arxiv.org attribution.
 */

import { describe, expect, it } from "vitest";

import { deriveResearchCards, RESEARCH_MAX_AGE_MS } from "@/lib/feed/derivers/research";
import type { ArxivPaper, ResearchResult } from "@/lib/data/fetch-research";
import { auditItem, checkFresh, checkResolvableSource } from "@/lib/trust/invariants";

const NOW = Date.parse("2026-04-30T12:00:00.000Z");

function paper(
  partial: Partial<ArxivPaper> & Pick<ArxivPaper, "id" | "title">,
): ArxivPaper {
  return {
    id: partial.id,
    title: partial.title,
    authors: partial.authors ?? ["Author One"],
    published: partial.published ?? new Date(NOW - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updated: partial.updated ?? new Date(NOW - 2 * 24 * 60 * 60 * 1000).toISOString(),
    primaryCategory: partial.primaryCategory ?? "cs.AI",
    categories: partial.categories ?? ["cs.AI"],
    abstractUrl: partial.abstractUrl ?? `https://arxiv.org/abs/${partial.id}`,
  };
}

const baseResult: ResearchResult = {
  ok: true,
  papers: [],
  generatedAt: new Date(NOW).toISOString(),
};

describe("RESEARCH (arXiv) — Layer A trust invariants", () => {
  it("a recent paper (within the weekend gap) yields a trustworthy card", () => {
    // 62h old — the real-world arXiv weekend case observed on prod.
    const published = new Date(NOW - 62 * 60 * 60 * 1000).toISOString();
    const cards = deriveResearchCards(
      { ...baseResult, papers: [paper({ id: "2604.00001v1", title: "A paper", published })] },
      NOW,
    );
    expect(cards).toHaveLength(1);
    const violations = auditItem([
      checkFresh(cards[0].timestamp, NOW, RESEARCH_MAX_AGE_MS),
      checkResolvableSource(cards[0].sourceUrl),
    ]);
    expect(violations).toEqual([]);
    expect(new URL(cards[0].sourceUrl!).host).toBe("arxiv.org");
  });

  it("INCIDENT (S88, frozen ingest): a paper older than 7 days is DROPPED, never served as live", () => {
    const stale = new Date(NOW - 8 * 24 * 60 * 60 * 1000).toISOString(); // 8d > 7d gate
    const fresh = new Date(NOW - 2 * 24 * 60 * 60 * 1000).toISOString();
    const cards = deriveResearchCards(
      {
        ...baseResult,
        papers: [
          paper({ id: "stale-v1", title: "Old cached paper", published: stale }),
          paper({ id: "fresh-v1", title: "Fresh paper", published: fresh }),
        ],
      },
      NOW,
    );
    expect(cards.map((c) => c.meta.arxivId)).toEqual(["fresh-v1"]);
    for (const c of cards) {
      expect(checkFresh(c.timestamp, NOW, RESEARCH_MAX_AGE_MS)).toBeNull();
    }
  });

  it("a paper with an unparseable published date is DROPPED (freshness unverifiable → don't ship)", () => {
    const cards = deriveResearchCards(
      { ...baseResult, papers: [paper({ id: "bad-v1", title: "No date", published: "not-a-date" })] },
      NOW,
    );
    expect(cards).toEqual([]);
  });
});
