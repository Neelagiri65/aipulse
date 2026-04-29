/**
 * Highlights — top-N card selection for the "something changed, pay
 * attention" strip below the StatusBar.
 *
 * Pure logic over an existing FeedResponse. The selection rule is the
 * same severity/timestamp sort the feed already applies (see
 * `compose.ts`); we just take the top N. No new metric, no rescoring,
 * no copy generation — every chip's headline comes verbatim from the
 * card it represents.
 *
 * Per memory `feedback_trust_bar.md`: every number says what it does
 * mean. The chip is a pointer into the panel that owns the deeper
 * context — clicking a chip opens that panel rather than fabricating
 * a tooltip on the strip itself.
 */

import type { Card, CardType, FeedResponse } from "@/lib/feed/types";

/**
 * The dashboard panels a chip can route to. Subset of the wider
 * panel set in `Dashboard.tsx`; only panels that surface card types
 * we know how to map.
 */
export type HighlightPanelId =
  | "tools"
  | "model-usage"
  | "models"
  | "sdk-adoption"
  | "wire"
  | "research"
  | "labs"
  | "benchmarks";

/**
 * Each card type maps to exactly one panel. Returns null if a card
 * type ever arrives that we don't know how to route — UI swallows
 * the click in that case rather than guessing.
 */
export function panelForCardType(type: CardType): HighlightPanelId | null {
  switch (type) {
    case "TOOL_ALERT":
      return "tools";
    case "MODEL_MOVER":
      return "model-usage";
    case "NEW_RELEASE":
      // HF top-by-downloads listing lives in the Models panel; that's
      // the closest panel to "what just shipped". The release won't be
      // in the top-by-downloads list yet (brand-new repos take time to
      // accumulate) but the panel is the discoverability surface.
      return "models";
    case "SDK_TREND":
      return "sdk-adoption";
    case "NEWS":
      return "wire";
    case "RESEARCH":
      return "research";
    case "LAB_HIGHLIGHT":
      return "labs";
    default:
      // Exhaustive guard — Card type union widening will trip the
      // type checker before this branch is reached.
      return null;
  }
}

/** Severity tier → presentational tone for the chip swatch. */
export type HighlightTone = "outage" | "degrade" | "info" | "neutral";

export function toneForSeverity(severity: Card["severity"]): HighlightTone {
  if (severity >= 100) return "outage"; // TOOL_ALERT — red dot
  if (severity >= 60) return "degrade"; // MODEL_MOVER, NEW_RELEASE, SDK_TREND — amber
  if (severity >= 40) return "info"; // NEWS — sky
  return "neutral"; // RESEARCH, LAB_HIGHLIGHT — muted
}

export type Highlight = {
  card: Card;
  panel: HighlightPanelId;
  tone: HighlightTone;
};

/**
 * Pick up to `limit` highlights from the feed response.
 *
 * - Quiet-day responses return [] — the chip strip should disappear
 *   entirely on a slow day rather than promote LAB_HIGHLIGHT or
 *   RESEARCH cards into a "something changed" position they don't
 *   warrant. The QuietDayBanner already covers that surface.
 * - We rely on `cards` already being severity-sorted (composer
 *   contract) but defensively sort again so a stray ordering bug
 *   upstream doesn't surface a low-severity card at the front.
 * - Cards whose type maps to no panel are skipped — silently for now.
 *
 * Distinct-type rule: the strip is a "what's happening across the
 * dashboard" snapshot, so we prefer breadth over depth. First pass
 * picks the highest-severity card of each unique type, second pass
 * fills any remaining slots from the severity-sorted leftovers. With
 * limit=3 a degraded tool, a model mover, and an SDK trend will all
 * beat three MODEL_MOVERs, even if the three movers are technically
 * higher-severity within MODEL_MOVER's tier.
 */
export function pickTopHighlights(
  response: FeedResponse | undefined,
  limit = 3,
): Highlight[] {
  if (!response) return [];
  if (response.quietDay) return [];

  const sorted = [...response.cards].sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    return b.timestamp.localeCompare(a.timestamp);
  });

  const out: Highlight[] = [];
  const usedCardIds = new Set<string>();
  const usedTypes = new Set<Card["type"]>();

  // Pass 1 — one per type, severity-desc.
  for (const card of sorted) {
    if (out.length >= limit) break;
    if (usedTypes.has(card.type)) continue;
    const panel = panelForCardType(card.type);
    if (!panel) continue;
    out.push({ card, panel, tone: toneForSeverity(card.severity) });
    usedTypes.add(card.type);
    usedCardIds.add(card.id);
  }

  // Pass 2 — fill remaining slots from severity-desc leftovers.
  if (out.length < limit) {
    for (const card of sorted) {
      if (out.length >= limit) break;
      if (usedCardIds.has(card.id)) continue;
      const panel = panelForCardType(card.type);
      if (!panel) continue;
      out.push({ card, panel, tone: toneForSeverity(card.severity) });
      usedCardIds.add(card.id);
    }
  }

  return out;
}
