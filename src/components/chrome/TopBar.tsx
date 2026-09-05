"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { StatusResult } from "@/lib/data/fetch-status";
import { VERIFIED_SOURCES, PENDING_SOURCES } from "@/lib/data-sources";
import { ThemeSwitch } from "@/components/chrome/ThemeSwitch";
import { PRIMARY_TABS, type PrimaryTab } from "@/components/chrome/primary-tabs";

export type FreshnessState = {
  /** True while the very first poll is in flight. */
  isInitialLoading: boolean;
  /** Last successful poll wall-clock time (ms epoch). */
  lastSuccessAt?: number;
  /** Polling interval in ms — used to decide when "live" becomes "stale". */
  intervalMs: number;
  /** Latest error string, if any. */
  error?: string;
};

/** @deprecated web v2: the five primary surfaces live in primary-tabs.ts. Kept as an alias for the transition. */
export type ViewTabId = PrimaryTab;

export type TopBarProps = {
  status?: StatusResult;
  freshness: FreshnessState;
  /** Current primary surface (Health · Feed · Map · Rooms · More). */
  activeTab?: PrimaryTab;
  onTabChange?: (tab: PrimaryTab) => void;
};

/**
 * Fixed-top header (web v2). Left: the gawk lockup. Centre: the five primary surfaces
 * (Health · Feed · Map · Rooms · More) from primary-tabs.ts — same ids as the mobile bottom
 * bar, so `?tab=` deep links work on both. Right: freshness pill, sources count, UTC clock,
 * theme switch and the one primary button.
 * Full-width (no max-w container) so the LeftNav rail can pin to the
 * literal viewport edge beneath it.
 */
export function TopBar({
  status,
  freshness,
  activeTab = "health",
  onTabChange,
}: TopBarProps) {
  const now = useUtcClock();
  const sev = deriveSeverity(status);
  const handleTab = (t: PrimaryTab) => onTabChange?.(t);

  return (
    <header
      className="fixed left-0 right-0 top-0 z-40 flex items-center border-b border-border/60 bg-background/80 backdrop-blur-md"
      style={{ height: 48 }}
    >
      <div className="flex items-center pl-4 pr-2">
        <Brand />
      </div>

      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
        <div className="pointer-events-auto ap-tabs" role="tablist" aria-label="View">
          {PRIMARY_TABS.map((tab) => (
            <TabButton
              key={tab.id}
              id={tab.id}
              label={tab.label}
              active={activeTab === tab.id}
              onSelect={handleTab}
            />
          ))}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3 pr-4">
        <FreshnessPill freshness={freshness} />
        <SourcesCount
          verified={VERIFIED_SOURCES.length}
          pending={PENDING_SOURCES.length}
        />
        {now && (
          <span className="hidden font-mono text-[11px] tracking-wider text-muted-foreground sm:inline">
            {now}
          </span>
        )}
        <ThemeSwitch className="hidden sm:inline-flex" />
        <Link
          href="/newsletter"
          data-testid="topbar-newsletter-cta"
          className="ap-btn-hot hidden sm:inline-flex"
        >
          Daily email
        </Link>
      </div>
    </header>
  );
}

function TabButton({
  id,
  label,
  active,
  onSelect,
}: {
  id: PrimaryTab;
  label: string;
  active: boolean;
  onSelect: (id: PrimaryTab) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`ap-tabs__item ${active ? "ap-tabs__item--active" : ""}`}
      onClick={() => onSelect(id)}
    >
      {label}
    </button>
  );
}

function FreshnessPill({ freshness }: { freshness: FreshnessState }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const { isInitialLoading, lastSuccessAt, intervalMs, error } = freshness;

  if (isInitialLoading && !lastSuccessAt) {
    return (
      <span className="ap-sev-pill ap-sev-pill--pending">
        <span className="ap-sev-dot ap-sev-dot--sm" aria-hidden />
        connecting…
      </span>
    );
  }
  if (!lastSuccessAt) {
    return (
      <span className="ap-sev-pill ap-sev-pill--outage" title={error}>
        <span className="ap-sev-dot ap-sev-dot--sm" aria-hidden />
        offline
      </span>
    );
  }
  const ageMs = Date.now() - lastSuccessAt;
  const stale = ageMs > intervalMs * 2;
  const variant = stale ? "degrade" : "op";
  const label = stale ? `stale · ${formatAge(ageMs)}` : `live · ${formatAge(ageMs)}`;
  return (
    <span className={`ap-sev-pill ap-sev-pill--${variant}`} title={error}>
      <span className="ap-sev-dot ap-sev-dot--sm" aria-hidden />
      {label}
    </span>
  );
}

function formatAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Nativerse mark + "gawk": the lockup mcp.gawk.dev already uses (PRD web-restyle-v2 §6). */
function Brand() {
  return (
    <Link href="/" className="ap-brand" aria-label="Gawk home">
      <span className="ap-brand__mark" aria-hidden />
      <span>gawk</span>
    </Link>
  );
}

function SeveritySummary({
  sev,
  loaded,
}: {
  sev: { outage: number; degraded: number; operational: number; unknown: number };
  loaded: boolean;
}) {
  return (
    <div className="hidden items-center gap-3 font-mono text-[10px] uppercase tracking-[0.1em] lg:flex">
      <SevSummaryItem
        color="var(--sev-outage)"
        label="outage"
        value={loaded ? sev.outage : "—"}
      />
      <SevSummaryItem
        color="var(--sev-degrade)"
        label="deg"
        value={loaded ? sev.degraded : "—"}
      />
      <SevSummaryItem
        color="var(--sev-op)"
        label="op"
        value={loaded ? sev.operational : "—"}
      />
    </div>
  );
}

function SevSummaryItem({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number | string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />
      <span className="text-foreground tabular-nums">{value}</span>
      <span>{label}</span>
    </span>
  );
}

function SourcesCount({
  verified,
  pending,
}: {
  verified: number;
  pending: number;
}) {
  return (
    <a
      href="/data-sources.md"
      target="_blank"
      rel="noopener noreferrer"
      className="hidden font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground md:inline"
      title="Source registry"
    >
      <span className="text-foreground tabular-nums">{verified}</span> src
      {pending > 0 ? (
        <>
          {" · "}
          <span className="text-foreground tabular-nums">{pending}</span> pend
        </>
      ) : null}
    </a>
  );
}

function deriveSeverity(status?: StatusResult) {
  const counts = { outage: 0, degraded: 0, operational: 0, unknown: 0 };
  if (!status) return counts;
  for (const v of Object.values(status.data)) {
    const hasActiveIncident = (v?.activeIncidents?.length ?? 0) > 0;
    switch (v?.status) {
      case "operational":
        if (hasActiveIncident) counts.degraded += 1;
        else counts.operational += 1;
        break;
      case "degraded":
        counts.degraded += 1;
        break;
      case "partial_outage":
      case "major_outage":
        counts.outage += 1;
        break;
      default:
        counts.unknown += 1;
    }
  }
  return counts;
}

function useUtcClock(): string {
  const [now, setNow] = useState("");
  useEffect(() => {
    setNow(fmtUtc(new Date()));
    const t = setInterval(() => setNow(fmtUtc(new Date())), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function fmtUtc(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}
