/**
 * "Your stack" — the tools a visitor said they use. Pure logic, no React.
 *
 * Architectural constraint test (write it before the code, check it after):
 *   1. Explicit choice only. The stack is what the visitor ticked. Nothing is
 *      inferred from behaviour; the only default is "everything".
 *   2. Client-side only. localStorage on this device. No account, no server
 *      state, no cookie, nothing sent anywhere.
 *   3. Nothing hidden. A tool outside the stack is grouped after the stack,
 *      never removed. Every card still renders; every number still shows.
 *   4. No new prompt. The picker is an inline control in the Health panel,
 *      never an overlay or a first-visit modal.
 *   5. The server HTML is byte-identical whatever is stored. The stack does
 *      not exist during server render (server snapshot is null).
 *
 * Gawk aggregates, it does not score: a stack reorders and scopes a count,
 * it never ranks.
 */
import { TOOLS } from "@/components/health/tools";

export type ToolId = (typeof TOOLS)[number]["id"];
export type Stack = readonly ToolId[];

export const STACK_STORAGE_KEY = "gawk-stack";
export const STACK_CHANGE_EVENT = "gawk-stack-change";

const KNOWN = new Set<string>(TOOLS.map((t) => t.id));

/**
 * Parse a stored value. Returns null for "no stack" (unset, empty, corrupt,
 * or nothing recognisable) — the caller treats null as "everything". Unknown
 * ids are dropped, duplicates collapsed, order kept as the visitor chose.
 */
export function parseStack(raw: string | null | undefined): ToolId[] | null {
  if (!raw) return null;
  let ids: unknown;
  try {
    ids = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(ids)) return null;
  const out: ToolId[] = [];
  for (const id of ids) {
    if (typeof id === "string" && KNOWN.has(id) && !out.includes(id as ToolId)) out.push(id as ToolId);
  }
  return out.length ? out : null;
}

export function serializeStack(stack: Stack | null): string | null {
  const clean = stack ? parseStack(JSON.stringify(stack)) : null;
  return clean ? JSON.stringify(clean) : null;
}

/** Toggle one tool. An empty result is "no stack", not "no tools". */
export function toggleTool(stack: Stack | null, id: ToolId): ToolId[] | null {
  const cur = stack ? [...stack] : [];
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  return next.length ? next : null;
}

/**
 * Split rows into the visitor's stack (in TOOLS order, so the list stays
 * stable) and everything else. With no stack, everything is "mine" and
 * "others" is empty — the page reads exactly as it does today.
 */
export function partitionByStack<T extends { tool: { id: ToolId } }>(
  rows: readonly T[],
  stack: Stack | null,
): { mine: T[]; others: T[] } {
  if (!stack || stack.length === 0) return { mine: [...rows], others: [] };
  const set = new Set<ToolId>(stack);
  return { mine: rows.filter((r) => set.has(r.tool.id)), others: rows.filter((r) => !set.has(r.tool.id)) };
}
