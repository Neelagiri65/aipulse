"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { WirePage, type WireItem } from "@/components/dashboard/WirePage";
import { ShareButton } from "@/components/chrome/ShareButton";
import { CommunityLink } from "@/components/chrome/CommunityLink";
import {
  MobileBottomBar,
  type MobileTopLevelTab,
} from "@/components/chrome/MobileBottomBar";
import { FeedView } from "@/components/feed/FeedView";
import { LiveTicker } from "@/components/map/LiveTicker";
import { HealthCardGrid } from "@/components/health/HealthCardGrid";
import { ModelsPanel } from "@/components/models/ModelsPanel";
import { ResearchPanel } from "@/components/research/ResearchPanel";
import { BenchmarksPanel } from "@/components/benchmarks/BenchmarksPanel";
import { LabsPanel } from "@/components/labs/LabsPanel";
import { RegionalWirePanel } from "@/components/wire/RegionalWirePanel";
import { SdkAdoptionPanel } from "@/components/panels/sdk-adoption/SdkAdoptionPanel";
import { ModelUsagePanel } from "@/components/panels/model-usage/ModelUsagePanel";
import { AgentsPanel } from "@/components/panels/agents/AgentsPanel";
import type { GlobePoint } from "@/components/globe/Globe";
import type { GlobeEventsResult } from "@/lib/data/fetch-events";
import type { StatusResult } from "@/lib/data/fetch-status";
import type { ModelsResult } from "@/lib/data/fetch-models";
import type { ResearchResult } from "@/lib/data/fetch-research";
import type { HnWireResult } from "@/lib/data/wire-hn";
import type { BenchmarksPayload } from "@/lib/data/benchmarks-lmarena";
import type { LabsPayload } from "@/lib/data/fetch-labs";
import type { RssWireResult } from "@/lib/data/wire-rss";
import type { SdkAdoptionDto } from "@/lib/data/sdk-adoption";
import type { AgentsViewDto } from "@/lib/data/agents-view";
import type { ModelUsageDto } from "@/lib/data/openrouter-types";
import type { CronHealthSnapshot } from "@/components/dashboard/MetricTicker";
import type { FreshnessState } from "@/components/chrome/TopBar";
import type { FeedResponse } from "@/lib/feed/types";
import { track } from "@/lib/analytics";
import { HighlightsStrip } from "@/components/dashboard/HighlightsStrip";
import {
  pickTopHighlights,
  type HighlightPanelId,
} from "@/lib/feed/highlights";

const FlatMap = dynamic(
  () => import("@/components/map/FlatMap").then((m) => m.FlatMap),
  {
    ssr: false,
    loading: () => (
      <div className="ap-mobile-map__loading" role="status">
        Loading map…
      </div>
    ),
  },
);

/**
 * Sub-tabs visible inside the PANELS top-level tab. Map was promoted
 * to a peer of FEED + PANELS in S40 so it's no longer here.
 */
export type MobileTopTabId = "wire" | "health" | "models" | "more";
export type MobileModelsSubId = "downloads" | "benchmarks" | "usage";
export type MobileMoreSectionId =
  | "research"
  | "labs"
  | "regional-wire"
  | "sdk-adoption"
  | "agents";

type MobileTab = {
  id: MobileTopTabId;
  label: string;
  count?: number | null;
};

export type MobileDashboardProps = {
  // Map data (already filtered by parent)
  points: GlobePoint[];
  events: GlobeEventsResult | undefined;
  eventsLoading: boolean;
  eventsError: string | null;
  // Tools
  status: StatusResult | undefined;
  statusFreshness: FreshnessState;
  statusError: string | null;
  // Wire
  wireRows: WireItem[];
  hn: HnWireResult | undefined;
  hnLoading: boolean;
  // Models
  models: ModelsResult | undefined;
  modelsLoading: boolean;
  modelsError: string | null;
  // Research
  research: ResearchResult | undefined;
  researchLoading: boolean;
  researchError: string | null;
  // Benchmarks
  benchmarks: BenchmarksPayload | undefined;
  benchmarksLoading: boolean;
  benchmarksError: string | null;
  benchmarksEloHistory?: Record<string, Array<number | null>>;
  // Labs
  labs: LabsPayload | undefined;
  labsLoading: boolean;
  labsError: string | null;
  // Regional wire
  rss: RssWireResult | undefined;
  rssLoading: boolean;
  rssError: string | null;
  // SDK Adoption
  sdkAdoption: SdkAdoptionDto | null | undefined;
  sdkAdoptionLoading: boolean;
  sdkAdoptionError: string | null;
  // Model Usage
  modelUsage: ModelUsageDto | null | undefined;
  modelUsageLoading: boolean;
  modelUsageError: string | null;
  // Agents
  agents: AgentsViewDto | null | undefined;
  agentsLoading: boolean;
  agentsError: string | null;
  // Health
  cronHealth: CronHealthSnapshot | undefined;
  // SSR-hydrated feed response. When provided, FeedView renders the
  // ranked cards on first paint without waiting for the /api/feed
  // round-trip. Optional — falls back to client polling when omitted
  // (e.g. tests, or any consumer that doesn't pre-fetch server-side).
  initialFeedResponse?: FeedResponse;
};

/**
 * Mobile shell. Rendered only at viewports ≤767px (gated by `useIsMobile`
 * in Dashboard). The desktop "windows on a stage" paradigm fundamentally
 * doesn't fit a 375px screen; this component takes the same panel
 * components but consolidates them into 5 top tabs (Map / Wire / Health /
 * Models / More) plus a sub-tab strip inside Models and an accordion
 * inside More — 10 horizontal scroll targets becomes 5 visible tabs.
 *
 * Top-tab routing:
 *   - map      → FlatMap with the same filtered points the desktop uses
 *   - wire     → WirePage chronological feed
 *   - health   → Tool Health cards (1-col on mobile)
 *   - models   → sub-tab strip [Downloads | Bench | Usage] swapping
 *                between ModelsPanel, BenchmarksPanel, ModelUsagePanel
 *   - more     → accordion of Research, Labs, Regional, SDK Adoption,
 *                each section collapsible. First section open by default
 *                so the "More" tab isn't blank on first land.
 */
export function MobileDashboard(props: MobileDashboardProps) {
  const [topTab, setTopTab] = useState<MobileTopLevelTab>("feed");
  const [active, setActive] = useState<MobileTopTabId>("wire");
  const [modelsSub, setModelsSub] = useState<MobileModelsSubId>("downloads");
  // Default: research expanded so the More tab has visible content on
  // first open. User can collapse / expand any section freely.
  const [moreOpen, setMoreOpen] = useState<Set<MobileMoreSectionId>>(
    new Set<MobileMoreSectionId>(["research"]),
  );

  const tabs: MobileTab[] = [
    {
      id: "wire",
      label: "Wire",
      count: props.events?.coverage.windowSize ?? null,
    },
    {
      id: "health",
      label: "Health",
      count: props.status ? Object.keys(props.status.data).length : null,
    },
    {
      id: "models",
      label: "Models",
      count: countForModelsTab(props),
    },
    {
      id: "more",
      label: "More",
      count: countForMoreTab(props),
    },
  ];

  const handleSelect = (id: MobileTopTabId) => {
    setActive(id);
    track("panel_open", { panel: id, surface: "mobile" });
  };

  const handleModelsSub = (id: MobileModelsSubId) => {
    setModelsSub(id);
    track("panel_open", { panel: `models:${id}`, surface: "mobile" });
  };

  const toggleMore = (id: MobileMoreSectionId) => {
    setMoreOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    track("panel_open", { panel: `more:${id}`, surface: "mobile" });
  };

  const highlights = pickTopHighlights(props.initialFeedResponse, 3);

  /**
   * Route a highlights chip click to the right mobile destination.
   *
   * The mobile shell has three top-level tabs (feed / map / panels)
   * and the panels tab contains four sub-tabs plus an accordion. We
   * map each chip's panel id to the (top-tab, sub-tab, more-section)
   * triple and switch state accordingly. Tracked as a "highlight_*"
   * panel-open so analytics can tell chip clicks from native nav.
   */
  const onHighlightSelect = (panel: HighlightPanelId) => {
    track("panel_open", { panel: `highlight:${panel}`, surface: "mobile" });
    switch (panel) {
      case "tools":
        setTopTab("panels");
        setActive("health");
        return;
      case "wire":
        setTopTab("panels");
        setActive("wire");
        return;
      case "model-usage":
        setTopTab("panels");
        setActive("models");
        setModelsSub("usage");
        return;
      case "benchmarks":
        setTopTab("panels");
        setActive("models");
        setModelsSub("benchmarks");
        return;
      case "research":
        setTopTab("panels");
        setActive("more");
        setMoreOpen((prev) => new Set(prev).add("research"));
        return;
      case "labs":
        setTopTab("panels");
        setActive("more");
        setMoreOpen((prev) => new Set(prev).add("labs"));
        return;
      case "sdk-adoption":
        setTopTab("panels");
        setActive("more");
        setMoreOpen((prev) => new Set(prev).add("sdk-adoption"));
        return;
    }
  };

  return (
    <div
      className="ap-mobile-shell"
      data-top-tab={topTab}
      data-active-tab={active}
    >
      <header className="ap-mobile-topbar">
        <a href="/" className="ap-mobile-brand" aria-label="Gawk home">
          <span className="ap-live-dot" aria-hidden />
          <span className="ap-mobile-brand__name">GAWK</span>
          <span className="ap-mobile-brand__beta">BETA</span>
        </a>
        <FreshnessChip freshness={props.statusFreshness} />
        <CommunityLink />
        <ShareButton />
      </header>

      <main className="ap-mobile-body" role="tabpanel">
        {topTab !== "feed" && (
          <HighlightsStrip
            highlights={highlights}
            onSelect={onHighlightSelect}
            variant="mobile"
          />
        )}
        {topTab === "feed" && (
          <div className="ap-mobile-feed">
            <FeedView initialResponse={props.initialFeedResponse} />
          </div>
        )}

        {topTab === "map" && (
          <div className="ap-mobile-map">
            <FlatMap
              points={props.points}
              lastUpdatedAt={props.events?.polledAt}
            />
            <div className="ap-mobile-map__caveat">
              {props.events?.coverage.windowSize ?? 0} events ·{" "}
              {props.events?.coverage.windowMinutes ?? 0}m window ·{" "}
              {props.events?.coverage.locationCoveragePct ?? 0}% placeable
            </div>
            <LiveTicker rows={props.wireRows} />
          </div>
        )}

        {topTab === "panels" && (
          <>
            <nav
              className="ap-mobile-tabs"
              role="tablist"
              aria-label="Panel selector"
            >
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active === t.id}
                  className={`ap-mobile-tabs__item${active === t.id ? " is-active" : ""}`}
                  onClick={() => handleSelect(t.id)}
                >
                  <span className="ap-mobile-tabs__label">{t.label}</span>
                  {t.count != null && t.count > 0 ? (
                    <span className="ap-mobile-tabs__count">{t.count}</span>
                  ) : null}
                </button>
              ))}
            </nav>
            {renderPanelsBody({ active, modelsSub, handleModelsSub, moreOpen, toggleMore, props })}
          </>
        )}
      </main>

      <MobileBottomBar active={topTab} onSelect={setTopTab} />

      <footer className="ap-mobile-footer">
        <CronHealthChip cronHealth={props.cronHealth} />
        <a
          href="/data-sources.md"
          target="_blank"
          rel="noopener noreferrer"
          className="ap-mobile-footer__link"
        >
          Sources ↗
        </a>
      </footer>
    </div>
  );
}

/**
 * Panels-tab body — the original 4-tab strip + per-tab content. Pulled
 * into a helper so the top-level shell stays readable. No behaviour
 * change vs the S39 5-tab strip aside from the Map tab being removed
 * (it was promoted to a top-level peer in S40).
 */
function renderPanelsBody({
  active,
  modelsSub,
  handleModelsSub,
  moreOpen,
  toggleMore,
  props,
}: {
  active: MobileTopTabId;
  modelsSub: MobileModelsSubId;
  handleModelsSub: (id: MobileModelsSubId) => void;
  moreOpen: Set<MobileMoreSectionId>;
  toggleMore: (id: MobileMoreSectionId) => void;
  props: MobileDashboardProps;
}) {
  return (
    <>
        {active === "wire" && (
          <div className="ap-mobile-panel">
            <WirePage
              wireRows={props.wireRows}
              ghCoverage={
                props.events
                  ? {
                      windowMinutes: props.events.coverage.windowMinutes,
                      windowSize: props.events.coverage.windowSize,
                    }
                  : undefined
              }
              hnMeta={props.hn?.meta}
              polledAt={props.events?.polledAt}
              error={props.eventsError ?? undefined}
              isInitialLoading={props.eventsLoading && props.hnLoading}
            />
          </div>
        )}
        {active === "health" && (
          <div className="ap-mobile-panel ap-mobile-panel--padded">
            <HealthCardGrid data={props.status?.data} maximized={true} />
            {props.statusError ? (
              <p className="ap-mobile-error">
                Status poll error: {props.statusError}
              </p>
            ) : null}
          </div>
        )}
        {active === "models" && (
          <ModelsTabBody
            sub={modelsSub}
            onSubChange={handleModelsSub}
            props={props}
          />
        )}
        {active === "more" && (
          <MoreTabBody
            open={moreOpen}
            onToggle={toggleMore}
            props={props}
          />
        )}
    </>
  );
}

function FreshnessChip({ freshness }: { freshness: FreshnessState }) {
  const { isInitialLoading, lastSuccessAt, intervalMs } = freshness;
  if (isInitialLoading && !lastSuccessAt) {
    return <span className="ap-mobile-chip ap-mobile-chip--pending">connecting</span>;
  }
  if (!lastSuccessAt) {
    return <span className="ap-mobile-chip ap-mobile-chip--bad">offline</span>;
  }
  const ageMs = Date.now() - lastSuccessAt;
  const stale = ageMs > intervalMs * 2;
  if (stale) {
    return <span className="ap-mobile-chip ap-mobile-chip--warn">stale</span>;
  }
  return <span className="ap-mobile-chip ap-mobile-chip--ok">live</span>;
}

function CronHealthChip({
  cronHealth,
}: {
  cronHealth: CronHealthSnapshot | undefined;
}) {
  if (!cronHealth) {
    return <span className="ap-mobile-footer__cron">crons —</span>;
  }
  const tone = cronHealth.stale === 0 ? "ok" : "warn";
  return (
    <span className={`ap-mobile-footer__cron ap-mobile-footer__cron--${tone}`}>
      {cronHealth.healthy}/{cronHealth.total} crons
      {cronHealth.stale > 0 ? ` · ${cronHealth.stale} stale` : ""}
    </span>
  );
}

/**
 * Models tab body — three sub-views of "which AI models matter":
 *   - downloads  → HuggingFace top downloads (popularity)
 *   - benchmarks → Chatbot Arena Elo (quality)
 *   - usage      → OpenRouter weekly spend ranking (real economic signal)
 *
 * The user picks the angle they care about; we don't pick for them. The
 * sub-tab strip is always visible so the alternative views are one tap
 * away — combining these into one tab is the consolidation; flattening
 * them into a "Models" view that pretends downloads = quality would
 * collapse three honest signals into one dishonest one.
 */
function ModelsTabBody({
  sub,
  onSubChange,
  props,
}: {
  sub: MobileModelsSubId;
  onSubChange: (id: MobileModelsSubId) => void;
  props: MobileDashboardProps;
}) {
  const subTabs: Array<{ id: MobileModelsSubId; label: string }> = [
    { id: "downloads", label: "Downloads" },
    { id: "benchmarks", label: "Bench" },
    { id: "usage", label: "Usage" },
  ];
  return (
    <div className="ap-mobile-panel">
      <div className="ap-mobile-subtabs" role="tablist" aria-label="Models view">
        {subTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={sub === t.id}
            className={`ap-mobile-subtabs__item${sub === t.id ? " is-active" : ""}`}
            onClick={() => onSubChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="ap-mobile-subtabs__body">
        {sub === "downloads" && (
          <ModelsPanel
            data={props.models}
            error={props.modelsError ?? undefined}
            isInitialLoading={props.modelsLoading}
          />
        )}
        {sub === "benchmarks" && (
          <BenchmarksPanel
            data={props.benchmarks}
            error={props.benchmarksError ?? undefined}
            isInitialLoading={props.benchmarksLoading}
            eloHistory={props.benchmarksEloHistory}
          />
        )}
        {sub === "usage" && (
          <ModelUsagePanel
            data={props.modelUsage ?? null}
            error={props.modelUsageError}
            isInitialLoading={props.modelUsageLoading}
            originUrl={
              typeof window !== "undefined" ? window.location.origin : ""
            }
          />
        )}
      </div>
    </div>
  );
}

/**
 * "More" tab body — accordion of the four secondary panels. Multi-open
 * (no exclusion), so a user can keep Research expanded while peeking at
 * Labs. First section (research) opens by default so the More tab is
 * never blank on first land.
 */
function MoreTabBody({
  open,
  onToggle,
  props,
}: {
  open: Set<MobileMoreSectionId>;
  onToggle: (id: MobileMoreSectionId) => void;
  props: MobileDashboardProps;
}) {
  const sections: Array<{
    id: MobileMoreSectionId;
    label: string;
    count: number | null;
    body: React.ReactNode;
  }> = [
    {
      id: "research",
      label: "Research",
      count: props.research?.papers.length ?? null,
      body: (
        <ResearchPanel
          data={props.research}
          error={props.researchError ?? undefined}
          isInitialLoading={props.researchLoading}
        />
      ),
    },
    {
      id: "labs",
      label: "AI Labs",
      count: props.labs?.labs.length ?? null,
      body: (
        <LabsPanel
          data={props.labs}
          error={props.labsError ?? undefined}
          isInitialLoading={props.labsLoading}
        />
      ),
    },
    {
      id: "regional-wire",
      label: "Regional Wire",
      count: props.rss?.sources.length ?? null,
      body: (
        <RegionalWirePanel
          data={props.rss}
          error={props.rssError ?? undefined}
          isInitialLoading={props.rssLoading}
        />
      ),
    },
    {
      id: "sdk-adoption",
      label: "SDK Adoption",
      count: props.sdkAdoption?.packages.length ?? null,
      body: (
        <SdkAdoptionPanel
          data={props.sdkAdoption ?? null}
          error={props.sdkAdoptionError}
          isInitialLoading={props.sdkAdoptionLoading}
          originUrl={
            typeof window !== "undefined" ? window.location.origin : ""
          }
        />
      ),
    },
    {
      id: "agents",
      label: "Agents",
      count: props.agents?.rows.length ?? null,
      body: (
        <AgentsPanel
          data={props.agents ?? undefined}
          error={props.agentsError ?? undefined}
          isInitialLoading={props.agentsLoading}
        />
      ),
    },
  ];
  return (
    <div className="ap-mobile-panel ap-mobile-more">
      {sections.map((s) => {
        const isOpen = open.has(s.id);
        return (
          <section key={s.id} className="ap-mobile-more__section">
            <button
              type="button"
              className="ap-mobile-more__header"
              aria-expanded={isOpen}
              aria-controls={`mobile-more-${s.id}`}
              onClick={() => onToggle(s.id)}
            >
              <span className="ap-mobile-more__chevron" aria-hidden>
                {isOpen ? "▾" : "▸"}
              </span>
              <span className="ap-mobile-more__label">{s.label}</span>
              {s.count != null ? (
                <span className="ap-mobile-more__count">{s.count}</span>
              ) : null}
            </button>
            {isOpen ? (
              <div id={`mobile-more-${s.id}`} className="ap-mobile-more__body">
                {s.body}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function countForModelsTab(props: MobileDashboardProps): number | null {
  // Aggregate: number of distinct rows visible across the three sub-views
  // (downloads + benchmarks + usage). When all three are loading the
  // count is null — we don't fabricate.
  const a = props.models?.models.length ?? 0;
  const b =
    props.benchmarks && props.benchmarks.ok ? props.benchmarks.rows.length : 0;
  const c = props.modelUsage?.rows.length ?? 0;
  const sum = a + b + c;
  return sum > 0 ? sum : null;
}

function countForMoreTab(props: MobileDashboardProps): number | null {
  const a = props.research?.papers.length ?? 0;
  const b = props.labs?.labs.length ?? 0;
  const c = props.rss?.sources.length ?? 0;
  const d = props.sdkAdoption?.packages.length ?? 0;
  const e = props.agents?.rows.length ?? 0;
  const sum = a + b + c + d + e;
  return sum > 0 ? sum : null;
}
