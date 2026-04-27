/**
 * AI Pulse — LAB_HIGHLIGHT deriver
 *
 * Pure function over `LabsPayload`. Emits exactly one Card — the
 * lab with the highest 7-day GitHub event total. Returns [] when
 * the registry is empty or the top lab has zero events (quiet
 * across the entire registry — never fabricate a highlight).
 *
 * sourceUrl points at the lab's own URL (its website or GH org
 * fallback). The lab registry itself is the curated source for the
 * row's *existence*; the URL is the primary public surface.
 */

import type { LabsPayload } from "@/lib/data/fetch-labs";
import { cardId } from "@/lib/feed/card-id";
import { FEED_SEVERITIES } from "@/lib/feed/thresholds";
import type { Card } from "@/lib/feed/types";

const SOURCE_NAME = "AI Labs registry";

export function deriveLabHighlightCards(payload: LabsPayload): Card[] {
  if (payload.labs.length === 0) return [];

  const top = payload.labs.reduce((best, lab) =>
    lab.total > best.total ? lab : best,
  );
  if (top.total === 0) return [];

  const timestampMs = new Date(payload.generatedAt).getTime();
  return [
    {
      id: cardId("LAB_HIGHLIGHT", `labs:${top.id}`, timestampMs),
      type: "LAB_HIGHLIGHT",
      severity: FEED_SEVERITIES.LAB_HIGHLIGHT,
      headline: `${top.displayName} leads 7-day GitHub activity (${top.total} events)`,
      detail: `${top.city}, ${top.country} · ${top.orgs.join(", ")}`,
      sourceName: SOURCE_NAME,
      sourceUrl: top.url,
      timestamp: payload.generatedAt,
      meta: {
        labId: top.id,
        total: top.total,
        country: top.country,
      },
    },
  ];
}
