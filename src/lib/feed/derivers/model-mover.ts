/**
 * AI Pulse — MODEL_MOVER deriver
 *
 * Pure function over `ModelUsageDto`. Emits one Card per OpenRouter
 * top-N model whose week-over-week rank delta exceeds the locked
 * threshold (`FEED_TRIGGERS.MODEL_MOVER_RANK_DELTA` = 3, strictly
 * greater than). Silent for `previousRank: null` (first-read or
 * newly-arrived slug — the panel renders those as NEW; the feed
 * deliberately doesn't fire on them because there's no delta to
 * report).
 */

import type { ModelUsageDto } from "@/lib/data/openrouter-types";
import { cardId } from "@/lib/feed/card-id";
import { FEED_SEVERITIES, FEED_TRIGGERS } from "@/lib/feed/thresholds";
import type { Card } from "@/lib/feed/types";

const MODEL_MOVER_SOURCE_NAME = "OpenRouter";

export function deriveModelMoverCards(dto: ModelUsageDto): Card[] {
  const cards: Card[] = [];
  const timestampMs = new Date(dto.fetchedAt).getTime();

  for (const row of dto.rows) {
    if (row.previousRank === null) continue;
    const delta = row.rank - row.previousRank;
    if (Math.abs(delta) <= FEED_TRIGGERS.MODEL_MOVER_RANK_DELTA) continue;

    const direction = delta < 0 ? "up" : "down";
    const magnitude = Math.abs(delta);
    cards.push({
      id: cardId("MODEL_MOVER", `openrouter:${row.slug}`, timestampMs),
      type: "MODEL_MOVER",
      severity: FEED_SEVERITIES.MODEL_MOVER,
      headline: `${row.name} ${direction} ${magnitude} ranks on OpenRouter weekly`,
      detail: `Now #${row.rank}, was #${row.previousRank}.`,
      sourceName: MODEL_MOVER_SOURCE_NAME,
      sourceUrl: row.hubUrl,
      timestamp: dto.fetchedAt,
      meta: {
        slug: row.slug,
        currentRank: row.rank,
        previousRank: row.previousRank,
        delta,
      },
    });
  }
  return cards;
}
