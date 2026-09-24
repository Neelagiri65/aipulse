/**
 * gawk.dev — Feed ranking
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
    const tier = withinSeverity(a) - withinSeverity(b);
    if (tier !== 0) return tier;
    const aMs = new Date(a.timestamp).getTime();
    const bMs = new Date(b.timestamp).getTime();
    return bMs - aMs;
  });
}

/**
 * Order inside one severity, before recency; lower goes first. NEWS carries two sources: a Hacker
 * News story has passed a points threshold, a Reddit post has passed none (the subreddit's own
 * curation is trusted, not scored), so the engagement-checked story goes first (founder,
 * 2026-09-24: Hacker News "should take importance"). Every other kind: recency alone.
 */
function withinSeverity(c: Card): number {
  if (c.type === "NEWS") return c.meta.hnId !== undefined ? 0 : 1;
  return 0;
}

/**
 * Diversity pass — interleave a ranked card list so the feed doesn't
 * read as a wall of identical card types.
 *
 * Rule: when the last `maxConsecutive` cards in the output all share a
 * type and the next candidate is the same type, pull a different-type
 * card forward instead. Which one ROTATES among the other kinds: the kind
 * shown least recently wins, ties going to the higher-ranked card
 * (2026-09-24). Taking the top other kind every time handed every slot
 * to one kind — a run of Product Hunt launches interleaved only with
 * publishers, and Hacker News and research papers never reached the top. The pulled card preserves its
 * own relative order (we only swap its position with the next-same-type
 * candidate, not its severity rank within its own type).
 *
 * Properties:
 *  - Pure: input array is not mutated.
 *  - Loss-free: every input card appears exactly once in the output.
 *  - Severity-aware outside the interleave slots: cards keep their
 *    ranked order except the one pulled into a slot. Inside a slot the
 *    rotation deliberately lets a lower kind in ahead of a higher one
 *    that has already had a turn — that is the point of the slot.
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
      const altIdx = rotationPick(out, remaining, candidate.type);
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

/** Index in `remaining` of the different-type card whose kind was shown least recently (never
 *  shown counts as longest ago); ties go to the earlier, higher-ranked card. -1 when none. */
function rotationPick(
  out: readonly Card[],
  remaining: readonly Card[],
  deferredType: CardType,
): number {
  const lastShown = new Map<CardType, number>();
  out.forEach((c, i) => lastShown.set(c.type, i));
  let best = -1;
  let bestSeen = Infinity;
  for (let i = 1; i < remaining.length; i += 1) {
    const t = remaining[i].type;
    if (t === deferredType) continue;
    const seen = lastShown.get(t) ?? -1;
    if (seen < bestSeen) {
      best = i;
      bestSeen = seen;
    }
  }
  return best;
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
