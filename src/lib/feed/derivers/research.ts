/**
 * AI Pulse — RESEARCH deriver
 *
 * Pure function over `ResearchResult`. Emits one Card per paper in
 * the top-5-by-recency slice. Order is preserved as upstream
 * delivers it — arXiv's own `sortByDate=desc` is the ranking; AI
 * Pulse does not re-rank.
 *
 * Severity is the lowest fixed tier (10 in the formula but RESEARCH
 * uses 20 per the locked PRD). Returns [] on failed fetches —
 * graceful degradation, never fabricated.
 */

import { ARXIV_PAPERS } from "@/lib/data-sources";
import type { ResearchResult } from "@/lib/data/fetch-research";
import { cardId } from "@/lib/feed/card-id";
import { FEED_SEVERITIES } from "@/lib/feed/thresholds";
import type { Card } from "@/lib/feed/types";

const TOP_N = 5;
const SOURCE_NAME = "arXiv";

export function deriveResearchCards(result: ResearchResult): Card[] {
  if (!result.ok) return [];
  const cards: Card[] = [];

  for (const paper of result.papers.slice(0, TOP_N)) {
    const timestampMs = new Date(paper.published).getTime();
    cards.push({
      id: cardId("RESEARCH", `arxiv:${paper.id}`, timestampMs),
      type: "RESEARCH",
      severity: FEED_SEVERITIES.RESEARCH,
      headline: paper.title,
      detail: `${paper.authors.slice(0, 3).join(", ")}${
        paper.authors.length > 3 ? " et al." : ""
      } · ${paper.primaryCategory}`,
      sourceName: SOURCE_NAME,
      sourceUrl: paper.abstractUrl,
      timestamp: paper.published,
      meta: {
        arxivId: paper.id,
        primaryCategory: paper.primaryCategory,
        authorCount: paper.authors.length,
        registryUrl: ARXIV_PAPERS.url,
      },
    });
  }
  return cards;
}
