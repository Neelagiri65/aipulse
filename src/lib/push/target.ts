/**
 * Which push subscriptions receive an alert about a tool. Pure, no I/O.
 *
 * A subscription may carry `tools` — the visitor's stack at the moment they
 * enabled alerts (or last changed the stack while alerts were on). The
 * rules, in order:
 *   - a payload with no tool id (or one that is not a known tool) goes to
 *     everyone — alerting fails OPEN, never silently closed;
 *   - a record with no `tools` (legacy raw subscription) or an empty list
 *     wants everything;
 *   - otherwise the record receives the alert only if the tool is in its list.
 */
import { TOOLS } from "@/components/health/tools";
import type { ToolId } from "@/lib/stack";

const KNOWN = new Set<string>(TOOLS.map((t) => t.id));

export type Targetable = { tools?: readonly string[] | null };

export function isKnownToolId(id: unknown): id is ToolId {
  return typeof id === "string" && KNOWN.has(id);
}

export function selectRecipients<T extends Targetable>(records: readonly T[], toolId: unknown): T[] {
  if (!isKnownToolId(toolId)) return [...records];
  return records.filter((r) => !r.tools || r.tools.length === 0 || r.tools.includes(toolId));
}
