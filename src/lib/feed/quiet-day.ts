/**
 * AI Pulse — Quiet-day decision
 *
 * Returns true when zero cards with severity >= 40 exist in the
 * last 24 hours. The threshold of 40 = NEWS tier; anything below
 * (RESEARCH / LAB_HIGHLIGHT) is informational and does not break
 * the "all quiet" framing.
 *
 * Defensive on clock skew: cards timestamped in the future are
 * treated as not-in-the-window (don't let bad clocks suppress the
 * quiet-day banner).
 */

import type { Card } from "@/lib/feed/types";

const QUIET_DAY_SEVERITY_THRESHOLD = 40;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function isQuietDay(cards: Card[], nowMs: number = Date.now()): boolean {
  for (const card of cards) {
    if (card.severity < QUIET_DAY_SEVERITY_THRESHOLD) continue;
    const cardMs = new Date(card.timestamp).getTime();
    const ageMs = nowMs - cardMs;
    if (ageMs < 0) continue; // future timestamps — clock skew, ignore
    if (ageMs <= TWENTY_FOUR_HOURS_MS) return false;
  }
  return true;
}
