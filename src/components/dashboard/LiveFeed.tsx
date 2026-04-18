"use client";

import type { GlobeEventsResult } from "@/lib/data/fetch-events";

export type LiveFeedProps = {
  events?: GlobeEventsResult;
  error?: string;
  isInitialLoading: boolean;
};

type FeedRow = {
  eventId: string;
  type: string;
  actor: string;
  repo: string;
  createdAt: string;
  hasAiConfig: boolean;
};

export function LiveFeed({ events, error, isInitialLoading }: LiveFeedProps) {
  const rows = toRows(events);

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {events?.coverage?.windowMinutes ? `Last ${events.coverage.windowMinutes}m` : "Live feed"}
        </h2>
        <FeedStatus
          isLoading={isInitialLoading}
          error={error}
          polledAt={events?.polledAt}
          rowCount={rows.length}
        />
      </div>

      {isInitialLoading && <FeedPlaceholder label="Loading events…" />}

      {!isInitialLoading && error && !events && (
        <FeedPlaceholder
          label={`Feed error · ${error}`}
          tone="error"
        />
      )}

      {!isInitialLoading && !error && rows.length === 0 && (
        <FeedPlaceholder
          label="GitHub Events returned no placeable AI-config events in this window. Waiting for next poll."
        />
      )}

      {rows.length > 0 && (
        <ul className="flex-1 space-y-1.5 overflow-y-auto pr-1">
          {rows.map((row) => (
            <FeedRowItem key={row.eventId} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

function toRows(events?: GlobeEventsResult): FeedRow[] {
  if (!events) return [];
  return events.points
    .map((p): FeedRow | null => {
      const meta = p.meta as FeedRow | undefined;
      if (!meta?.eventId) return null;
      return meta;
    })
    .filter((r): r is FeedRow => r !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);
}

function FeedStatus({
  isLoading,
  error,
  polledAt,
  rowCount,
}: {
  isLoading: boolean;
  error?: string;
  polledAt?: string;
  rowCount: number;
}) {
  if (isLoading) {
    return (
      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        polling…
      </span>
    );
  }
  if (error && !polledAt) {
    return (
      <span className="font-mono text-[9px] uppercase tracking-wider text-rose-400/90">
        error
      </span>
    );
  }
  return (
    <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-400/90">
      {rowCount} live · {polledAt ? formatClock(polledAt) : "—"}
    </span>
  );
}

function FeedRowItem({ row }: { row: FeedRow }) {
  const color = row.hasAiConfig ? "bg-teal-400" : "bg-zinc-400";
  return (
    <li className="rounded-md border border-border/40 bg-background/40 p-2 text-xs">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ boxShadow: row.hasAiConfig ? "0 0 6px #2dd4bf" : "none" }}
          aria-hidden
        >
          <span className={`block h-full w-full rounded-full ${color}`} />
        </span>
        <span className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {prettyType(row.type)}
        </span>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
          {formatRelative(row.createdAt)}
        </span>
      </div>
      <div className="mt-1 truncate text-[11px] text-foreground/90">
        <a
          href={`https://github.com/${row.repo}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          {row.repo}
        </a>
      </div>
      <div className="truncate font-mono text-[10px] text-muted-foreground">
        @{row.actor}
      </div>
    </li>
  );
}

function FeedPlaceholder({
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
      className={`flex flex-1 items-center justify-center rounded-md border p-4 text-center text-xs ${toneClass}`}
    >
      <p>{label}</p>
    </div>
  );
}

function prettyType(t: string): string {
  return t.replace(/Event$/, "");
}

function formatClock(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toISOString().slice(11, 19) + "Z";
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
