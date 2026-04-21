import { ToolHealthCard } from "./ToolHealthCard";
import { TOOLS, type ToolHealthData } from "./tools";

export type HealthCardGridProps = {
  /** Map of tool id → live health data. Missing keys render awaiting/pending state. */
  data?: Partial<Record<(typeof TOOLS)[number]["id"], ToolHealthData>>;
  /**
   * FIX-02 — when the Tools panel is maximised, pin the grid to 2 columns
   * (spec-prescribed). The auto-fit rule would land at 3 columns at 80%
   * of a 1440 viewport, which made card bodies read too narrow for the
   * incident list + sparkline stack. Default is the restored-panel
   * behaviour: auto-fit between 300px and 1fr so a single-column panel
   * reflows to 2 on resize.
   */
  maximized?: boolean;
};

export function HealthCardGrid({ data, maximized }: HealthCardGridProps) {
  const gridClass = maximized
    ? "grid gap-3 grid-cols-1 md:grid-cols-2"
    : "grid gap-3 grid-cols-[repeat(auto-fit,minmax(300px,1fr))]";
  return (
    <div className={gridClass}>
      {TOOLS.map((tool) => (
        <ToolHealthCard key={tool.id} config={tool} data={data?.[tool.id]} />
      ))}
    </div>
  );
}
