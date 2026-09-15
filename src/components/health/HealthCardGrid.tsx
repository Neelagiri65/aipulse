/**
 * gawk.dev — Tool health list (web v2 phase 3): one inset, incidents first. Rows whose state is an
 * exception (any incident, anything not operational, anything unmeasured) come first and open
 * their detail by default; working rows follow, collapsed. The head carries the count of status
 * pages behind the list and the time of the last poll. The name `HealthCardGrid` is kept so the
 * three call sites (desktop Health, the Tools window, the mobile shell) need no change.
 */

"use client";

import { deriveSev } from "@/components/chrome/StatusBar";
import { useStack } from "@/lib/hooks/use-stack";
import { partitionByStack } from "@/lib/stack";
import { StackPicker } from "./StackPicker";
import { ToolHealthCard } from "./ToolHealthCard";
import { deriveRowState } from "./row-state";
import { TOOLS, type ToolHealthData } from "./tools";

export type HealthCardGridProps = {
  /** Map of tool id → live health data. Missing keys render the awaiting / pending state. */
  data?: Partial<Record<(typeof TOOLS)[number]["id"], ToolHealthData>>;
  /** ISO time of the poll that produced `data`; shown as "checked hh:mm UTC". */
  polledAt?: string;
  /** Kept for the call sites; the list has one layout on every width. */
  maximized?: boolean;
};

const STATUS_PAGES = new Set(TOOLS.flatMap((t) => t.sourceIds.filter((id) => id.endsWith("-status")))).size;

function hhmmUtc(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

function incidentsFirst<T extends { state: { exception: boolean } }>(rows: T[]): T[] {
  return [...rows.filter((r) => r.state.exception), ...rows.filter((r) => !r.state.exception)];
}

export function HealthCardGrid({ data, polledAt }: HealthCardGridProps) {
  // null on the server and on the first client render (server snapshot), so
  // the HTML a crawler or a fresh visitor gets is the full, unscoped list.
  const { stack, setStack } = useStack();
  const rows = TOOLS.map((tool) => ({ tool, data: data?.[tool.id], state: deriveRowState(tool, data?.[tool.id]) }));
  const { mine, others } = partitionByStack(rows, stack);
  const checked = hhmmUtc(polledAt);

  // The personal answer to the h1, only when there is a stack to answer for.
  // Counts come from the same deriveSev as the global pill, over the stack's
  // tools only, so the two numbers can be read side by side.
  let heading = "Tool health · incidents first";
  if (stack && mine.length > 0) {
    const sev = deriveSev({ data: Object.fromEntries(mine.map((r) => [r.tool.id, r.data])) } as Parameters<typeof deriveSev>[0]);
    const worst = sev.outage > 0 ? "outage" : sev.degraded > 0 ? "degraded" : sev.unknown > 0 ? "unknown" : "operational";
    heading = `Your stack · ${sev.operational}/${sev.total} operational${worst === "operational" ? "" : ` · ${worst}`}`;
  }

  return (
    <div className="ap-inset ap-health" data-testid="health-list" data-stack={stack ? stack.length : 0}>
      <div className="ap-inset__head ap-inset__head--split">
        <span data-testid="health-heading">{heading}</span>
        <span>
          {STATUS_PAGES} status pages{checked ? ` · checked ${checked}` : ""}
        </span>
      </div>
      <StackPicker stack={stack} onChange={setStack} />
      {incidentsFirst(mine).map((r) => (
        <ToolHealthCard key={r.tool.id} config={r.tool} data={r.data} />
      ))}
      {others.length > 0 && (
        <>
          <div className="ap-stack__divider" data-testid="stack-others">
            Not in your stack · {others.length} · still tracked, nothing hidden
          </div>
          {incidentsFirst(others).map((r) => (
            <ToolHealthCard key={r.tool.id} config={r.tool} data={r.data} />
          ))}
        </>
      )}
    </div>
  );
}
