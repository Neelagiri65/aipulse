"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "ap.filter-panel-open";

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
  const [open, setOpen] = useState(true);

  // Hydrate from localStorage on mount so the user's collapse preference
  // persists across reloads. SSR-safe: useEffect only runs client-side.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "0") setOpen(false);
    } catch {
      // localStorage unavailable (private mode etc.) — keep default open.
    }
  }, []);

  const setOpenPersist = (next: boolean) => {
    setOpen(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // ignore quota / disabled storage
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpenPersist(true)}
        aria-label="Show filters"
        title="Show filters"
        className="ap-filter-panel-trigger fixed right-3 z-40 ap-panel-surface flex h-10 items-center gap-2 px-3 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground/90 transition-colors hover:text-[var(--ap-accent)] border border-[var(--ap-accent)]/40 shadow-[0_0_12px_-4px_rgba(45,212,191,0.4)]"
        style={{ top: 100 }}
      >
        <FunnelIcon />
        <span>Show filters</span>
        <span aria-hidden style={{ fontSize: "13px" }}>‹</span>
      </button>
    );
  }

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
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] flex-1"
            style={{ color: "var(--ap-fg)" }}
          >
            Filter
          </span>
          <button
            type="button"
            onClick={() => setOpenPersist(false)}
            aria-label="Hide filters"
            title="Hide filters"
            className="flex h-6 items-center gap-1 rounded px-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <span>Hide</span>
            <span aria-hidden style={{ fontSize: "12px" }}>›</span>
          </button>
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
        <button
          type="button"
          onClick={() => setOpenPersist(false)}
          aria-label="Hide filters"
          title="Hide filters"
          className="flex w-full flex-col items-center justify-center gap-0.5 border-b border-border/60 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          style={{ height: 40 }}
        >
          <FunnelIcon />
          <span aria-hidden style={{ fontSize: "11px", lineHeight: 1 }}>›</span>
        </button>
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

/**
 * Live-event filter shape. Pure: same input → same output.
 *
 * Lives here (not in Dashboard.tsx) so the rule set is unit-testable
 * and so future changes to filter semantics don't drift across the
 * map + globe + wire surfaces. The filter is *additive*:
 *   - `ai-config-only` excludes points that don't carry hasAiConfig.
 *   - Every event must map to one of the 6 type buckets via
 *     `eventTypeToFilterId`. Unmapped types are dropped (honest-
 *     filter contract — no checkbox-less event should leak through).
 *   - The mapped type's checkbox must be on.
 *
 * Critical: this filter applies ONLY to live GH events. Registry,
 * HN, labs, and RSS layers are filtered separately by their own
 * top-level toggles in Dashboard. ai-config-only is intentionally
 * NOT applied to the registry layer because every registry entry
 * already has hasAiConfig=true by definition.
 */
export type LiveEventMeta = {
  type?: string;
  hasAiConfig?: boolean;
};

export type LiveEventLike<TMeta = LiveEventMeta> = {
  meta?: TMeta;
};

export function filterLivePoints<T extends LiveEventLike>(
  points: T[],
  filters: FilterState,
): T[] {
  return points.filter((p) => {
    const meta = p.meta as LiveEventMeta | undefined;
    if (filters["ai-config-only"] && !meta?.hasAiConfig) return false;
    const fid = eventTypeToFilterId(meta?.type);
    if (!fid) return false;
    if (!filters[fid]) return false;
    return true;
  });
}

/**
 * Six event-type filter ids. Kept as a runtime constant so the toggle
 * helper + the empty-state detector both iterate the same set —
 * adding a 7th type bucket only requires updating this one place.
 *
 * `as const` narrows the type so consumers can use
 * `(typeof EVENT_TYPE_FILTER_IDS)[number]` to get the union of just
 * the six type ids (used by MapLegend's TYPE_LABEL / TYPE_COLOR).
 */
export const EVENT_TYPE_FILTER_IDS = [
  "push",
  "pr",
  "issue",
  "release",
  "fork",
  "watch",
] as const satisfies ReadonlyArray<FilterLayerId>;

export type EventTypeFilterId = (typeof EVENT_TYPE_FILTER_IDS)[number];

/**
 * Apply a single filter toggle, returning the new state.
 *
 * Special-cased semantics for ai-config-only: when flipped from OFF
 * to ON, the helper also enables every event-type checkbox. The user
 * intent on toggling "AI-config only" is "show me AI-config repos",
 * not "show me AI-config repos *of types I have ticked*". Forcing the
 * user to also know which event-type checkboxes must be on is a
 * hidden dependency the UI doesn't surface.
 *
 * Disabling ai-config-only does NOT touch event-type state — the
 * user might have curated specific buckets, and we want re-disabling
 * the signal filter to be reversible without losing their selection.
 *
 * Every other toggle is a plain boolean flip.
 */
export function applyFilterToggle(
  state: FilterState,
  id: FilterLayerId,
): FilterState {
  const next: FilterState = { ...state, [id]: !state[id] };
  if (id === "ai-config-only" && next["ai-config-only"] === true) {
    for (const t of EVENT_TYPE_FILTER_IDS) next[t] = true;
  }
  return next;
}

/**
 * True when ai-config-only is checked but every event-type bucket is
 * off, i.e. the live-events filter chain returns nothing because
 * there's no type-bucket left to keep. Drives a one-line note above
 * the map so the user sees why the AI-config layer reads empty.
 */
export function isAiConfigStranded(filters: FilterState): boolean {
  if (!filters["ai-config-only"]) return false;
  return EVENT_TYPE_FILTER_IDS.every((t) => !filters[t]);
}
