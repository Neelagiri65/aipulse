/**
 * Gawk — LAB_HIGHLIGHT deriver
 *
 * Pure function over `LabsPayload`. Emits exactly one Card — the
 * lab with the highest 7-day GitHub event total. Returns [] when
 * the registry is empty or the top lab has zero events (quiet
 * across the entire registry — never fabricate a highlight).
 *
 * sourceUrl points at the lab's own URL (its website or GH org
 * fallback). The lab registry itself is the curated source for the
 * row's *existence*; the URL is the primary public surface.
 *
 * Freshness gate (trust harness, prd-trust-harness §1 F): labs comes
 * through `withLastKnown`, so a dead upstream serves the LAST KNOWN
 * payload — disclosed at feed level via staleSources ("cited stale is
 * more valuable than blank"). But the card's claim is "leads *7-day*
 * GitHub activity": once the payload is older than the window it
 * measures, the claimed window has ZERO overlap with the actual last
 * 7 days and disclosure can't rescue the claim. The bound is therefore
 * WINDOW_MS itself (from fetch-labs — the gate derives from the claim,
 * it is not an invented number). An unparseable generatedAt is dropped
 * too (freshness unverifiable → don't ship).
 */

import { WINDOW_MS, type LabsPayload } from "@/lib/data/fetch-labs";
import { cardId } from "@/lib/feed/card-id";
import { FEED_SEVERITIES } from "@/lib/feed/thresholds";
import type { Card } from "@/lib/feed/types";

const SOURCE_NAME = "AI Labs registry";

/** Max payload age to be served as a live highlight — the 7-day window
 *  the headline claims to measure. Beyond it the claim is expired. */
export const LABS_MAX_AGE_MS = WINDOW_MS;

export function deriveLabHighlightCards(
  payload: LabsPayload,
  nowMs: number = Date.now(),
): Card[] {
  if (payload.labs.length === 0) return [];

  const top = payload.labs.reduce((best, lab) =>
    lab.total > best.total ? lab : best,
  );
  if (top.total === 0) return [];

  const timestampMs = new Date(payload.generatedAt).getTime();
  // Freshness gate: drop expired or undated payloads (never served as live).
  if (Number.isNaN(timestampMs)) return [];
  if (nowMs - timestampMs > LABS_MAX_AGE_MS) return [];
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
