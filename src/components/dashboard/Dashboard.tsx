"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Globe, type GlobePoint } from "@/components/globe/Globe";
import { HealthCardGrid } from "@/components/health/HealthCardGrid";
import { LiveFeed } from "@/components/dashboard/LiveFeed";
import { MetricTicker } from "@/components/dashboard/MetricTicker";
import { MetricsRow } from "@/components/dashboard/MetricsRow";
import { WirePage, type WireItem } from "@/components/dashboard/WirePage";
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
import type { ModelsResult } from "@/lib/data/fetch-models";
import type { ResearchResult } from "@/lib/data/fetch-research";
import type { HnWireResult } from "@/lib/data/wire-hn";
import {
  decayScore,
  type RegistryEntry,
  type RegistryMeta,
} from "@/lib/data/registry-shared";
import { ModelsPanel } from "@/components/models/ModelsPanel";
import { ResearchPanel } from "@/components/research/ResearchPanel";
import { BenchmarksPanel } from "@/components/benchmarks/BenchmarksPanel";
import type { BenchmarksPayload } from "@/lib/data/benchmarks-lmarena";

const STATUS_POLL_MS = 5 * 60 * 1000;
const EVENTS_POLL_MS = 30 * 1000;
// Registry is long-lived + CDN-cached for 5min. Polling every 2min keeps
// the base layer fresh without hammering the endpoint — registry only
// grows every 6h (cron) so sub-minute cadence would be wasteful.
const REGISTRY_POLL_MS = 2 * 60 * 1000;
// Models: HF downloads move on weeks; 10-min poll is well above the
// 15-min server cache TTL so every visible update reflects a real
// upstream refresh rather than churn.
const MODELS_POLL_MS = 10 * 60 * 1000;
// Research: arxiv publishes a daily batch around 20:00 UTC; paper list
// churns in minutes-on-the-hour only. 15-min poll sits above the
// 30-min server cache TTL so the UI catches every real upstream flip
// without hitting arxiv more than once per TTL.
const RESEARCH_POLL_MS = 15 * 60 * 1000;
// HN: ingest cron runs every 15min; /api/hn CDN-caches 60s. Poll at
// 60s so the UI flips to a fresh upstream each minute when available
// without hammering the edge layer.
const HN_POLL_MS = 60 * 1000;
// Benchmarks: lmarena-ai refreshes its dataset at most once per day,
// our cron commits at 03:15 UTC. /api/benchmarks is a force-static
// route revalidating hourly. 30-min client poll catches any real flip
// without churning the edge cache.
const BENCHMARKS_POLL_MS = 30 * 60 * 1000;

type RegistryResult = {
  ok: boolean;
  entries: RegistryEntry[];
  meta: RegistryMeta | null;
  generatedAt: string;
};

type PanelId = "wire" | "tools" | "models" | "research" | "benchmarks";

export function Dashboard() {
  const status = usePolledEndpoint<StatusResult>("/api/status", STATUS_POLL_MS);
  const events = usePolledEndpoint<GlobeEventsResult>(
    "/api/globe-events",
    EVENTS_POLL_MS,
  );
  const registry = usePolledEndpoint<RegistryResult>(
    "/api/registry",
    REGISTRY_POLL_MS,
  );
  const models = usePolledEndpoint<ModelsResult>("/api/models", MODELS_POLL_MS);
  const research = usePolledEndpoint<ResearchResult>(
    "/api/research",
    RESEARCH_POLL_MS,
  );
  const hn = usePolledEndpoint<HnWireResult>("/api/hn", HN_POLL_MS);
  const benchmarks = usePolledEndpoint<BenchmarksPayload>(
    "/api/benchmarks",
    BENCHMARKS_POLL_MS,
  );

  const rawPoints: GlobePoint[] = events.data?.points ?? [];
  const lastUpdatedAt = events.data?.polledAt;

  // Map registry entries → base-layer GlobePoints.
  //   - Entries without a resolved location are dropped (can't plot
  //     without lat/lng; trust contract says no made-up coords).
  //   - Each registry point carries kind="registry", decayScore, and
  //     the config kinds that verified the repo — enough for the
  //     EventCard's RegistryRow to render context on hover.
  //   - hasAiConfig = true by definition (every registry entry has ≥1
  //     verified config file), so filters["ai-config-only"] keeps the
  //     entire registry layer when toggled on.
  const registryPoints: GlobePoint[] = (registry.data?.entries ?? [])
    .filter((e) => e.location && Number.isFinite(e.location.lat))
    .map((e) => {
      const decay = decayScore(e.lastActivity);
      const kinds = e.configs.map((c) => c.kind);
      return {
        lat: e.location!.lat,
        lng: e.location!.lng,
        color: "#cbd5e1",
        size: 0.4,
        meta: {
          kind: "registry",
          fullName: e.fullName,
          repo: e.fullName,
          stars: e.stars,
          language: e.language,
          description: e.description,
          lastActivity: e.lastActivity,
          decayScore: decay,
          configKinds: kinds,
          locationLabel: e.location!.label,
          hasAiConfig: true,
        },
      };
    });

  // Globe filters — client-side only. Filter the point list before it
  // reaches the globe; coverage/count in CoverageBadge stays honest to
  // the upstream pipeline (so the filter doesn't mask real data).
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const toggleFilter = (id: FilterLayerId) =>
    setFilters((f) => ({ ...f, [id]: !f[id] }));
  const resetFilters = () => setFilters(DEFAULT_FILTERS);
  const livePoints = rawPoints.filter((p) => {
    const meta = p.meta as { type?: string; hasAiConfig?: boolean } | undefined;
    if (filters["ai-config-only"] && !meta?.hasAiConfig) return false;
    const fid = eventTypeToFilterId(meta?.type);
    if (fid && !filters[fid]) return false;
    return true;
  });

  // Dedup: if a registry repo also has a live event in the current
  // window, keep only the live event — it's the stronger signal and
  // its card row includes a live pill. RegistryRow would be redundant.
  const liveRepoSet = new Set<string>();
  for (const p of livePoints) {
    const repo = (p.meta as { repo?: string } | undefined)?.repo;
    if (repo) liveRepoSet.add(repo);
  }
  const dedupedRegistry = registryPoints.filter((p) => {
    const fn = (p.meta as { fullName?: string } | undefined)?.fullName;
    return !fn || !liveRepoSet.has(fn);
  });

  // Registry layer respects the ai-config-only filter (tautologically
  // true — every registry entry has AI config) but not event-type
  // filters (registry points have no `type`). Registry is the base
  // map; event-type filters only narrow the live pulse layer.
  //
  // HN points carry kind="hn" + locationLabel from the author's HN
  // profile. FlatMap + Globe detect kind and render them in HN orange.
  // No filter applied: HN is a parallel signal (community discussion,
  // not GH activity), so event-type + ai-config filters don't apply.
  const hnPoints: GlobePoint[] = hn.data?.points ?? [];
  const points: GlobePoint[] = [...livePoints, ...dedupedRegistry, ...hnPoints];

  // Pre-merge GH events + HN stories into a single chronological wire
  // list. Both surfaces (WirePage + downstream map/globe) share this
  // derivation so a row visible in the feed corresponds exactly to the
  // dot on the map when geocoded.
  const wireRows: WireItem[] = useMemo(() => {
    const ghRows: WireItem[] = (events.data?.points ?? [])
      .map((p): WireItem | null => {
        const m = p.meta as
          | {
              eventId?: string;
              type?: string;
              actor?: string;
              repo?: string;
              createdAt?: string;
              hasAiConfig?: boolean;
              sourceKind?: "events-api" | "gharchive";
            }
          | undefined;
        if (
          !m ||
          typeof m.eventId !== "string" ||
          typeof m.type !== "string" ||
          typeof m.actor !== "string" ||
          typeof m.repo !== "string" ||
          typeof m.createdAt !== "string"
        ) {
          return null;
        }
        return {
          kind: "gh",
          eventId: m.eventId,
          type: m.type,
          actor: m.actor,
          repo: m.repo,
          createdAt: m.createdAt,
          hasAiConfig: Boolean(m.hasAiConfig),
          sourceKind: m.sourceKind,
        };
      })
      .filter((r): r is WireItem => r !== null);
    const hnRows: WireItem[] = (hn.data?.items ?? []).map((i) => ({
      kind: "hn",
      id: i.id,
      createdAt: i.createdAt,
      title: i.title,
      author: i.author,
      points: i.points,
      numComments: i.numComments,
      hnUrl: `https://news.ycombinator.com/item?id=${i.id}`,
      locationLabel: i.locationLabel,
    }));
    return [...ghRows, ...hnRows].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }, [events.data, hn.data]);

  // View tab state. Default to the flat map — its progressive-resolution
  // tiles stay crisp at every zoom level, where the 3D globe texture goes
  // grainy. Globe stays as a secondary view; Wire is the chronological
  // feed without any geospatial stage.
  const [activeTab, setActiveTab] = useState<ViewTabId>("map");

  // Floating panel layout state. Models starts closed so the default
  // view on first load is the same three-surface layout (wire + tools)
  // the existing users know; Models opens on demand via the left nav.
  const [panels, setPanels] = useState<Record<PanelId, { open: boolean; min: boolean }>>(
    {
      wire: { open: true, min: false },
      tools: { open: true, min: false },
      models: { open: false, min: false },
      research: { open: false, min: false },
      benchmarks: { open: false, min: false },
    },
  );
  const [zorder, setZorder] = useState<PanelId[]>([
    "wire",
    "tools",
    "models",
    "research",
    "benchmarks",
  ]);
  const [maxId, setMaxId] = useState<PanelId | null>(null);

  // Initial panel positions — set after mount (window-relative). Moved
  // right to sit inside the viewport once the left rail claims 44px.
  const [initialPos, setInitialPos] = useState<{
    wire: { x: number; y: number; w: number; h: number };
    tools: { x: number; y: number; w: number; h: number };
    models: { x: number; y: number; w: number; h: number };
    research: { x: number; y: number; w: number; h: number };
    benchmarks: { x: number; y: number; w: number; h: number };
  } | null>(null);
  useEffect(() => {
    const W = typeof window !== "undefined" ? window.innerWidth : 1440;
    setInitialPos({
      wire: { x: 64, y: 72, w: 380, h: 540 },
      tools: { x: Math.max(460, W - 420), y: 72, w: 376, h: 540 },
      // Models floats slightly down-left of Tools so opening it doesn't
      // stack directly on top of the default layout. Still anchored to
      // the right half; Wire owns the left.
      models: { x: Math.max(440, W - 440), y: 132, w: 376, h: 520 },
      // Research opens beside Wire on the left half so paper rows (long
      // titles) get comfortable width without clashing with Models on
      // the right. Staggered y=160 so a two-panel open doesn't stack.
      research: { x: 92, y: 160, w: 420, h: 540 },
      // Benchmarks is a 7-column table — needs a wider default than
      // Models. Centres on the viewport so it reads as the "rank table"
      // view; staggered y=200 so opening alongside Wire/Tools doesn't
      // stack on top of either.
      benchmarks: {
        x: Math.max(120, Math.floor((W - 540) / 2)),
        y: 200,
        w: 540,
        h: 560,
      },
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
    {
      id: "models",
      label: "Models",
      icon: "models",
      count: models.data?.models.length ?? null,
    },
    { id: "agents", label: "Agents", icon: "agents", soon: true },
    {
      id: "research",
      label: "Research",
      icon: "research",
      count: research.data?.papers.length ?? null,
    },
    {
      id: "benchmarks",
      label: "Benchmarks",
      icon: "benchmarks",
      count:
        benchmarks.data && benchmarks.data.ok
          ? benchmarks.data.rows.length
          : null,
    },
    { id: "audit", label: "Audit", icon: "audit" },
  ];

  const focus = (id: PanelId) =>
    setZorder((z) => [...z.filter((x) => x !== id), id]);

  const toggle = (id: string) => {
    if (id === "audit") {
      window.location.href = "/audit";
      return;
    }
    if (
      id !== "wire" &&
      id !== "tools" &&
      id !== "models" &&
      id !== "research" &&
      id !== "benchmarks"
    )
      return;
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
            wireRows={wireRows}
            ghCoverage={
              events.data
                ? {
                    windowMinutes: events.data.coverage.windowMinutes,
                    windowSize: events.data.coverage.windowSize,
                  }
                : undefined
            }
            hnMeta={hn.data?.meta}
            polledAt={events.data?.polledAt}
            error={events.error}
            isInitialLoading={events.isInitialLoading && hn.isInitialLoading}
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

          {initialPos && panels.models.open && (
            <Win
              id="models"
              title="Top models · hf-downloads"
              initial={initialPos.models}
              zIndex={z("models")}
              minimized={panels.models.min}
              maximized={maxId === "models"}
              onFocus={() => focus("models")}
              onClose={() =>
                setPanels((p) => ({ ...p, models: { open: false, min: false } }))
              }
              onMinimize={() =>
                setPanels((p) => ({
                  ...p,
                  models: { ...p.models, min: !p.models.min },
                }))
              }
              onMaximize={() => setMaxId((m) => (m === "models" ? null : "models"))}
            >
              <ModelsPanel
                data={models.data}
                error={models.error}
                isInitialLoading={models.isInitialLoading}
              />
            </Win>
          )}

          {initialPos && panels.research.open && (
            <Win
              id="research"
              title="Recent papers · arxiv"
              initial={initialPos.research}
              zIndex={z("research")}
              minimized={panels.research.min}
              maximized={maxId === "research"}
              onFocus={() => focus("research")}
              onClose={() =>
                setPanels((p) => ({
                  ...p,
                  research: { open: false, min: false },
                }))
              }
              onMinimize={() =>
                setPanels((p) => ({
                  ...p,
                  research: { ...p.research, min: !p.research.min },
                }))
              }
              onMaximize={() =>
                setMaxId((m) => (m === "research" ? null : "research"))
              }
            >
              <ResearchPanel
                data={research.data}
                error={research.error}
                isInitialLoading={research.isInitialLoading}
              />
            </Win>
          )}

          {initialPos && panels.benchmarks.open && (
            <Win
              id="benchmarks"
              title="Chatbot Arena · top 20 · lmarena-leaderboard"
              initial={initialPos.benchmarks}
              zIndex={z("benchmarks")}
              minimized={panels.benchmarks.min}
              maximized={maxId === "benchmarks"}
              onFocus={() => focus("benchmarks")}
              onClose={() =>
                setPanels((p) => ({
                  ...p,
                  benchmarks: { open: false, min: false },
                }))
              }
              onMinimize={() =>
                setPanels((p) => ({
                  ...p,
                  benchmarks: { ...p.benchmarks, min: !p.benchmarks.min },
                }))
              }
              onMaximize={() =>
                setMaxId((m) => (m === "benchmarks" ? null : "benchmarks"))
              }
            >
              <BenchmarksPanel
                data={benchmarks.data}
                error={benchmarks.error}
                isInitialLoading={benchmarks.isInitialLoading}
              />
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

