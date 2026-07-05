/**
 * Gawk — RESEARCH deriver
 *
 * Pure function over `ResearchResult`. Emits one Card per paper in
 * the top-5-by-recency slice. Order is preserved as upstream
 * delivers it — arXiv's own `sortByDate=desc` is the ranking; AI
 * Pulse does not re-rank.
 *
 * Severity is the lowest fixed tier (10 in the formula but RESEARCH
 * uses 20 per the locked PRD). Returns [] on failed fetches —
 * graceful degradation, never fabricated.
 *
 * Freshness gate (trust harness, prd-trust-harness §1 F): arXiv is a
 * recency feed (sortByDate=desc) but `fetch-research` applies no age
 * bound, so a frozen ingest would serve a month-old cache as "newest
 * research". A paper older than RESEARCH_MAX_AGE_MS is dropped rather
 * than served as live. The window is deliberately generous — arXiv
 * announces ~once a weekday, so a long weekend legitimately puts the
 * newest paper ~3-4 days old; 7 days clears that with headroom. A paper
 * with an unparseable `published` is also dropped (freshness
 * unverifiable → don't ship). Empty output degrades gracefully.
 */

import { ARXIV_PAPERS } from "@/lib/data-sources";
import type { ResearchResult } from "@/lib/data/fetch-research";
import { cardId } from "@/lib/feed/card-id";
import { FEED_SEVERITIES } from "@/lib/feed/thresholds";
import type { Card } from "@/lib/feed/types";

const TOP_N = 5;
const SOURCE_NAME = "arXiv";

/** Max paper age to be served as live research. 7 days (arXiv weekday
 *  cadence + long-weekend headroom). */
export const RESEARCH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function deriveResearchCards(
  result: ResearchResult,
  nowMs: number = Date.now(),
): Card[] {
  if (!result.ok) return [];
  const cards: Card[] = [];

  for (const paper of result.papers.slice(0, TOP_N)) {
    const timestampMs = new Date(paper.published).getTime();
    // Freshness gate: drop stale or undated papers (never served as live).
    if (Number.isNaN(timestampMs)) continue;
    if (nowMs - timestampMs > RESEARCH_MAX_AGE_MS) continue;
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
