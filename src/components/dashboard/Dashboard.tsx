"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Globe, type GlobePoint } from "@/components/globe/Globe";
import { HealthCardGrid } from "@/components/health/HealthCardGrid";
import { LiveFeed } from "@/components/dashboard/LiveFeed";
import { MetricTicker } from "@/components/dashboard/MetricTicker";
import { MetricsRow } from "@/components/dashboard/MetricsRow";
import { WirePage } from "@/components/dashboard/WirePage";
import { TopBar, type ViewTabId } from "@/components/chrome/TopBar";

// Leaflet is client-only (touches `window` at import). Lazy-load with
// ssr:false so the map bundle + its CSS only ship to the browser.
const FlatMap = dynamic(
  () => import("@/components/map/FlatMap").then((m) => m.FlatMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center font-mono text-xs text-muted-foreground">
        Loading map…
      </div>
    ),
  },
);
import { Win } from "@/components/chrome/Win";
import { LeftNav, type NavItem } from "@/components/chrome/LeftNav";
import {
  FilterPanel,
  DEFAULT_FILTERS,
  eventTypeToFilterId,
  type FilterLayerId,
  type FilterState,
} from "@/components/chrome/FilterPanel";
import { usePolledEndpoint } from "@/lib/hooks/use-polled-endpoint";
import { PENDING_SOURCES, VERIFIED_SOURCES } from "@/lib/data-sources";
import type { GlobeEventsResult } from "@/lib/data/fetch-events";
import type { StatusResult } from "@/lib/data/fetch-status";

const STATUS_POLL_MS = 5 * 60 * 1000;
const EVENTS_POLL_MS = 30 * 1000;

type PanelId = "wire" | "tools";

export function Dashboard() {
  const status = usePolledEndpoint<StatusResult>("/api/status", STATUS_POLL_MS);
  const events = usePolledEndpoint<GlobeEventsResult>(
    "/api/globe-events",
    EVENTS_POLL_MS,
  );

  const rawPoints: GlobePoint[] = events.data?.points ?? [];
  const lastUpdatedAt = events.data?.polledAt;

  // Globe filters — client-side only. Filter the point list before it
  // reaches the globe; coverage/count in CoverageBadge stays honest to
  // the upstream pipeline (so the filter doesn't mask real data).
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const toggleFilter = (id: FilterLayerId) =>
    setFilters((f) => ({ ...f, [id]: !f[id] }));
  const resetFilters = () => setFilters(DEFAULT_FILTERS);
  const points = rawPoints.filter((p) => {
    const meta = p.meta as { type?: string; hasAiConfig?: boolean } | undefined;
    if (filters["ai-config-only"] && !meta?.hasAiConfig) return false;
    const fid = eventTypeToFilterId(meta?.type);
    if (fid && !filters[fid]) return false;
    return true;
  });

  // View tab state. Default to the flat map — its progressive-resolution
  // tiles stay crisp at every zoom level, where the 3D globe texture goes
  // grainy. Globe stays as a secondary view; Wire is the chronological
  // feed without any geospatial stage.
  const [activeTab, setActiveTab] = useState<ViewTabId>("map");

  // Floating panel layout state
  const [panels, setPanels] = useState<Record<PanelId, { open: boolean; min: boolean }>>(
    { wire: { open: true, min: false }, tools: { open: true, min: false } },
  );
  const [zorder, setZorder] = useState<PanelId[]>(["wire", "tools"]);
  const [maxId, setMaxId] = useState<PanelId | null>(null);

  // Initial panel positions — set after mount (window-relative). Moved
  // right to sit inside the viewport once the left rail claims 44px.
  const [initialPos, setInitialPos] = useState<{
    wire: { x: number; y: number; w: number; h: number };
    tools: { x: number; y: number; w: number; h: number };
  } | null>(null);
  useEffect(() => {
    const W = typeof window !== "undefined" ? window.innerWidth : 1440;
    setInitialPos({
      wire: { x: 64, y: 72, w: 380, h: 540 },
      tools: { x: Math.max(460, W - 420), y: 72, w: 376, h: 540 },
    });
  }, []);

  const navItems: NavItem[] = [
    {
      id: "wire",
      label: "Wire",
      icon: "wire",
      count: events.data?.coverage.windowSize ?? null,
      hot: (events.data?.coverage.windowSize ?? 0) > 0,
    },
    {
      id: "tools",
      label: "Tools",
      icon: "tools",
      count: status.data ? Object.keys(status.data.data).length : null,
    },
    { id: "models", label: "Models", icon: "models", soon: true },
    { id: "agents", label: "Agents", icon: "agents", soon: true },
    { id: "research", label: "Research", icon: "research", soon: true },
    { id: "audit", label: "Audit", icon: "audit" },
  ];

  const focus = (id: PanelId) =>
    setZorder((z) => [...z.filter((x) => x !== id), id]);

  const toggle = (id: string) => {
    if (id === "audit") {
      window.location.href = "/audit";
      return;
    }
    if (id !== "wire" && id !== "tools") return;
    const pid = id as PanelId;
    setPanels((p) => {
      const cur = p[pid];
      const next =
        cur.open && !cur.min
          ? { open: false, min: false }
          : { open: true, min: false };
      return { ...p, [pid]: next };
    });
    focus(pid);
  };

  const openIds = new Set<string>(
    (Object.keys(panels) as PanelId[])
      .filter((id) => panels[id].open && !panels[id].min)
      .map(String),
  );

  const z = (id: PanelId) => 30 + zorder.indexOf(id);

  return (
    <>
      <TopBar
        status={status.data}
        freshness={{
          isInitialLoading: status.isInitialLoading,
          lastSuccessAt: status.lastSuccessAt,
          intervalMs: STATUS_POLL_MS,
          error: status.error,
        }}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Grid lattice overlay — decorative, above globe but below chrome. */}
      <div className="ap-stage-grid" aria-hidden />

      {/* Full-viewport stage. MAP (default) and GLOBE render a geospatial
          canvas behind floating chrome; WIRE swaps in a full-screen
          chronological feed. CoverageBadge hovers over both map + globe
          so the transparency contract stays visible regardless of view. */}
      <div
        className="fixed inset-0"
        style={{ paddingTop: 48, paddingBottom: 168, zIndex: 3 }}
      >
        {activeTab === "map" && (
          <div className="relative h-full w-full">
            <FlatMap points={points} lastUpdatedAt={lastUpdatedAt} />
            <CoverageBadge events={events.data} />
          </div>
        )}
        {activeTab === "globe" && (
          <div className="relative h-full w-full">
            <Globe points={points} lastUpdatedAt={lastUpdatedAt} />
            <CoverageBadge events={events.data} />
          </div>
        )}
        {activeTab === "wire" && (
          <WirePage
            events={events.data}
            error={events.error}
            isInitialLoading={events.isInitialLoading}
          />
        )}
      </div>

      {/* Left-edge icon nav */}
      <LeftNav items={navItems} openIds={openIds} onToggle={toggle} />

      {/* Right-edge filter panel — renders on both map + globe (they share
          the filtered point set). Wire view has its own filter semantics. */}
      {(activeTab === "map" || activeTab === "globe") && (
        <FilterPanel
          filters={filters}
          onToggle={toggleFilter}
          onReset={resetFilters}
        />
      )}

      {/* Floating panels — renders on map + globe (geospatial views where
          side panels add context). Wire is its own full-screen feed, so
          floating panels would be redundant. */}
      {(activeTab === "map" || activeTab === "globe") && (
        <>
          {initialPos && panels.wire.open && (
            <Win
              id="wire"
              title="Live feed · gh-events"
              initial={initialPos.wire}
              zIndex={z("wire")}
              minimized={panels.wire.min}
              maximized={maxId === "wire"}
              onFocus={() => focus("wire")}
              onClose={() =>
                setPanels((p) => ({ ...p, wire: { open: false, min: false } }))
              }
              onMinimize={() =>
                setPanels((p) => ({
                  ...p,
                  wire: { ...p.wire, min: !p.wire.min },
                }))
              }
              onMaximize={() => setMaxId((m) => (m === "wire" ? null : "wire"))}
            >
              <LiveFeed
                events={events.data}
                error={events.error}
                isInitialLoading={events.isInitialLoading}
              />
            </Win>
          )}

          {initialPos && panels.tools.open && (
            <Win
              id="tools"
              title="Tool health"
              initial={initialPos.tools}
              zIndex={z("tools")}
              minimized={panels.tools.min}
              maximized={maxId === "tools"}
              onFocus={() => focus("tools")}
              onClose={() =>
                setPanels((p) => ({ ...p, tools: { open: false, min: false } }))
              }
              onMinimize={() =>
                setPanels((p) => ({
                  ...p,
                  tools: { ...p.tools, min: !p.tools.min },
                }))
              }
              onMaximize={() => setMaxId((m) => (m === "tools" ? null : "tools"))}
            >
              <div className="p-3">
                <HealthCardGrid data={status.data?.data} />
                {status.error && (
                  <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-amber-400/80">
                    Status poll error: {status.error}
                  </p>
                )}
              </div>
            </Win>
          )}
        </>
      )}

      {/* Four-card glance row above the scrolling ticker. */}
      <MetricsRow
        status={status.data}
        events={events.data}
        statusLoading={status.isInitialLoading}
        eventsLoading={events.isInitialLoading}
      />

      {/* Bottom metric ticker — pinned below the stage. */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <MetricTicker
          status={status.data}
          events={events.data}
          verifiedSourceCount={VERIFIED_SOURCES.length}
          pendingSourceCount={PENDING_SOURCES.length}
          statusLoading={status.isInitialLoading}
          eventsLoading={events.isInitialLoading}
        />
      </div>
    </>
  );
}

function CoverageBadge({ events }: { events?: GlobeEventsResult }) {
  if (!events) return null;
  const { coverage } = events;
  if (coverage.windowSize === 0 && coverage.eventsReceived === 0) return null;
  return (
    <div className="pointer-events-none absolute bottom-4 right-4 rounded-md border border-border/40 bg-background/70 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
      <span className="text-foreground/80">{coverage.windowSize}</span> events ·{" "}
      {coverage.windowMinutes}m window · {coverage.locationCoveragePct}% placeable
    </div>
  );
}

