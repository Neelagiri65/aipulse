/**
 * "Your stack" applied to feed cards. Pure logic, no React.
 *
 * Same constraint test as src/lib/stack.ts: explicit choice, client-only,
 * nothing hidden, no new prompt, server HTML byte-identical. Plus one rule
 * of its own:
 *
 *   6. A card names a tool only when its deriver said so. Attribution is
 *      `meta.toolId`, validated against the TOOLS registry. Nothing is
 *      inferred from headlines or source names, so a card either carries a
 *      tool id or it does not. Today only TOOL_ALERT cards do (see
 *      derivers/tool-alert.ts); other derivers may set `meta.toolId` when
 *      they have a deterministic source→tool mapping, and this module picks
 *      it up unchanged.
 *
 * "Feed cards by stack" is therefore a partition, never a filter: cards
 * naming a stack tool come first, everything else follows in the same rank
 * order it always had.
 */
import { partitionBy, type Stack, type ToolId } from "@/lib/stack";
import { TOOLS } from "@/components/health/tools";
import type { Card } from "./types";

const KNOWN = new Set<string>(TOOLS.map((t) => t.id));

/** The tool a card is about, or null when its deriver did not say. */
export function cardToolId(card: Pick<Card, "meta">): ToolId | null {
  const id = card.meta?.toolId;
  return typeof id === "string" && KNOWN.has(id) ? (id as ToolId) : null;
}

/**
 * Split cards into those naming a tool in the visitor's stack and the rest.
 * With no stack every card is "mine" and "rest" is empty, so the feed reads
 * exactly as it does today. Unattributed cards are "rest", not hidden.
 */
export function partitionCardsByStack<T extends Pick<Card, "meta">>(
  cards: readonly T[],
  stack: Stack | null,
): { mine: T[]; rest: T[] } {
  const { mine, others } = partitionBy(cards, stack, cardToolId);
  return { mine, rest: others };
}
