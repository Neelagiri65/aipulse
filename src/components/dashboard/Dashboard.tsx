"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, useSyncExternalStore, useRef } from "react";
import type { GlobePoint } from "@/components/globe/Globe";
import { HealthCardGrid } from "@/components/health/HealthCardGrid";
import { WorldBand } from "@/components/health/WorldBand";
import { BoardView } from "@/components/dashboard/BoardView";
import { HealthTiles } from "@/components/health/HealthTiles";
import { FeedView } from "@/components/feed/FeedView";
import { FeedModeSwitch } from "@/components/feed/FeedModeSwitch";
import { RoomsView } from "@/components/dashboard/RoomsView";
import { useCommunity } from "@/lib/community/use-community";
import { MoreView } from "@/components/dashboard/MoreView";
import {
  DEFAULT_FEED_VIEW,
  DEFAULT_TAB,
  feedViewFromSearch,
  tabFromSearch,
  writeFeedViewToUrl,
  writeTabToUrl,
  type FeedViewMode,
  type PrimaryTab,
  type BoardId,
  boardFromSearch,
  isBoardId,
  writeBoardToUrl,
} from "@/components/chrome/primary-tabs";

const subscribeNever = () => () => {};
import { LiveFeed } from "@/components/dashboard/LiveFeed";
import { MetricsRow } from "@/components/dashboard/MetricsRow";
import { WirePage, type WireItem } from "@/components/dashboard/WirePage";
import { TopBar } from "@/components/chrome/TopBar";
import { StatusBar, deriveSev } from "@/components/chrome/StatusBar";
import { HeroStrip } from "@/components/chrome/HeroStrip";
import { StatBar, type StatSegment } from "@/components/chrome/StatBar";
import {
  topCategoryCounts,
  topCountryCounts,
} from "@/lib/stats/panel-stats";

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
const EcosystemMap = dynamic(
  () => import("@/components/map/EcosystemMap").then((m) => m.EcosystemMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center font-mono text-xs text-muted-foreground">
        Loading ecosystem…
      </div>
    ),
  },
);
import { InsightLine } from "@/components/chrome/InsightLine";
import {
  wireInsight,
  modelsInsight,
  benchmarksInsight,
} from "@/lib/panels/insights";
import type { NavItem } from "@/components/chrome/nav-items";
import {
  FilterPanel,
  DEFAULT_FILTERS,
  applyFilterToggle,
  filterLivePoints,
  isAiConfigStranded,
  type FilterLayerId,
  type FilterState,
} from "@/components/chrome/FilterPanel";
import { LiveTicker } from "@/components/map/LiveTicker";
import {
  TopMoversLine,
  type RegionalDeltasDto,
} from "@/components/map/TopMoversLine";
import { MapLegend } from "@/components/chrome/MapLegend";
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
import type { LabsPayload } from "@/lib/data/fetch-labs";
import { labsToGlobePoints } from "@/components/labs/labs-to-points";
import { LabsPanel } from "@/components/labs/LabsPanel";
import type { RssWireResult } from "@/lib/data/wire-rss";
import { RegionalWirePanel } from "@/components/wire/RegionalWirePanel";
import { rssToGlobePoints } from "@/components/wire/rss-to-points";
import { SdkAdoptionPanel } from "@/components/panels/sdk-adoption/SdkAdoptionPanel";
import type { SdkAdoptionDto } from "@/lib/data/sdk-adoption";
import { ModelUsagePanel } from "@/components/panels/model-usage/ModelUsagePanel";
import type { ModelUsageDto } from "@/lib/data/openrouter-types";
import { AgentsPanel } from "@/components/panels/agents/AgentsPanel";
import type { AgentsViewDto } from "@/lib/data/agents-view";
import { LaunchesPanel } from "@/components/panels/launches/LaunchesPanel";
import type { ProductHuntResult } from "@/lib/data/fetch-producthunt";
import type { FeedResponse } from "@/lib/feed/types";
import { track } from "@/lib/analytics";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import { MobileDashboard } from "@/components/dashboard/MobileDashboard";
import { HighlightsStrip } from "@/components/dashboard/HighlightsStrip";
import {
  pickTopHighlights,
  type HighlightPanelId,
} from "@/lib/feed/highlights";

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
// Labs: /api/labs is CDN-cached for 30min and the upstream cron runs
// every 6h. 10-min client poll sits above the CDN TTL so each real
// upstream flip is picked up once, without churning the edge.
const LABS_POLL_MS = 10 * 60 * 1000;
const PRODUCTHUNT_POLL_MS = 10 * 60 * 1000;
// Regional RSS: upstream cron runs every 30min; /api/rss CDN-cached for
// 60s. 10-min client poll sits well above the CDN TTL so we catch every
// real upstream refresh without churning the edge layer — publisher
// feeds update slowly (often hourly), minute-level cadence is wasteful.
const RSS_POLL_MS = 10 * 60 * 1000;
// Cron health: a cron goes stale after 2× its expected interval. The
// fastest monitored cron is wire-ingest-hn at 15min (stale at 30min),
// so a 5-min poll catches the first stale transition within one tick.
const CRON_HEALTH_POLL_MS = 5 * 60 * 1000;
// SDK Adoption: route is CDN-cached for 5min (s-maxage=300) and the
// underlying snapshot cron only writes once a day. 5-min poll matches
// the cache TTL so each real upstream flip is picked up exactly once.
const SDK_ADOPTION_POLL_MS = 5 * 60 * 1000;
// Model Usage: cron writes every 6h. Match the 5-min CDN cache TTL —
// upstream rankings barely move minute-to-minute.
const MODEL_USAGE_POLL_MS = 5 * 60 * 1000;
// Agents: cron writes once daily at 06:30 UTC. Match the 5-min CDN
// cache TTL of /api/panels/agents — sub-minute polling would just
// thrash the edge layer with no fresher data.
const AGENTS_POLL_MS = 5 * 60 * 1000;
// Regional deltas: route reads the live LRANGE + yesterday's snapshot
// blob; the snapshot only updates once daily but the live current-24h
// component shifts every few minutes as new events land. 5-min poll
// matches the edge cache TTL of the route (s-maxage=300).
const REGIONAL_DELTAS_POLL_MS = 5 * 60 * 1000;
// Feed: composer is invoked per request and downstream caches sit at
// 60s (matches the mobile FeedView cadence). The desktop poll is here
// only to keep the highlights strip moving with the same heartbeat as
// the underlying snapshots — picking 60s avoids fighting the route TTL.
const FEED_POLL_MS = 60 * 1000;

type RegistryResult = {
  ok: boolean;
  entries: RegistryEntry[];
  meta: RegistryMeta | null;
  generatedAt: string;
};

type CronHealthResult = {
  total: number;
  healthy: number;
  stale: number;
  crons: Array<{
    workflow: string;
    stale: boolean;
    lastSuccessAt: string | null;
    itemsProcessed: number;
  }>;
  generatedAt: string;
};

type PanelId =
  | "wire"
  | "tools"
  | "models"
  | "research"
  | "benchmarks"
  | "labs"
  | "regional-wire"
  | "sdk-adoption"
  | "model-usage"
  | "agents"
  | "launches";

export type DashboardProps = {
  /**
   * SSR-hydrated /api/status payload. Seeds the StatusBar (and the
   * mobile freshness chip) so the first paint shows real tool-health
   * counts instead of a "connecting…" placeholder. The polling cycle
   * still refreshes every STATUS_POLL_MS.
   */
  initialStatus?: StatusResult;
  /**
   * SSR-hydrated FeedResponse used by the mobile FeedView on first
   * paint. Optional — desktop ignores it (LiveFeed is a different
   * surface that reads /api/globe-events).
   */
  initialFeedResponse?: FeedResponse;
};

export function Dashboard({
  initialStatus,
  initialFeedResponse,
}: DashboardProps = {}) {
  const status = usePolledEndpoint<StatusResult>("/api/status", STATUS_POLL_MS, {
    initialData: initialStatus,
    // The server payload dates itself. Under ISR the HTML can be minutes old by
    // the time it is read, so the freshness chrome must age from the poll, not
    // from the moment this component mounted.
    initialDataAt: initialStatus
      ? Date.parse(initialStatus.polledAt) || undefined
      : undefined,
  });
  const events = usePolledEndpoint<GlobeEventsResult>(
    "/api/globe-events",
    EVENTS_POLL_MS,
  );
  const registry = usePolledEndpoint<RegistryResult>(
    "/api/registry",
    REGISTRY_POLL_MS,
  );
  const models = usePolledEndpoint<ModelsResult>("/api/models", MODELS_POLL_MS);
  // One /api/community read for the shell: the Community tab's server panel and the feed's
  // "Discuss" link both show the same number, because they are the same read.
  const community = useCommunity();
  const research = usePolledEndpoint<ResearchResult>(
    "/api/research",
    RESEARCH_POLL_MS,
  );
  const hn = usePolledEndpoint<HnWireResult>("/api/hn", HN_POLL_MS);
  const benchmarks = usePolledEndpoint<BenchmarksPayload>(
    "/api/benchmarks",
    BENCHMARKS_POLL_MS,
  );
  const benchmarksHistory = usePolledEndpoint<{
    ok: boolean;
    dates: string[];
    byModel: Record<string, Array<number | null>>;
  }>("/api/benchmarks/history", BENCHMARKS_POLL_MS);
  const labs = usePolledEndpoint<LabsPayload>("/api/labs", LABS_POLL_MS);
  const rss = usePolledEndpoint<RssWireResult>("/api/rss", RSS_POLL_MS);
  const sdkAdoption = usePolledEndpoint<SdkAdoptionDto>(
    "/api/panels/sdk-adoption",
    SDK_ADOPTION_POLL_MS,
  );
  const modelUsage = usePolledEndpoint<ModelUsageDto>(
    "/api/panels/model-usage",
    MODEL_USAGE_POLL_MS,
  );
  const agents = usePolledEndpoint<AgentsViewDto>(
    "/api/panels/agents",
    AGENTS_POLL_MS,
  );
  const productHunt = usePolledEndpoint<ProductHuntResult>(
    "/api/panels/producthunt",
    PRODUCTHUNT_POLL_MS,
  );
  const regionalDeltas = usePolledEndpoint<RegionalDeltasDto>(
    "/api/globe-events/regional-deltas",
    REGIONAL_DELTAS_POLL_MS,
  );
  const cronHealth = usePolledEndpoint<CronHealthResult>(
    "/api/cron-health",
    CRON_HEALTH_POLL_MS,
  );
  const feed = usePolledEndpoint<FeedResponse>("/api/feed", FEED_POLL_MS, {
    initialData: initialFeedResponse,
  });

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
  // Filter logic itself is in FilterPanel.tsx (`filterLivePoints`) so
  // it's unit-testable — see __tests__/FilterPanel.test.ts.
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  // applyFilterToggle handles the ai-config-only auto-enable for event
  // types — see FilterPanel.tsx for the full semantics + tests.
  const toggleFilter = (id: FilterLayerId) =>
    setFilters((f) => applyFilterToggle(f, id));
  const resetFilters = () => setFilters(DEFAULT_FILTERS);
  const livePoints = filterLivePoints(rawPoints, filters);
  const aiConfigStranded = isAiConfigStranded(filters);

  // Dedup: if a registry repo also has a live event in the current
  // window, keep only the live event — it's the stronger signal and
  // its card row includes a live pill. RegistryRow would be redundant.
  const liveRepoSet = new Set<string>();
  for (const p of livePoints) {
    const repo = (p.meta as { repo?: string } | undefined)?.repo;
    if (repo) liveRepoSet.add(repo);
  }
  // Registry layer — curated repos with resolved HQ coords. Gated by
  // the `registry` filter (default ON); unchecking hides the full slate
  // base-map layer so pure live-pulse density reads without the baseline
  // noise. Event-type filters don't apply to registry (no `type` field)
  // and the `ai-config-only` filter is a no-op on registry (every entry
  // has AI config by definition).
  const registryFiltered: GlobePoint[] = filters.registry
    ? registryPoints.filter((p) => {
        const fn = (p.meta as { fullName?: string } | undefined)?.fullName;
        return !fn || !liveRepoSet.has(fn);
      })
    : [];

  // HN points carry kind="hn" + locationLabel from the author's HN
  // profile. FlatMap + Globe detect kind and render them in HN orange.
  // Gated by the `hn` filter (default ON) so users who want GH-only
  // density can opt out of the community-discussion signal.
  const hnPoints: GlobePoint[] = filters.hn ? hn.data?.points ?? [] : [];

  // AI Labs layer — curated HQ coords from data/ai-labs.json, sized by
  // 7d activity across flagship repos. Plotted even when the lab is
  // quiet (LABS_INACTIVE_OPACITY on the renderer) so presence always
  // reads. Gated by the `ai-labs` filter (default ON).
  const labPoints: GlobePoint[] = filters["ai-labs"]
    ? labsToGlobePoints(labs.data?.labs ?? [])
    : [];
  // Regional RSS layer — curated publisher HQs from
  // src/lib/data/rss-sources.ts, sized by 24h item count. Always
  // plotted (quiet publishers dim via RSS_INACTIVE_OPACITY), so
  // presence of the regional source is visible even when a feed is
  // slow. Gated by the `regional-rss` filter (default ON).
  const rssPoints: GlobePoint[] = filters["regional-rss"]
    ? rssToGlobePoints(rss.data?.sources ?? [])
    : [];
  const points: GlobePoint[] = [
    ...livePoints,
    ...registryFiltered,
    ...hnPoints,
    ...labPoints,
    ...rssPoints,
  ];

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
              sourceKind?: "events-api" | "gharchive" | "tracked-repo" | "gitlab";
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
  // Web v2: five primary surfaces, shared with the mobile shell; `?tab=` deep links in both.
  // The URL is read through useSyncExternalStore so hydration renders the default and the
  // client snapshot takes over without a state-setting effect; a click overrides and writes back.
  const urlTab = useSyncExternalStore(
    subscribeNever,
    () => tabFromSearch(window.location.search),
    () => DEFAULT_TAB,
  );
  const [tabOverride, setTabOverride] = useState<PrimaryTab | null>(null);
  const activeTab: PrimaryTab = tabOverride ?? urlTab;
  const setActiveTab = (tab: PrimaryTab) => {
    setTabOverride(tab);
    writeTabToUrl(tab);
  };
  // Feed: Stories (default) or the chronological Wire; `?view=wire` deep link, same pattern.
  const urlFeedView = useSyncExternalStore(
    subscribeNever,
    () => feedViewFromSearch(window.location.search),
    () => DEFAULT_FEED_VIEW,
  );
  const [feedViewOverride, setFeedViewOverride] = useState<FeedViewMode | null>(null);
  const feedView: FeedViewMode = feedViewOverride ?? urlFeedView;
  const setFeedView = (mode: FeedViewMode) => {
    setFeedViewOverride(mode);
    writeFeedViewToUrl(mode);
  };
  // More › board: the boards are reading surfaces under More; `?board=` deep-links one.
  const urlBoard = useSyncExternalStore(
    subscribeNever,
    () => boardFromSearch(window.location.search),
    () => null,
  );
  const [boardOverride, setBoardOverride] = useState<BoardId | null | undefined>(undefined);
  const board: BoardId | null = boardOverride === undefined ? urlBoard : boardOverride;
  const openBoard = (id: BoardId) => {
    setActiveTab("more");
    setBoardOverride(id);
    writeBoardToUrl(id);
    track("panel_open", { panel: id, surface: "board" });
  };
  const closeBoard = () => {
    setBoardOverride(null);
    writeBoardToUrl(null);
  };
  const boardRef = useRef<BoardId | null>(null);
  boardRef.current = board;
  const openBoardRef = useRef(openBoard);
  openBoardRef.current = openBoard;
  const closeBoardRef = useRef(closeBoard);
  closeBoardRef.current = closeBoard;
  const openWire = () => {
    closeBoard();
    setActiveTab("feed");
    setFeedView("wire");
  };
  // Map tab: live events (default) or the labs/ecosystem layer.
  const [mapLayer, setMapLayer] = useState<"events" | "labs">("events");

  // Boards are reading surfaces under More; the Map stage is the map alone. Nothing floats over
  // it any more, so there is no window layout state to keep.

  // (removed with the floating windows: initial positions, z-order, the visible-panel cap)

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
    {
      id: "agents",
      label: "Agents",
      icon: "agents",
      count: agents.data?.rows.length ?? null,
    },
    {
      id: "launches",
      label: "Launches",
      icon: "launches",
      count: productHunt.data?.posts.length ?? null,
    },
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
    {
      id: "labs",
      label: "AI Labs",
      icon: "labs",
      count: labs.data?.labs.length ?? null,
    },
    {
      id: "regional-wire",
      label: "Regional Wire",
      icon: "regional-wire",
      count: rss.data?.sources.length ?? null,
    },
    {
      id: "sdk-adoption",
      label: "SDK Adoption",
      icon: "sdk-adoption",
      count: sdkAdoption.data?.packages.length ?? null,
    },
    {
      id: "model-usage",
      label: "Model Usage",
      icon: "model-usage",
      count: modelUsage.data?.rows.length ?? null,
    },
    { id: "audit", label: "Audit", icon: "audit", soon: true },
  ];





  // Per-board master-detail stat bars (FIX-13). Derivation lives here so
  // the typed payloads stay close to the polled endpoints; StatBar itself
  // is pure presentational. `segments` is allowed to be empty — StatBar
  // renders "—" rather than fabricating counts.
  const wireStatBar = (() => {
    const gh = events.data?.coverage.windowSize;
    const hnCount = hn.data?.items.length;
    const segs: Array<StatSegment | null> = [
      gh != null ? { label: "GH", value: gh } : null,
      hnCount != null ? { label: "HN", value: hnCount } : null,
    ];
    return <StatBar segments={segs} />;
  })();

  const toolsStatBar = (() => {
    if (!status.data) return <StatBar segments={[]} />;
    const sev = deriveSev(status.data);
    const segs: Array<StatSegment | null> = [
      { label: "OPERATIONAL", value: sev.operational, tone: "op" },
      sev.degraded > 0
        ? { label: "DEGRADED", value: sev.degraded, tone: "degrade" }
        : null,
      sev.outage > 0
        ? { label: "OUTAGE", value: sev.outage, tone: "outage" }
        : null,
    ];
    return <StatBar segments={segs} />;
  })();

  const modelsStatBar = (() => {
    const list = models.data?.models;
    if (!list || list.length === 0) return <StatBar segments={[]} />;
    const orgs = new Set(list.map((m) => m.author).filter(Boolean)).size;
    return (
      <StatBar
        segments={[
          { label: "MODELS", value: list.length },
          { label: "ORGS", value: orgs },
        ]}
      />
    );
  })();

  const researchStatBar = (() => {
    const papers = research.data?.papers;
    if (!papers || papers.length === 0) return <StatBar segments={[]} />;
    const top = topCategoryCounts(papers, (p) => p.primaryCategory, 3);
    return (
      <StatBar
        segments={top.map(({ key, count }) => ({ label: key, value: count }))}
      />
    );
  })();

  const benchmarksStatBar = (() => {
    if (!benchmarks.data || !benchmarks.data.ok) {
      return <StatBar segments={[]} />;
    }
    const { rows, meta } = benchmarks.data;
    const topElo = rows[0]?.rating;
    return (
      <StatBar
        segments={[
          topElo != null
            ? { label: "TOP ELO", value: Math.round(topElo) }
            : null,
          { label: "MODELS", value: rows.length },
        ]}
        trailing={`PUBLISHED ${meta.leaderboardPublishDate}`}
      />
    );
  })();

  const labsStatBar = (() => {
    const list = labs.data?.labs;
    if (!list || list.length === 0) return <StatBar segments={[]} />;
    const top = topCountryCounts(list, 5);
    return (
      <StatBar
        segments={top.map(({ key, count }) => ({ label: key, value: count }))}
      />
    );
  })();

  const regionalWireStatBar = (() => {
    const sources = rss.data?.sources;
    const items = rss.data?.items;
    if (!sources || sources.length === 0) return <StatBar segments={[]} />;
    return (
      <StatBar
        segments={[
          { label: "SOURCES", value: sources.length },
          items != null ? { label: "ARTICLES", value: items.length } : null,
        ]}
      />
    );
  })();

  // Per-board insight lines (S85 slice). One deterministic, source-traced
  // sentence per board, derived from that board's own polled payload — never
  // an LLM, never a re-ranking (CLAUDE.md trust contract). Rendered in the
  // board header under the StatBar. Three-board slice: wire, models,
  // benchmarks. Each deriver returns null on empty/error → no line shown.
  const wireInsightNode = (
    <InsightLine
      insight={
        events.data
          ? wireInsight(events.data.points, events.data.coverage.windowMinutes)
          : null
      }
    />
  );
  const modelsInsightNode = (
    <InsightLine insight={modelsInsight(models.data)} />
  );
  const benchmarksInsightNode = (
    <InsightLine insight={benchmarksInsight(benchmarks.data)} />
  );

  // Keyboard: Escape closes the open board and returns to the More index; 1-9 open the nth board.
  //
  // Esc coordination with the event-detail card: it binds its own Escape listener while a card is
  // open (role="dialog"), so we no-op here and a single press dismisses the card rather than the
  // card and the board together.
  //
  // Input safety: skip when focus sits in a field so a reader typing never loses keystrokes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Escape") {
        if (typeof document !== "undefined" && document.querySelector('[role="dialog"]')) return;
        if (!boardRef.current) return;
        e.preventDefault();
        closeBoardRef.current();
        return;
      }

      if (e.key >= "1" && e.key <= "9") {
        const idx = Number(e.key) - 1;
        const item = navItems[idx];
        if (!item || item.soon || !isBoardId(item.id)) return;
        e.preventDefault();
        openBoardRef.current(item.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // navItems is rebuilt on every render but only its ids and soon flags are read, and those are
    // stable; the open/close handlers are reached through refs so this binds once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Top-3 highlights derived from the SSR'd / polled FeedResponse. Empty
  // on a quiet day so the strip disappears rather than promote low-
  // severity cards into a "pay attention" position.
  const highlights = pickTopHighlights(feed.data, 3);
  const hasHighlights = highlights.length > 0;
  const stagePaddingTop = hasHighlights ? 168 : 132;

  // Shift LeftNav + FilterPanel + initial panel positions down by the
  // strip's height when it's visible. CSS variable approach so the
  // affected components don't need to know about highlights state.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.dataset.highlights;
    if (hasHighlights) {
      document.body.dataset.highlights = "1";
    } else {
      delete document.body.dataset.highlights;
    }
    return () => {
      if (prev !== undefined) document.body.dataset.highlights = prev;
      else delete document.body.dataset.highlights;
    };
  }, [hasHighlights]);

  /**
   * Toggle the panel that surfaces the deeper data for the clicked
   * highlight. We delegate to the existing `toggle()` helper so the
   * z-order, viewport-cap, and analytics tracking all stay in sync
   * with the LeftNav handler — chip clicks behave like a nav click.
   */
  // A highlight opens its board under More; the Wire highlight goes to Feed › Wire.
  const openHighlightPanel = (panel: HighlightPanelId) => {
    if (panel === "wire") openWire();
    else openBoard(panel);
  };

  /** The board bodies — the same components the phone accordion renders, fed from the polls. */
  const renderBoardBody = (id: BoardId) => {
    switch (id) {
      case "tools":
        return (
          <div className="p-3">
            <HealthCardGrid data={status.data?.data} polledAt={status.data?.polledAt} maximized={true} />
            {status.error && <p className="ap-column__sub">Status poll error: {status.error}</p>}
          </div>
        );
      case "models":
        return <ModelsPanel data={models.data} error={models.error} isInitialLoading={models.isInitialLoading} />;
      case "research":
        return <ResearchPanel data={research.data} error={research.error} isInitialLoading={research.isInitialLoading} />;
      case "benchmarks":
        return (
          <BenchmarksPanel
            data={benchmarks.data}
            error={benchmarks.error}
            isInitialLoading={benchmarks.isInitialLoading}
            eloHistory={benchmarksHistory.data?.byModel}
          />
        );
      case "labs":
        return <LabsPanel data={labs.data} error={labs.error} isInitialLoading={labs.isInitialLoading} />;
      case "regional-wire":
        return <RegionalWirePanel data={rss.data} error={rss.error} isInitialLoading={rss.isInitialLoading} />;
      case "sdk-adoption":
        return (
          <SdkAdoptionPanel
            data={sdkAdoption.data ?? null}
            error={sdkAdoption.error ?? null}
            isInitialLoading={sdkAdoption.isInitialLoading}
            originUrl={typeof window !== "undefined" ? window.location.origin : ""}
          />
        );
      case "model-usage":
        return (
          <ModelUsagePanel
            data={modelUsage.data ?? null}
            error={modelUsage.error ?? null}
            isInitialLoading={modelUsage.isInitialLoading}
            originUrl={typeof window !== "undefined" ? window.location.origin : ""}
          />
        );
      case "agents":
        return <AgentsPanel data={agents.data ?? undefined} error={agents.error ?? undefined} isInitialLoading={agents.isInitialLoading} />;
      case "launches":
        return <LaunchesPanel data={productHunt.data ?? undefined} error={productHunt.error ?? undefined} isInitialLoading={productHunt.isInitialLoading} />;
    }
  };
  const boardStatBar = (id: BoardId) =>
    id === "tools" ? toolsStatBar : id === "models" ? modelsStatBar : id === "research" ? researchStatBar : id === "benchmarks" ? benchmarksStatBar : id === "labs" ? labsStatBar : id === "regional-wire" ? regionalWireStatBar : undefined;
  const boardInsight = (id: BoardId) => (id === "models" ? modelsInsightNode : id === "benchmarks" ? benchmarksInsightNode : undefined);
  const boardFullPage = (id: BoardId) => (id === "sdk-adoption" ? "/panels/sdk-adoption" : id === "model-usage" ? "/panels/model-usage" : undefined);
  const boardItem = (id: BoardId) => navItems.find((n) => n.id === id);

  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <MobileDashboard
        topTab={activeTab}
        onTopTabChange={setActiveTab}
        feedView={feedView}
        onFeedViewChange={setFeedView}
        points={points}
        events={events.data}
        eventsLoading={events.isInitialLoading}
        eventsError={events.error ?? null}
        status={status.data}
        statusFreshness={{
          isInitialLoading: status.isInitialLoading,
          lastSuccessAt: status.lastSuccessAt,
          intervalMs: STATUS_POLL_MS,
          error: status.error,
        }}
        statusError={status.error ?? null}
        wireRows={wireRows}
        hn={hn.data}
        hnLoading={hn.isInitialLoading}
        models={models.data}
        modelsLoading={models.isInitialLoading}
        modelsError={models.error ?? null}
        research={research.data}
        researchLoading={research.isInitialLoading}
        researchError={research.error ?? null}
        benchmarks={benchmarks.data}
        benchmarksLoading={benchmarks.isInitialLoading}
        benchmarksError={benchmarks.error ?? null}
        benchmarksEloHistory={benchmarksHistory.data?.byModel}
        labs={labs.data}
        labsLoading={labs.isInitialLoading}
        labsError={labs.error ?? null}
        rss={rss.data}
        rssLoading={rss.isInitialLoading}
        rssError={rss.error ?? null}
        sdkAdoption={sdkAdoption.data}
        sdkAdoptionLoading={sdkAdoption.isInitialLoading}
        sdkAdoptionError={sdkAdoption.error ?? null}
        modelUsage={modelUsage.data}
        modelUsageLoading={modelUsage.isInitialLoading}
        modelUsageError={modelUsage.error ?? null}
        agents={agents.data}
        agentsLoading={agents.isInitialLoading}
        agentsError={agents.error ?? null}
        regionalDeltas={regionalDeltas.data ?? null}
        cronHealth={
          cronHealth.data
            ? {
                total: cronHealth.data.total,
                healthy: cronHealth.data.healthy,
                stale: cronHealth.data.stale,
              }
            : undefined
        }
        initialFeedResponse={initialFeedResponse}
        feed={feed.data ?? initialFeedResponse}
      />
    );
  }

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

      <StatusBar
        status={status.data}
        freshness={{
          isInitialLoading: status.isInitialLoading,
          lastSuccessAt: status.lastSuccessAt,
          intervalMs: STATUS_POLL_MS,
          error: status.error,
        }}
        verifiedSourceCount={VERIFIED_SOURCES.length}
        pendingSourceCount={PENDING_SOURCES.length}
        cronHealth={
          cronHealth.data
            ? {
                total: cronHealth.data.total,
                healthy: cronHealth.data.healthy,
                stale: cronHealth.data.stale,
              }
            : undefined
        }
      />

      <HeroStrip status={status.data} />

      <HighlightsStrip
        highlights={highlights}
        onSelect={(panel) => openHighlightPanel(panel)}
      />

      {/* Grid lattice overlay — decorative, above globe but below chrome. */}
      <div className="ap-stage-grid" aria-hidden />

      {/* Full-viewport stage. MAP (default) and GLOBE render a geospatial
          canvas behind floating chrome; WIRE swaps in a full-screen
          chronological feed. CoverageBadge hovers over both map + globe
          so the transparency contract stays visible regardless of view.
          paddingTop = TopBar (48px) + StatusBar (28px). paddingBottom
          reserves space for MetricsRow + LiveTicker + MetricTicker stack. */}
      <div
        className="fixed inset-0"
        style={{ paddingTop: stagePaddingTop, paddingBottom: 140, zIndex: 3 }}
      >
        {activeTab === "health" && (
          <div className="ap-column-scroll">
            <section className="ap-column ap-column--health" aria-label="Health">
              <HealthCardGrid data={status.data?.data} polledAt={status.data?.polledAt} maximized={true} />
              <WorldBand
                events={events.data}
                loading={events.isInitialLoading}
                error={events.error}
                cols={90}
                onOpenMap={() => setActiveTab("map")}
              />
              <HealthTiles
                onOpenBoard={openBoard}
                feed={feed.data ?? initialFeedResponse}
                status={status.data}
                events={events.data}
                labs={labs.data}
              />
              {status.error ? (
                <p className="ap-column__sub">Status poll error: {status.error}</p>
              ) : null}
            </section>
          </div>
        )}
        {activeTab === "feed" && (
          <div className="ap-column-scroll">
            <section className="ap-column ap-column--feed" aria-label="Feed">
              <FeedModeSwitch mode={feedView} onChange={setFeedView} />
              {feedView === "stories" ? (
                <FeedView initialResponse={feed.data ?? initialFeedResponse} community={community} />
              ) : (
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
            </section>
          </div>
        )}
        {activeTab === "map" && (
          <div className="relative h-full w-full">
            {mapLayer === "events" ? (
              <>
                <FlatMap
                  points={points}
                  lastUpdatedAt={lastUpdatedAt}
                  regionalDeltas={regionalDeltas.data ?? null}
                />
                <CoverageBadge events={events.data} />
                <MapLegend filters={filters} />
                {aiConfigStranded && <AiConfigStrandedNote />}
              </>
            ) : (
              <EcosystemMap labs={labs.data?.labs ?? []} />
            )}
            <div className="ap-seg" role="tablist" aria-label="Map layer">
              {(
                [
                  ["events", "Events"],
                  ["labs", "Labs"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={mapLayer === id}
                  className={`ap-seg__item${mapLayer === id ? " is-active" : ""}`}
                  onClick={() => setMapLayer(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        {activeTab === "rooms" && (
          <div className="ap-column-scroll">
            <RoomsView
              rows={wireRows}
              polledAt={events.data?.polledAt}
              windowMinutes={events.data?.coverage.windowMinutes}
              community={community}
            />
          </div>
        )}
        {activeTab === "more" && (
          <div className="ap-column-scroll">
            {board ? (
              <BoardView
                id={board}
                count={boardItem(board)?.count ?? undefined}
                statBar={boardStatBar(board)}
                insight={boardInsight(board)}
                fullPageHref={boardFullPage(board)}
                onBack={closeBoard}
              >
                {renderBoardBody(board)}
              </BoardView>
            ) : (
              <MoreView items={navItems} currentBoard={board} onOpenBoard={openBoard} onOpenWire={openWire} />
            )}
          </div>
        )}
      </div>

      {/* Left-edge icon nav */}

      {/* Right-edge filter panel — renders on both map + globe (they share
          the filtered point set). Wire view has its own filter semantics. */}
      {activeTab === "map" && (
        <FilterPanel
          filters={filters}
          onToggle={toggleFilter}
          onReset={resetFilters}
        />
      )}

      {/* Floating panels — renders on map + globe (geospatial views where
          side panels add context). Wire is its own full-screen feed, so
          floating panels would be redundant. */}
      {/* Four-card glance row above the ticker — the Map stage only; the reading columns carry
          their own tiles (phase 3, canvas Health board). */}
      {activeTab === "map" && <MetricsRow
        status={status.data}
        events={events.data}
        statusLoading={status.isInitialLoading}
        eventsLoading={events.isInitialLoading}
      />}

      {/* Bottom-pinned stack: live event ticker on top of the metric
          ticker. The live ticker is its own dedicated 28px strip so it
          doesn't visually compete with MetricsRow above. Map+globe views
          only — the wire view is its own full-screen feed. */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex flex-col">
        {activeTab === "map" && mapLayer === "events" && (
          <>
            <TopMoversLine
              points={livePoints}
              regionalDeltas={regionalDeltas.data ?? null}
            />
            <LiveTicker rows={wireRows} />
          </>
        )}
        {/* MetricTicker (6-tile diagnostics row) hidden from default view.
            The data is still available via /sources and /api/cron-health. */}
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

/**
 * Sticky note above the map explaining why AI-Config Only is producing
 * an empty layer: the user has every event-type checkbox off. The
 * default toggle path enables event types automatically; this banner
 * only fires when the user has manually unchecked them after enabling
 * the signal filter.
 */
function AiConfigStrandedNote() {
  return (
    <div
      role="status"
      aria-label="AI-Config filter has no event types enabled"
      className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-md border border-amber-400/40 bg-background/85 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-amber-300 backdrop-blur-sm"
    >
      Enable event types to see AI-config results
    </div>
  );
}

