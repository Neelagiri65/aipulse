/**
 * Gawk — Tool health list (web v2 phase 3): one inset, incidents first. Rows whose state is an
 * exception (any incident, anything not operational, anything unmeasured) come first and open
 * their detail by default; working rows follow, collapsed. The head carries the count of status
 * pages behind the list and the time of the last poll. The name `HealthCardGrid` is kept so the
 * three call sites (desktop Health, the Tools window, the mobile shell) need no change.
 */

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

export function HealthCardGrid({ data, polledAt }: HealthCardGridProps) {
  const rows = TOOLS.map((tool) => ({ tool, data: data?.[tool.id], state: deriveRowState(tool, data?.[tool.id]) }));
  const exceptions = rows.filter((r) => r.state.exception);
  const working = rows.filter((r) => !r.state.exception);
  const checked = hhmmUtc(polledAt);
  return (
    <div className="ap-inset ap-health" data-testid="health-list">
      <div className="ap-inset__head ap-inset__head--split">
        <span>Tool health · incidents first</span>
        <span>
          {STATUS_PAGES} status pages{checked ? ` · checked ${checked}` : ""}
        </span>
      </div>
      {[...exceptions, ...working].map((r) => (
        <ToolHealthCard key={r.tool.id} config={r.tool} data={r.data} />
      ))}
    </div>
  );
}
