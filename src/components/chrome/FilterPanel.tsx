"use client";

export type FilterLayerId =
  | "push"
  | "pr"
  | "issue"
  | "release"
  | "fork"
  | "watch"
  | "ai-config-only"
  | "ai-labs"
  | "regional-rss"
  | "registry"
  | "hn";

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
  // Regional RSS default ON: same rationale as labs — the layer exists
  // to counterbalance the SV/English axis, so hiding it by default
  // would defeat the anti-bias purpose of including it at all.
  "regional-rss": true,
  // Registry default ON: 520+ curated repos are the "base map" that
  // makes empty-event windows still legible. Users who want pure live-
  // pulse density opt out via the toggle.
  registry: true,
  // HN default ON: community-discussion dots are the parallel signal
  // alongside GH activity. Users who want GH-only opt out here.
  hn: true,
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
  {
    id: "regional-rss",
    label: "Regional RSS",
    color: "#f97316",
    category: "Layers",
  },
  {
    // Registry dot colour matches Dashboard.tsx registryPoints `color`
    // (slate 300). Keeps the swatch honest to what lands on the map.
    id: "registry",
    label: "Registry",
    color: "#cbd5e1",
    category: "Layers",
  },
  {
    // HN brand orange — matches the rendered dot + pill in WirePage.
    id: "hn",
    label: "Hacker News",
    color: "#ff6600",
    category: "Layers",
  },
];

export type FilterPanelProps = {
  filters: FilterState;
  onToggle: (id: FilterLayerId) => void;
  onReset: () => void;
};

/**
 * Right-edge fixed filter panel. Part of the chrome, never dismissible
 * (docs/design-spec-v2.md → FIX-14). At ≥1440px renders as the full
 * 220px labelled panel; below 1440px collapses to a 44px icon rail
 * (coloured dot per layer, tooltip-on-hover, click still toggles) so
 * the map reclaims horizontal space on narrow desktops without losing
 * filter access.
 */
export function FilterPanel({ filters, onToggle, onReset }: FilterPanelProps) {
  const cats: Layer["category"][] = ["Event types", "Signal", "Layers"];
  return (
    <>
      {/* Full panel — 1440px+ only. The responsive swap uses two sibling
          DOM nodes rather than one element with conditional classes so
          each variant's internal markup can stay tailored to its density
          (labels vs. icons) without branching logic. */}
      <aside
        className="ap-filter-panel--full fixed right-3 z-40 ap-panel-surface"
        style={{ top: 100, width: 220 }}
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

      {/* Icon-only rail — shown below 1440px. Each layer is a 36px button
          with its coloured dot; tooltips via native `title`. Click still
          toggles. Reset pinned at the bottom as a ↺ glyph. */}
      <aside
        className="ap-filter-panel--icons fixed right-3 z-40 ap-panel-surface"
        style={{ top: 100, width: 44 }}
        aria-label="Globe filters"
      >
        <div
          className="flex items-center justify-center border-b border-border/60"
          style={{ height: 34 }}
          title="Filter"
        >
          <FunnelIcon />
        </div>
        <div className="flex flex-col items-center gap-1 py-2">
          {LAYERS.map((layer) => (
            <FilterIconButton
              key={layer.id}
              layer={layer}
              enabled={filters[layer.id]}
              onToggle={() => onToggle(layer.id)}
            />
          ))}
        </div>
        <div
          className="flex items-center justify-center border-t border-border/60 py-2"
        >
          <button
            type="button"
            onClick={onReset}
            title="Reset filters"
            aria-label="Reset filters"
            className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <ResetIcon />
          </button>
        </div>
      </aside>
    </>
  );
}

function FilterIconButton({
  layer,
  enabled,
  onToggle,
}: {
  layer: Layer;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={`${layer.label}${enabled ? "" : " (off)"}`}
      aria-label={layer.label}
      aria-pressed={enabled}
      className="flex h-7 w-7 items-center justify-center rounded-sm transition-all hover:bg-white/5"
      style={{
        opacity: enabled ? 1 : 0.35,
      }}
    >
      <span
        className="inline-block rounded-full"
        style={{
          width: 10,
          height: 10,
          background: layer.color,
          boxShadow: enabled ? `0 0 6px ${layer.color}` : "none",
        }}
      />
    </button>
  );
}

function ResetIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
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

/** Map a GitHub event type string to our internal filter id.
 *
 * The GH Events API emits ~20 event types; the panel exposes 6 buckets.
 * Auxiliary types are routed to the closest bucket so every live event
 * is gated by a checkbox — otherwise unchecking every filter would
 * still leave the map dotted (session-29 bug). Grouping:
 *  - IssueCommentEvent            → issue (GH treats PR comments as
 *                                    issue comments too; acceptable
 *                                    lossiness vs. splitting hairs).
 *  - PullRequestReviewEvent +
 *    PullRequestReviewCommentEvent → pr (review activity is PR work).
 *  - CreateEvent + DeleteEvent +
 *    CommitCommentEvent           → push (git-object mutations land
 *                                    closest to push activity).
 *
 * Unrecognised types return null and are dropped by the caller, keeping
 * the honest-filter contract forward-compatible.
 */
export function eventTypeToFilterId(type?: string): FilterLayerId | null {
  switch (type) {
    case "PushEvent":
    case "CreateEvent":
    case "DeleteEvent":
    case "CommitCommentEvent":
      return "push";
    case "PullRequestEvent":
    case "PullRequestReviewEvent":
    case "PullRequestReviewCommentEvent":
      return "pr";
    case "IssuesEvent":
    case "IssueCommentEvent":
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
