"use client";

/**
 * Full-viewport chronological feed. Accepts a pre-merged, pre-sorted
 * list of wire rows (Dashboard owns the merge so the globe + map
 * share the same HN subset). Rows are a discriminated union:
 *   - kind "gh": GitHub event (existing grid).
 *   - kind "hn": Hacker News story (orange HN pill, whole-row link).
 *
 * Freshness is split. The GitHub side keeps its existing live · HH:MM:SS
 * stamp. A quiet staleness line surfaces under the header when the HN
 * side has not succeeded in > 30 minutes — silent while healthy.
 */

export type WireItem =
  | {
      kind: "gh";
      eventId: string;
      type: string;
      actor: string;
      repo: string;
      createdAt: string;
      hasAiConfig: boolean;
      sourceKind?: "events-api" | "gharchive";
    }
  | {
      kind: "hn";
      id: string;
      createdAt: string;
      title: string;
      author: string;
      points: number;
      numComments: number;
      hnUrl: string;
      locationLabel: string | null;
    };

export type WirePageProps = {
  wireRows: WireItem[];
  ghCoverage?: { windowMinutes: number; windowSize: number };
  hnMeta?: { lastFetchOkTs: string | null; staleMinutes: number | null };
  polledAt?: string;
  error?: string;
  isInitialLoading: boolean;
};

const HN_STALE_MINUTES = 30;

export function WirePage({
  wireRows,
  ghCoverage,
  hnMeta,
  polledAt,
  error,
  isInitialLoading,
}: WirePageProps) {
  const ghCount = wireRows.filter((r) => r.kind === "gh").length;
  const hnCount = wireRows.length - ghCount;
  const hnStale =
    hnMeta &&
    hnMeta.staleMinutes !== null &&
    hnMeta.staleMinutes > HN_STALE_MINUTES;

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
            {ghCoverage
              ? `Chronological · last ${ghCoverage.windowMinutes}m · ${wireRows.length} rows (${ghCount} gh · ${hnCount} hn)`
              : "Chronological feed"}
          </div>
          {hnStale && hnMeta && (
            <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-amber-400/80">
              HN: last fetched {hnMeta.staleMinutes}m ago
            </div>
          )}
        </div>
        <FreshnessStamp
          isLoading={isInitialLoading}
          error={error}
          polledAt={polledAt}
        />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[960px] px-6 pb-4">
          {isInitialLoading && wireRows.length === 0 && (
            <Empty label="Loading feed…" />
          )}
          {!isInitialLoading && error && wireRows.length === 0 && (
            <Empty label={`Feed error · ${error}`} tone="error" />
          )}
          {!isInitialLoading && !error && wireRows.length === 0 && (
            <Empty label="No rows in this window. Waiting for next poll." />
          )}
          {wireRows.length > 0 && (
            <ul className="space-y-1">
              {wireRows.map((r) =>
                r.kind === "gh" ? (
                  <GhRow key={`gh:${r.eventId}`} row={r} />
                ) : (
                  <HnRow key={`hn:${r.id}`} row={r} />
                ),
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function GhRow({
  row,
}: {
  row: Extract<WireItem, { kind: "gh" }>;
}) {
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

function HnRow({
  row,
}: {
  row: Extract<WireItem, { kind: "hn" }>;
}) {
  return (
    <li className="border-b border-border/40 hover:bg-white/[0.02]">
      <a
        href={row.hnUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="grid grid-cols-[70px_auto_1fr_auto] items-center gap-3 py-2 font-mono text-[11px]"
      >
        <span className="tabular-nums text-muted-foreground">
          {formatRelative(row.createdAt)}
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white"
          style={{ backgroundColor: "#ff6600" }}
        >
          HN · {row.points}
        </span>
        <span className="truncate text-foreground/90">{row.title}</span>
        <span className="justify-self-end truncate text-muted-foreground">
          @{row.author}
        </span>
      </a>
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
