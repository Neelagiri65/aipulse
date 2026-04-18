"use client";

import { useEffect, useState } from "react";
import type { StatusResult } from "@/lib/data/fetch-status";
import { VERIFIED_SOURCES, PENDING_SOURCES } from "@/lib/data-sources";

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

export type TopBarProps = {
  status?: StatusResult;
  /** Status-poll freshness — drives the live/stale/connecting indicator. */
  freshness: FreshnessState;
};

/**
 * Sticky dashboard top bar. Brand + severity summary (from real /api/status,
 * with active incidents folded into "degraded") + freshness pill + sources
 * count + UTC clock. The freshness pill replaces the static "LIVE" lie:
 * CONNECTING during initial poll, LIVE · {age} when fresh, STALE when older
 * than 2× the poll interval.
 */
export function TopBar({ status, freshness }: TopBarProps) {
  const now = useUtcClock();
  const sev = deriveSeverity(status);

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-4 px-4 py-2.5">
        <Brand />

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          <NavTab href="/" active>
            Live
          </NavTab>
          <NavTab href="/audit">Audit</NavTab>
          <NavTab href="/data-sources.md" external>
            Sources
          </NavTab>
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <FreshnessPill freshness={freshness} />
          <SeveritySummary sev={sev} loaded={status !== undefined} />
          <SourcesCount
            verified={VERIFIED_SOURCES.length}
            pending={PENDING_SOURCES.length}
          />
          <span className="hidden font-mono text-[11px] tracking-wider text-muted-foreground sm:inline">
            {now}
          </span>
        </div>
      </div>
    </header>
  );
}

function FreshnessPill({ freshness }: { freshness: FreshnessState }) {
  const [, force] = useState(0);
  // Re-render every second so the age display ticks. Cheap (<1ms).
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

function Brand() {
  return (
    <a href="/" className="flex items-center gap-3">
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full"
        style={{ background: "rgba(45, 212, 191, 0.18)" }}
      >
        <span className="ap-live-dot" />
      </span>
      <span>
        <span className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-tight">AI Pulse</span>
          <span className="ap-label-sm" style={{ color: "var(--sev-pending)" }}>
            mvp · 5 tracked · 1 gap
          </span>
        </span>
        <span className="ap-label-sm hidden md:inline-block">
          Live status &amp; activity monitor · AI coding tools
        </span>
      </span>
    </a>
  );
}

function NavTab({
  href,
  children,
  active,
  external,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={
        "px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors " +
        (active
          ? "text-teal-400"
          : "text-muted-foreground hover:text-foreground")
      }
      style={
        active
          ? { borderBottom: "2px solid #2dd4bf", boxShadow: "0 1px 0 0 rgba(45,212,191,0.2)" }
          : undefined
      }
    >
      {children}
    </a>
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
        label="degraded"
        value={loaded ? sev.degraded : "—"}
      />
      <SevSummaryItem
        color="var(--sev-op)"
        label="operational"
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
    <span className="hidden font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground md:inline">
      <span className="text-foreground tabular-nums">{verified}</span> verified
      {pending > 0 ? (
        <>
          {" · "}
          <span className="text-amber-400 tabular-nums">{pending}</span> pending
        </>
      ) : null}
    </span>
  );
}

function deriveSeverity(status?: StatusResult) {
  const counts = { outage: 0, degraded: 0, operational: 0, unknown: 0 };
  if (!status) return counts;
  for (const v of Object.values(status.data)) {
    // A tool with active unresolved incidents is NOT operational, even if the
    // upstream component status says so. Statuspage flips components green
    // during the `monitoring` phase before the incident is resolved.
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
  const [now, setNow] = useState(() => fmtUtc(new Date()));
  useEffect(() => {
    const t = setInterval(() => setNow(fmtUtc(new Date())), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function fmtUtc(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}
