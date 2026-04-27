import { describe, expect, it } from "vitest";
import { deriveResearchCards } from "@/lib/feed/derivers/research";
import type { ArxivPaper, ResearchResult } from "@/lib/data/fetch-research";

function paper(
  partial: Partial<ArxivPaper> & Pick<ArxivPaper, "id" | "title">,
): ArxivPaper {
  return {
    id: partial.id,
    title: partial.title,
    authors: partial.authors ?? ["Author One"],
    published: partial.published ?? "2026-04-27T00:00:00.000Z",
    updated: partial.updated ?? "2026-04-27T00:00:00.000Z",
    primaryCategory: partial.primaryCategory ?? "cs.AI",
    categories: partial.categories ?? ["cs.AI"],
    abstractUrl: partial.abstractUrl ?? `https://arxiv.org/abs/${partial.id}`,
  };
}

const baseResult: ResearchResult = {
  ok: true,
  papers: [],
  generatedAt: "2026-04-27T12:00:00.000Z",
};

describe("deriveResearchCards", () => {
  it("emits up to 5 cards from the top-of-list (newest first)", () => {
    const papers = Array.from({ length: 12 }, (_, i) =>
      paper({
        id: `2604.${String(i).padStart(5, "0")}v1`,
        title: `Paper ${i}`,
        published: new Date(Date.UTC(2026, 3, 27, 12 - i)).toISOString(),
      }),
    );
    const cards = deriveResearchCards({ ...baseResult, papers });
    expect(cards).toHaveLength(5);
    for (const card of cards) {
      expect(card.type).toBe("RESEARCH");
      expect(card.severity).toBe(20);
    }
  });

  it("emits fewer than 5 cards when fewer papers exist", () => {
    const papers = [
      paper({ id: "2604.00001v1", title: "Only paper" }),
      paper({ id: "2604.00002v1", title: "Second paper" }),
    ];
    const cards = deriveResearchCards({ ...baseResult, papers });
    expect(cards).toHaveLength(2);
  });

  it("populates sourceUrl from the paper's abstractUrl", () => {
    const papers = [
      paper({
        id: "2604.15306v1",
        title: "On something interesting",
        abstractUrl: "https://arxiv.org/abs/2604.15306v1",
      }),
    ];
    const cards = deriveResearchCards({ ...baseResult, papers });
    expect(cards[0].sourceUrl).toBe("https://arxiv.org/abs/2604.15306v1");
    expect(cards[0].sourceName).toContain("arXiv");
  });

  it("uses the paper's published timestamp on the card", () => {
    const papers = [
      paper({
        id: "2604.15306v1",
        title: "A paper",
        published: "2026-04-27T08:30:00.000Z",
      }),
    ];
    const cards = deriveResearchCards({ ...baseResult, papers });
    expect(cards[0].timestamp).toBe("2026-04-27T08:30:00.000Z");
  });

  it("returns [] on empty papers", () => {
    expect(deriveResearchCards(baseResult)).toEqual([]);
  });

  it("returns [] when result is not ok (graceful degradation, never fabricated)", () => {
    expect(
      deriveResearchCards({ ...baseResult, ok: false, papers: [], error: "fetch failed" }),
    ).toEqual([]);
  });
});
