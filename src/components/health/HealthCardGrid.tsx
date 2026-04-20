import { ToolHealthCard } from "./ToolHealthCard";
import { TOOLS, type ToolHealthData } from "./tools";

export type HealthCardGridProps = {
  /** Map of tool id → live health data. Missing keys render awaiting/pending state. */
  data?: Partial<Record<(typeof TOOLS)[number]["id"], ToolHealthData>>;
};

export function HealthCardGrid({ data }: HealthCardGridProps) {
  // Auto-fit grid: 1 column at default panel width (~340px usable),
  // reflows to 2–3 columns when the panel is resized or maximised so
  // cards don't stretch into comically-wide single-column rows.
  return (
    <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
      {TOOLS.map((tool) => (
        <ToolHealthCard key={tool.id} config={tool} data={data?.[tool.id]} />
      ))}
    </div>
  );
}
