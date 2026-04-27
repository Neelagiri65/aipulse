/**
 * AI Pulse — Feed ranking
 *
 * Sorts cards by severity descending, then by timestamp descending
 * within the same severity tier. Pure function; does not mutate the
 * input array. Stable for ties.
 *
 * This is a deterministic sort key over already-aggregated public
 * data — not an invented metric. See `/methodology` for the formula.
 */

import type { Card } from "@/lib/feed/types";

export function rankCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.severity !== b.severity) return b.severity - a.severity;
    const aMs = new Date(a.timestamp).getTime();
    const bMs = new Date(b.timestamp).getTime();
    return bMs - aMs;
  });
}
