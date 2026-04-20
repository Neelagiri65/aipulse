"use client";

export type FilterLayerId =
  | "push"
  | "pr"
  | "issue"
  | "release"
  | "fork"
  | "watch"
  | "ai-config-only"
  | "ai-labs";

export type FilterState = Record<FilterLayerId, boolean>;

export const DEFAULT_FILTERS: FilterState = {
  push: true,
  pr: true,
  issue: true,
  release: true,
  fork: true,
  watch: true,
  "ai-config-only": false,
  // Labs default ON: the whole layer's point is to show where the
  // named AI labs are. Users who want pure GH-event density can opt
  // out; most land on the globe wanting to see both.
  "ai-labs": true,
};

type Layer = {
  id: FilterLayerId;
  label: string;
  color: string;
  category: "Event types" | "Signal" | "Layers";
};

const LAYERS: Layer[] = [
  { id: "push", label: "Push", color: "#2dd4bf", category: "Event types" },
  { id: "pr", label: "Pull requests", color: "#60a5fa", category: "Event types" },
  { id: "issue", label: "Issues", color: "#a78bfa", category: "Event types" },
  { id: "release", label: "Releases", color: "#f59e0b", category: "Event types" },
  { id: "fork", label: "Forks", color: "#4ade80", category: "Event types" },
  { id: "watch", label: "Stars", color: "#fbbf24", category: "Event types" },
  {
    id: "ai-config-only",
    label: "AI-config only",
    color: "#2dd4bf",
    category: "Signal",
  },
  {
    id: "ai-labs",
    label: "AI Labs",
    color: "#a855f7",
    category: "Layers",
  },
];

export type FilterPanelProps = {
  filters: FilterState;
  onToggle: (id: FilterLayerId) => void;
  onReset: () => void;
};

/**
 * Right-edge fixed filter panel. Always visible (unlike the Win chrome
 * panels toggled from LeftNav). Toggles are consumed upstream to filter
 * the globe's points in place — no separate "run filter" button.
 */
export function FilterPanel({ filters, onToggle, onReset }: FilterPanelProps) {
  const cats: Layer["category"][] = ["Event types", "Signal", "Layers"];
  return (
    <aside
      className="fixed right-3 z-40 ap-panel-surface"
      style={{ top: 72, width: 220 }}
      aria-label="Globe filters"
    >
      <header className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
        <FunnelIcon />
        <span
          className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: "var(--ap-fg)" }}
        >
          Filter
        </span>
      </header>
      <div className="space-y-4 p-3">
        {cats.map((cat) => (
          <div key={cat}>
            <div
              className="mb-2 font-mono text-[9px] uppercase"
              style={{ color: "var(--ap-fg-dim)", letterSpacing: "0.14em" }}
            >
              {cat}
            </div>
            <div className="space-y-1.5">
              {LAYERS.filter((l) => l.category === cat).map((layer) => (
                <FilterRow
                  key={layer.id}
                  layer={layer}
                  enabled={filters[layer.id]}
                  onToggle={() => onToggle(layer.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <footer className="flex items-center gap-2 border-t border-border/60 p-3">
        <button
          type="button"
          onClick={onReset}
          className="flex-1 rounded-sm border border-border/60 px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          Reset
        </button>
      </footer>
    </aside>
  );
}

function FilterRow({
  layer,
  enabled,
  onToggle,
}: {
  layer: Layer;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-0.5">
      <span
        role="checkbox"
        aria-checked={enabled}
        onClick={onToggle}
        className="flex h-[14px] w-[14px] shrink-0 items-center justify-center transition-all"
        style={{
          border: `1px solid ${enabled ? layer.color : "var(--ap-border-strong)"}`,
          background: enabled ? layer.color : "var(--ap-bg)",
          borderRadius: 2,
        }}
      >
        {enabled && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0a0e14" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: layer.color }}
      />
      <span
        className="font-mono text-[10px] uppercase"
        style={{
          color: enabled ? "var(--ap-fg)" : "var(--ap-fg-dim)",
          letterSpacing: "0.1em",
        }}
      >
        {layer.label}
      </span>
    </label>
  );
}

function FunnelIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--ap-fg-muted)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

/** Map a GitHub event type string to our internal filter id. */
export function eventTypeToFilterId(type?: string): FilterLayerId | null {
  switch (type) {
    case "PushEvent":
      return "push";
    case "PullRequestEvent":
      return "pr";
    case "IssuesEvent":
      return "issue";
    case "ReleaseEvent":
      return "release";
    case "ForkEvent":
      return "fork";
    case "WatchEvent":
      return "watch";
    default:
      return null;
  }
}
