import { ToolHealthCard } from "./ToolHealthCard";
import { TOOLS, type ToolHealthData } from "./tools";

export type HealthCardGridProps = {
  /** Map of tool id → live health data. Missing keys render awaiting/pending state. */
  data?: Partial<Record<(typeof TOOLS)[number]["id"], ToolHealthData>>;
};

export function HealthCardGrid({ data }: HealthCardGridProps) {
  return (
    <div className="grid gap-3">
      {TOOLS.map((tool) => (
        <ToolHealthCard key={tool.id} config={tool} data={data?.[tool.id]} />
      ))}
    </div>
  );
}
