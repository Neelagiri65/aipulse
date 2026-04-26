"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { WirePage, type WireItem } from "@/components/dashboard/WirePage";
import { ShareButton } from "@/components/chrome/ShareButton";
import { HealthCardGrid } from "@/components/health/HealthCardGrid";
import { ModelsPanel } from "@/components/models/ModelsPanel";
import { ResearchPanel } from "@/components/research/ResearchPanel";
import { BenchmarksPanel } from "@/components/benchmarks/BenchmarksPanel";
import { LabsPanel } from "@/components/labs/LabsPanel";
import { RegionalWirePanel } from "@/components/wire/RegionalWirePanel";
import { SdkAdoptionPanel } from "@/components/panels/sdk-adoption/SdkAdoptionPanel";
import { ModelUsagePanel } from "@/components/panels/model-usage/ModelUsagePanel";
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
import type { ModelUsageDto } from "@/lib/data/openrouter-types";
import type { CronHealthSnapshot } from "@/components/dashboard/MetricTicker";
import type { FreshnessState } from "@/components/chrome/TopBar";
import { track } from "@/lib/analytics";

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

export type MobilePanelId =
  | "map"
  | "wire"
  | "tools"
  | "models"
  | "research"
  | "benchmarks"
  | "labs"
  | "regional-wire"
  | "sdk-adoption"
  | "model-usage";

type MobileTab = {
  id: MobilePanelId;
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
  // Health
  cronHealth: CronHealthSnapshot | undefined;
};

/**
 * Mobile shell. Rendered only at viewports ≤767px (gated by `useIsMobile`
 * in Dashboard). The desktop "windows on a stage" paradigm fundamentally
 * doesn't fit a 375px screen; this component takes the same panel
 * components but stacks them as a single-active-tab feed: brand bar on
 * top, horizontally scrollable tab strip, full-width panel body below.
 */
export function MobileDashboard(props: MobileDashboardProps) {
  const [active, setActive] = useState<MobilePanelId>("map");

  const tabs: MobileTab[] = [
    { id: "map", label: "Map" },
    {
      id: "wire",
      label: "Wire",
      count: props.events?.coverage.windowSize ?? null,
    },
    {
      id: "tools",
      label: "Tools",
      count: props.status ? Object.keys(props.status.data).length : null,
    },
    { id: "models", label: "Models", count: props.models?.models.length ?? null },
    {
      id: "research",
      label: "Research",
      count: props.research?.papers.length ?? null,
    },
    {
      id: "benchmarks",
      label: "Bench",
      count:
        props.benchmarks && props.benchmarks.ok ? props.benchmarks.rows.length : null,
    },
    { id: "labs", label: "Labs", count: props.labs?.labs.length ?? null },
    {
      id: "regional-wire",
      label: "Regional",
      count: props.rss?.sources.length ?? null,
    },
    {
      id: "sdk-adoption",
      label: "SDK",
      count: props.sdkAdoption?.packages.length ?? null,
    },
    {
      id: "model-usage",
      label: "Usage",
      count: props.modelUsage?.rows.length ?? null,
    },
  ];

  const handleSelect = (id: MobilePanelId) => {
    setActive(id);
    track("panel_open", { panel: id, surface: "mobile" });
  };

  return (
    <div className="ap-mobile-shell" data-active-tab={active}>
      <header className="ap-mobile-topbar">
        <a href="/" className="ap-mobile-brand" aria-label="AI Pulse home">
          <span className="ap-live-dot" aria-hidden />
          <span className="ap-mobile-brand__name">AI PULSE</span>
          <span className="ap-mobile-brand__beta">BETA</span>
        </a>
        <FreshnessChip freshness={props.statusFreshness} />
        <ShareButton />
      </header>

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

      <main className="ap-mobile-body" role="tabpanel">
        {active === "map" && (
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
          </div>
        )}
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
        {active === "tools" && (
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
          <div className="ap-mobile-panel">
            <ModelsPanel
              data={props.models}
              error={props.modelsError ?? undefined}
              isInitialLoading={props.modelsLoading}
            />
          </div>
        )}
        {active === "research" && (
          <div className="ap-mobile-panel">
            <ResearchPanel
              data={props.research}
              error={props.researchError ?? undefined}
              isInitialLoading={props.researchLoading}
            />
          </div>
        )}
        {active === "benchmarks" && (
          <div className="ap-mobile-panel">
            <BenchmarksPanel
              data={props.benchmarks}
              error={props.benchmarksError ?? undefined}
              isInitialLoading={props.benchmarksLoading}
            />
          </div>
        )}
        {active === "labs" && (
          <div className="ap-mobile-panel">
            <LabsPanel
              data={props.labs}
              error={props.labsError ?? undefined}
              isInitialLoading={props.labsLoading}
            />
          </div>
        )}
        {active === "regional-wire" && (
          <div className="ap-mobile-panel">
            <RegionalWirePanel
              data={props.rss}
              error={props.rssError ?? undefined}
              isInitialLoading={props.rssLoading}
            />
          </div>
        )}
        {active === "sdk-adoption" && (
          <div className="ap-mobile-panel">
            <SdkAdoptionPanel
              data={props.sdkAdoption ?? null}
              error={props.sdkAdoptionError}
              isInitialLoading={props.sdkAdoptionLoading}
              originUrl={
                typeof window !== "undefined" ? window.location.origin : ""
              }
            />
          </div>
        )}
        {active === "model-usage" && (
          <div className="ap-mobile-panel">
            <ModelUsagePanel
              data={props.modelUsage ?? null}
              error={props.modelUsageError}
              isInitialLoading={props.modelUsageLoading}
              originUrl={
                typeof window !== "undefined" ? window.location.origin : ""
              }
            />
          </div>
        )}
      </main>

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
