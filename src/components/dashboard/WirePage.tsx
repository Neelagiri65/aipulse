"use client";

import { useMemo } from "react";
import type { GlobeEventsResult } from "@/lib/data/fetch-events";

export type WirePageProps = {
  events?: GlobeEventsResult;
  error?: string;
  isInitialLoading: boolean;
};

type WireRow = {
  eventId: string;
  type: string;
  actor: string;
  repo: string;
  createdAt: string;
  hasAiConfig: boolean;
  sourceKind?: "events-api" | "gharchive";
};

/**
 * Full-viewport chronological feed. Same data source as the floating
 * LiveFeed panel, just wider and denser — one row per event, up to the
 * full window. No fake entries; empty pipeline shows an empty state.
 */
export function WirePage({ events, error, isInitialLoading }: WirePageProps) {
  const rows = useMemo(() => toRows(events), [events]);

  return (
    <div className="flex h-full w-full flex-col">
      <header className="mx-auto flex w-full max-w-[960px] items-end justify-between px-6 pb-3 pt-2">
        <div>
          <div
            className="font-mono text-[10px] uppercase"
            style={{ color: "var(--ap-accent)", letterSpacing: "0.14em" }}
          >
            The Wire
          </div>
          <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {events?.coverage.windowMinutes
              ? `Chronological · last ${events.coverage.windowMinutes}m · ${rows.length} events`
              : "Chronological feed"}
          </div>
        </div>
        <FreshnessStamp
          isLoading={isInitialLoading}
          error={error}
          polledAt={events?.polledAt}
        />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[960px] px-6 pb-4">
          {isInitialLoading && !events && (
            <Empty label="Loading events…" />
          )}
          {!isInitialLoading && error && !events && (
            <Empty label={`Feed error · ${error}`} tone="error" />
          )}
          {!isInitialLoading && !error && rows.length === 0 && (
            <Empty label="No placeable events in this window. Waiting for next poll." />
          )}
          {rows.length > 0 && (
            <ul className="space-y-1">
              {rows.map((r) => (
                <WireRowItem key={r.eventId} row={r} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function toRows(events?: GlobeEventsResult): WireRow[] {
  if (!events) return [];
  return events.points
    .map((p): WireRow | null => {
      const meta = p.meta as WireRow | undefined;
      if (!meta?.eventId) return null;
      return meta;
    })
    .filter((r): r is WireRow => r !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function WireRowItem({ row }: { row: WireRow }) {
  const variant = row.hasAiConfig ? "info" : "pending";
  return (
    <li className="grid grid-cols-[70px_90px_90px_1fr_auto] items-center gap-3 border-b border-border/40 py-2 font-mono text-[11px] hover:bg-white/[0.02]">
      <span className="tabular-nums text-muted-foreground">
        {formatRelative(row.createdAt)}
      </span>
      <span className={`ap-sev-pill ap-sev-pill--${variant}`}>
        <span className="ap-sev-dot ap-sev-dot--sm" aria-hidden />
        {row.hasAiConfig ? "ai-cfg" : "no-cfg"}
      </span>
      <span className="ap-label-sm truncate">{prettyType(row.type)}</span>
      <a
        href={`https://github.com/${row.repo}`}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate text-foreground/90 underline decoration-dotted underline-offset-2 hover:text-foreground"
      >
        {row.repo}
      </a>
      <div className="flex items-center gap-2 justify-self-end text-muted-foreground">
        <span className="truncate">@{row.actor}</span>
        {row.sourceKind === "gharchive" && (
          <span className="ap-sev-pill ap-sev-pill--pending">archive</span>
        )}
      </div>
    </li>
  );
}

function FreshnessStamp({
  isLoading,
  error,
  polledAt,
}: {
  isLoading: boolean;
  error?: string;
  polledAt?: string;
}) {
  if (isLoading && !polledAt) {
    return (
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        polling…
      </span>
    );
  }
  if (error && !polledAt) {
    return (
      <span className="font-mono text-[10px] uppercase tracking-wider text-rose-400/90">
        error
      </span>
    );
  }
  return (
    <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-400/90">
      live · {polledAt ? formatClock(polledAt) : "—"}
    </span>
  );
}

function Empty({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "error";
}) {
  const toneClass =
    tone === "error"
      ? "border-rose-500/40 text-rose-300/90"
      : "border-dashed border-border/40 text-muted-foreground";
  return (
    <div
      className={`mt-6 rounded-md border p-8 text-center font-mono text-xs uppercase tracking-wider ${toneClass}`}
    >
      {label}
    </div>
  );
}

function prettyType(t: string): string {
  return t.replace(/Event$/, "");
}

function formatClock(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(11, 19) + "Z";
  } catch {
    return iso;
  }
}

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.max(0, Math.floor(diff / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  } catch {
    return "—";
  }
}
