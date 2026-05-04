/**
 * Gawk — Feed ranking
 *
 * Sorts cards by severity descending, then by timestamp descending
 * within the same severity tier. Pure function; does not mutate the
 * input array. Stable for ties.
 *
 * This is a deterministic sort key over already-aggregated public
 * data — not an invented metric. See `/methodology` for the formula.
 */

import type { Card, CardType } from "@/lib/feed/types";

export function rankCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.severity !== b.severity) return b.severity - a.severity;
    const aMs = new Date(a.timestamp).getTime();
    const bMs = new Date(b.timestamp).getTime();
    return bMs - aMs;
  });
}

/**
 * Diversity pass — interleave a ranked card list so the feed doesn't
 * read as a wall of identical card types.
 *
 * Rule: when the last `maxConsecutive` cards in the output all share a
 * type and the next candidate is the same type, pull the next
 * different-type card forward instead. The pulled card preserves its
 * own relative order (we only swap its position with the next-same-type
 * candidate, not its severity rank within its own type).
 *
 * Properties:
 *  - Pure: input array is not mutated.
 *  - Loss-free: every input card appears exactly once in the output.
 *  - Severity-aware: a higher-severity card never gets pushed behind a
 *    lower-severity one when there's still a different-type card at
 *    the higher tier (the look-ahead picks the first non-same-type
 *    candidate, which is at the highest available severity).
 *  - Idempotent for already-diverse input: a list with no run > N is
 *    returned unchanged.
 *
 * The default cap of 2 means at most two consecutive cards share a
 * type before a different one is interleaved — matches the pattern a
 * reader can hold in working memory ("two like, then something new").
 */
export function diversifyCards(
  ranked: readonly Card[],
  maxConsecutive: number = 2,
): Card[] {
  if (maxConsecutive < 1) return [...ranked];
  const out: Card[] = [];
  const remaining = [...ranked];
  while (remaining.length > 0) {
    const candidate = remaining[0];
    if (shouldDeferType(out, candidate.type, maxConsecutive)) {
      const altIdx = remaining.findIndex((c) => c.type !== candidate.type);
      if (altIdx > 0) {
        out.push(remaining[altIdx]);
        remaining.splice(altIdx, 1);
        continue;
      }
      // No other type left in the queue — flush remaining as-is.
    }
    out.push(remaining.shift() as Card);
  }
  return out;
}

function shouldDeferType(
  out: readonly Card[],
  nextType: CardType,
  maxConsecutive: number,
): boolean {
  if (out.length < maxConsecutive) return false;
  for (let i = out.length - maxConsecutive; i < out.length; i += 1) {
    if (out[i].type !== nextType) return false;
  }
  return true;
}

const DEDUP_WINDOW_MS_DEFAULT = 4 * 60 * 60 * 1000;

/**
 * Source dedup pass — collapse same-`sourceUrl` cards within a sliding
 * time window down to the highest-ranked instance.
 *
 * Caller contract: the input must already be ranker-sorted (severity
 * desc, time desc within tier). This function preserves the existing
 * order and simply skips later cards whose sourceUrl matches an already
 * kept card whose timestamp is within `windowMs`.
 *
 * Why per-`sourceUrl`: every Card carries the canonical primary-source
 * URL the underlying number was read from (HN comments page, Reddit
 * comments page, status-page incident URL, arXiv abstract, etc.). Two
 * cards sharing a sourceUrl are by construction the same upstream
 * story; dropping the lower-severity duplicate matches the trust
 * contract — we surface the strongest signal once, not the same
 * conversation six times in a row.
 *
 * Sliding window: the window anchors on the *kept* card. A third hit
 * far enough from every kept anchor survives, even if it would be
 * within the window of an earlier dropped card. Prevents the dedup
 * from silently extending coverage indefinitely on a noisy URL.
 *
 * Pure: input array is not mutated.
 */
export function dedupeCardsBySource(
  cards: readonly Card[],
  windowMs: number = DEDUP_WINDOW_MS_DEFAULT,
): Card[] {
  if (cards.length < 2) return [...cards];
  const keptByUrl = new Map<string, number[]>();
  const out: Card[] = [];
  for (const c of cards) {
    const t = new Date(c.timestamp).getTime();
    const anchors = keptByUrl.get(c.sourceUrl);
    if (anchors && anchors.some((a) => Math.abs(a - t) < windowMs)) {
      continue;
    }
    if (anchors) anchors.push(t);
    else keptByUrl.set(c.sourceUrl, [t]);
    out.push(c);
  }
  return out;
}
