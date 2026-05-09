"use client";

import type { StatusResult } from "@/lib/data/fetch-status";
import type { FreshnessState } from "@/components/chrome/TopBar";
import { ShareButton } from "@/components/chrome/ShareButton";

export type CronHealthSummary = {
  total: number;
  healthy: number;
  stale: number;
};

export type StatusBarProps = {
  status?: StatusResult;
  freshness: FreshnessState;
  verifiedSourceCount: number;
  pendingSourceCount: number;
  cronHealth?: CronHealthSummary;
};

/**
 * Single-line status bar between TopBar and the map stage (design-spec-v2
 * FIX-09). Gives instant system health without opening the Tools panel:
 * "4/5 OPERATIONAL · 1 DEGRADED · 23 SOURCES · 7/7 CRONS · LIVE".
 *
 * Tone fold (mirrors MetricsRow.toolsOpsCard and TopBar.deriveSeverity):
 * an "operational" tool with an active incident counts as degraded, not
 * operational — that's the trust invariant. A stale cron (no success in
 * 2× its expected interval) folds into the degraded bucket: the data it
 * feeds is ageing even if nothing visibly errored. Overall tone is red
 * if any outage, amber if any degraded-class signal, green otherwise.
 */
export function StatusBar({
  status,
  freshness,
  verifiedSourceCount,
  pendingSourceCount,
  cronHealth,
}: StatusBarProps) {
  const sev = deriveSev(status);
  const total = sev.total;
  const cronStale = cronHealth?.stale ?? 0;
  const tone: Tone =
    total === 0
      ? "pending"
      : sev.outage > 0
        ? "bad"
        : sev.degraded > 0 || cronStale > 0
          ? "warn"
          : "good";

  const liveLabel = deriveLive(freshness);

  return (
    <div
      className="fixed left-0 right-0 z-[39] flex items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-md"
      style={{ top: 48, height: 28 }}
      role="status"
      aria-label="System status summary"
      data-testid="global-status-bar"
    >
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: toneColor(tone), boxShadow: `0 0 6px ${toneColor(tone)}` }}
        aria-hidden
      />
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em]">
        <a
          href="/sources"
          className="text-muted-foreground hover:text-foreground"
          title="Source list — what feeds the dashboard"
          data-testid="status-bar-sources-link"
        >
          <span className="text-foreground tabular-nums">
            {verifiedSourceCount}
          </span>{" "}
          Sources
          {pendingSourceCount > 0 && (
            <>
              {" · "}
              <span className="text-amber-400 tabular-nums">
                {pendingSourceCount}
              </span>{" "}
              Pend
            </>
          )}
        </a>
        {cronHealth && cronHealth.total > 0 && (
          <>
            <Divider />
            <a
              href="/api/cron-health"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              title={
                cronHealth.stale > 0
                  ? `${cronHealth.stale} cron workflow${cronHealth.stale === 1 ? "" : "s"} have not run in 2× their expected interval`
                  : "All monitored cron workflows ran within their expected interval"
              }
            >
              {cronHealth.stale > 0 ? (
                <>
                  <span
                    className="tabular-nums"
                    style={{ color: "var(--sev-op)" }}
                  >
                    {cronHealth.healthy}/{cronHealth.total}
                  </span>{" "}
                  Crons
                  <span aria-hidden className="mx-1 text-muted-foreground/50">
                    ·
                  </span>
                  <span
                    className="tabular-nums"
                    style={{ color: "var(--sev-degrade)" }}
                  >
                    {cronHealth.stale}
                  </span>{" "}
                  Stale
                </>
              ) : (
                <>
                  <span
                    className="tabular-nums"
                    style={{ color: "var(--sev-op)" }}
                  >
                    {cronHealth.healthy}/{cronHealth.total}
                  </span>{" "}
                  Crons
                </>
              )}
            </a>
          </>
        )}
        <Divider />
        <span
          className={`tabular-nums ${liveLabel.className}`}
          title={freshness.error}
        >
          {liveLabel.text}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <ShareButton />
      </div>
    </div>
  );
}

type Tone = "good" | "warn" | "bad" | "pending";

function toneColor(tone: Tone): string {
  switch (tone) {
    case "good":
      return "var(--sev-op)";
    case "warn":
      return "var(--sev-degrade)";
    case "bad":
      return "var(--sev-outage)";
    default:
      return "var(--sev-pending)";
  }
}

function Segment({
  value,
  label,
  color,
}: {
  value: string | number;
  label: string;
  color: string;
}) {
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <span className="tabular-nums" style={{ color }}>
        {value}
      </span>
      <span>{label}</span>
    </span>
  );
}

function Divider() {
  return (
    <span className="text-muted-foreground/50" aria-hidden>
      ·
    </span>
  );
}

type SevCounts = {
  operational: number;
  degraded: number;
  outage: number;
  unknown: number;
  total: number;
};

export function deriveSev(status?: StatusResult): SevCounts {
  const counts: SevCounts = {
    operational: 0,
    degraded: 0,
    outage: 0,
    unknown: 0,
    total: 0,
  };
  if (!status) return counts;
  const values = Object.values(status.data);
  counts.total = values.length;
  for (const v of values) {
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

function deriveLive(freshness: FreshnessState): {
  text: string;
  className: string;
} {
  const { isInitialLoading, lastSuccessAt, intervalMs, error } = freshness;
  if (isInitialLoading && !lastSuccessAt) {
    return { text: "Connecting", className: "text-muted-foreground italic" };
  }
  if (!lastSuccessAt) {
    return { text: "Offline", className: "text-rose-400" };
  }
  if (error) {
    return { text: "Stale", className: "text-amber-400" };
  }
  const stale = Date.now() - lastSuccessAt > intervalMs * 2;
  return stale
    ? { text: "Stale", className: "text-amber-400" }
    : { text: "Live", className: "text-emerald-400" };
}
