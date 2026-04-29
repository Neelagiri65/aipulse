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
  if (severity >= 60) return "degrade"; // MODEL_MOVER, SDK_TREND — amber
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
  for (const card of sorted) {
    if (out.length >= limit) break;
    const panel = panelForCardType(card.type);
    if (!panel) continue;
    out.push({ card, panel, tone: toneForSeverity(card.severity) });
  }
  return out;
}
