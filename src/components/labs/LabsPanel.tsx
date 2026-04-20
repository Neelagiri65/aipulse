"use client";

import type { LabActivity, LabsPayload } from "@/lib/data/fetch-labs";

/**
 * AI Labs panel — lists every tracked lab from data/ai-labs.json sorted
 * by 7-day event total (desc). Every row carries a name, industry /
 * academic / non-profit badge, city + country, repo count, the 7d total,
 * and a tiny bar whose width is the lab's share of the panel's max.
 *
 * The panel is NOT a leaderboard. Ranking here is only useful as a "who's
 * publicly active this week" readout; the registry criteria
 * (≥ 1 public GH org, verifiable HQ source) are pre-committed and the
 * underlying numbers are raw event counts with no re-weighting. If HF
 * or GH is down, rows render with `stale` indicators rather than zeros
 * silently inflating into a false narrative.
 */

export type LabsPanelProps = {
  data: LabsPayload | undefined;
  error: string | undefined;
  isInitialLoading: boolean;
};

export function LabsPanel({ data, error, isInitialLoading }: LabsPanelProps) {
  if (isInitialLoading && !data) {
    return (
      <div className="p-3">
        <AwaitingBody />
      </div>
    );
  }
  if (!data || data.labs.length === 0) {
    return (
      <div className="p-3">
        <ErrorBody message={error ?? "No labs returned"} />
      </div>
    );
  }

  const sorted = [...data.labs].sort((a, z) => z.total - a.total);
  const maxTotal = Math.max(1, ...sorted.map((l) => l.total));

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-3 pb-2 pt-3">
        <ul className="space-y-1.5">
          {sorted.map((lab, idx) => (
            <LabRow key={lab.id} lab={lab} rank={idx + 1} maxTotal={maxTotal} />
          ))}
        </ul>
      </div>
      <SourceFooter
        generatedAt={data.generatedAt}
        failureCount={data.failures.length}
      />
    </div>
  );
}

function LabRow({
  lab,
  rank,
  maxTotal,
}: {
  lab: LabActivity;
  rank: number;
  maxTotal: number;
}) {
  const pct = Math.round((lab.total / maxTotal) * 100);
  const loc = [lab.city, lab.country].filter(Boolean).join(", ");
  return (
    <li className="rounded-md border border-border/40 bg-card/30 p-2 text-[11px] leading-snug">
      <div className="flex items-baseline gap-2">
        <span className="w-5 shrink-0 text-right font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          {rank.toString().padStart(2, "0")}
        </span>
        <a
          href={lab.url}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 truncate font-medium text-foreground underline-offset-2 hover:underline"
          title={lab.displayName}
        >
          {lab.displayName}
        </a>
        <span
          className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground tabular-nums"
          title={`${lab.total.toLocaleString()} events in the last 7 days`}
        >
          {lab.total.toLocaleString()} · 7d
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 pl-7 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/80">
        <KindPill kind={lab.kind} />
        <span className="truncate">{loc || "—"}</span>
        <span className="ml-auto shrink-0">
          {lab.repos.length} repo{lab.repos.length === 1 ? "" : "s"}
        </span>
        {lab.stale && (
          <span
            className="shrink-0 rounded-sm border border-amber-500/40 bg-amber-500/10 px-1 py-[1px] text-[8px] tracking-wider text-amber-400"
            title="At least one tracked repo returned stale"
          >
            stale
          </span>
        )}
      </div>
      <div
        className="mt-1 ml-7 h-[3px] rounded-sm bg-white/5"
        aria-hidden
      >
        <div
          className="h-full rounded-sm"
          style={{
            width: `${Math.max(2, pct)}%`,
            backgroundColor: "#a855f7",
            opacity: lab.total === 0 ? 0.25 : 0.85,
          }}
        />
      </div>
    </li>
  );
}

function KindPill({
  kind,
}: {
  kind: "industry" | "academic" | "non-profit";
}) {
  const label =
    kind === "industry" ? "IND" : kind === "academic" ? "ACA" : "NGO";
  const cls =
    kind === "industry"
      ? "ap-sev-pill ap-sev-pill--info"
      : "ap-sev-pill ap-sev-pill--pending";
  return <span className={cls}>{label}</span>;
}

function SourceFooter({
  generatedAt,
  failureCount,
}: {
  generatedAt: string;
  failureCount: number;
}) {
  const t = (() => {
    try {
      return new Date(generatedAt).toISOString().replace("T", " ").slice(0, 16);
    } catch {
      return generatedAt;
    }
  })();
  return (
    <div className="border-t border-border/40 px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
      <span>Source: </span>
      <a
        href="https://github.com/Neelagiri65/aipulse/blob/main/data/ai-labs.json"
        target="_blank"
        rel="noopener noreferrer"
        className="underline-offset-2 hover:text-foreground hover:underline"
      >
        data/ai-labs.json
      </a>
      <span> + </span>
      <a
        href="https://docs.github.com/en/rest/activity/events#list-repository-events"
        target="_blank"
        rel="noopener noreferrer"
        className="underline-offset-2 hover:text-foreground hover:underline"
      >
        GH Repo Events
      </a>
      <span className="ml-2">· refreshed {t}Z</span>
      {failureCount > 0 && (
        <span
          className="ml-2 rounded-sm border border-amber-500/40 bg-amber-500/10 px-1 py-[1px] text-amber-400"
          title={`${failureCount} repo fetch(es) failed this run`}
        >
          {failureCount} stale
        </span>
      )}
    </div>
  );
}

function AwaitingBody() {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 px-6 py-8 text-center font-mono text-[10px] uppercase tracking-wider text-amber-400/90">
      <span>awaiting first labs poll</span>
      <span className="text-amber-400/70">
        /api/labs · 6h upstream cache
      </span>
    </div>
  );
}

function ErrorBody({ message }: { message: string }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-rose-500/40 bg-rose-500/5 px-6 py-8 text-center font-mono text-[10px] uppercase tracking-wider text-rose-400/90">
      <span>labs feed unavailable</span>
      <span className="text-rose-400/70">{message}</span>
    </div>
  );
}
