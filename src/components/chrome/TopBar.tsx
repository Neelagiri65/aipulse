"use client";

import { useEffect, useState } from "react";
import type { StatusResult } from "@/lib/data/fetch-status";
import { VERIFIED_SOURCES, PENDING_SOURCES } from "@/lib/data-sources";

export type TopBarProps = {
  status?: StatusResult;
};

/**
 * Sticky dashboard top bar. Brand pulse + severity summary (from real /api/status)
 * + sources verified count + UTC clock. No fake values — if status hasn't loaded,
 * the severity summary shows "—" rather than fabricating zeros.
 */
export function TopBar({ status }: TopBarProps) {
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
        <span className="block text-sm font-semibold tracking-tight">
          AI Pulse
        </span>
        <span className="ap-label-sm hidden md:inline-block">
          Real-time observatory · global AI ecosystem
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
    switch (v?.status) {
      case "operational":
        counts.operational += 1;
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
