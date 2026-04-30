"use client";

import { SparklineMini } from "@/components/charts/SparklineMini";
import type {
  ArenaRowWithDelta,
  BenchmarksMeta,
  BenchmarksPayload,
  EloDelta,
  RankDelta,
} from "@/lib/data/benchmarks-lmarena";

/** Map<modelName, ratings oldest→newest> with `null` for days the model
 *  wasn't in the captured top-N. The dashboard fetches this from
 *  /api/benchmarks/history and passes it through. */
export type EloHistoryByModel = Record<string, Array<number | null>>;

export type BenchmarksPanelProps = {
  data: BenchmarksPayload | undefined;
  error: string | undefined;
  isInitialLoading: boolean;
  /** Per-row Elo history keyed by modelName. Optional — when absent or
   *  the model has no entry, the Trend cell renders empty. Sparkline
   *  retrofit (S48g). */
  eloHistory?: EloHistoryByModel;
};

/**
 * Top-20 models by Chatbot Arena Elo (lmarena-ai/leaderboard-dataset,
 * config=text, split=latest, category=overall).
 *
 * Trust contract: no re-ranking, no recomputation. Every number —
 * rating, 95% CI, vote count, rank/Elo delta — comes straight from the
 * committed JSON. Raw `model_name` and `organization` verbatim (the
 * latter may be empty when lmarena hasn't tagged a lab).
 *
 * PRD AC 6: footer caveat is surfaced verbatim so users see the known
 * critiques (style bias, self-selection, category overlap) alongside
 * the numbers.
 */
export function BenchmarksPanel({
  data,
  error,
  isInitialLoading,
  eloHistory,
}: BenchmarksPanelProps) {
  if (isInitialLoading && !data) {
    return (
      <div className="p-3">
        <AwaitingBody />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-3">
        <ErrorBody message={error ?? "No payload"} />
      </div>
    );
  }

  if (!data.ok) {
    if (data.reason === "not_yet_ingested") {
      return (
        <div className="p-3">
          <AwaitingBody message="Awaiting first ingest — cron runs daily at 03:15 UTC." />
        </div>
      );
    }
    return (
      <div className="p-3">
        <ErrorBody message={error ?? `Source unavailable (${data.reason})`} />
      </div>
    );
  }

  const stale = data.meta.staleDays > 14;

  return (
    <div className="flex h-full flex-col">
      {stale && <StalenessBanner days={data.meta.staleDays} />}
      <div className="flex-1 overflow-y-auto px-3 pb-2 pt-3">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              <th className="w-8 px-1 py-1 text-right">#</th>
              <th className="px-1 py-1 text-left">Model</th>
              <th className="px-1 py-1 text-left">Org</th>
              <th className="w-12 px-1 py-1 text-right">Elo</th>
              <th className="w-14 px-1 py-1 text-right">Votes</th>
              <th className="w-12 px-1 py-1 text-right">Δ Rank</th>
              <th className="w-12 px-1 py-1 text-right">Δ Elo</th>
              <th className="w-14 px-1 py-1 text-right">Trend</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <BenchmarkRow
                key={row.modelName}
                row={row}
                history={eloHistory?.[row.modelName]}
              />
            ))}
          </tbody>
        </table>
      </div>
      <FooterCaveat meta={data.meta} />
    </div>
  );
}

function BenchmarkRow({
  row,
  history,
}: {
  row: ArenaRowWithDelta;
  history?: Array<number | null>;
}) {
  const ciTitle = `95% CI: ${Math.round(row.ratingLower)} – ${Math.round(row.ratingUpper)}`;
  return (
    <tr
      className="border-t border-border/30 font-mono leading-snug hover:bg-muted/20"
      title={ciTitle}
    >
      <td className="px-1 py-1 text-right text-[9px] uppercase tracking-wider text-muted-foreground">
        {row.rank.toString().padStart(2, "0")}
      </td>
      <td className="px-1 py-1 text-left font-medium text-foreground">
        <span className="block truncate" title={row.modelName}>
          {row.modelName}
        </span>
      </td>
      <td className="px-1 py-1 text-left text-[10px] text-muted-foreground">
        <span className="block truncate" title={row.organization || "(not tagged)"}>
          {row.organization || "—"}
        </span>
      </td>
      <td className="px-1 py-1 text-right tabular-nums text-foreground">
        {Math.round(row.rating)}
      </td>
      <td className="px-1 py-1 text-right text-[10px] tabular-nums text-muted-foreground">
        {formatVotes(row.voteCount)}
      </td>
      <td className="px-1 py-1 text-right text-[10px]">
        <RankDeltaBadge delta={row.rankDelta} />
      </td>
      <td className="px-1 py-1 text-right text-[10px]">
        <EloDeltaBadge delta={row.eloDelta} />
      </td>
      <td
        className="px-1 py-1 text-right text-emerald-300/70"
        data-testid="benchmark-trend-cell"
      >
        <TrendCell history={history} modelName={row.modelName} />
      </td>
    </tr>
  );
}

function TrendCell({
  history,
  modelName,
}: {
  history?: Array<number | null>;
  modelName: string;
}) {
  // No history fetched yet (initial paint, or /api/benchmarks/history
  // is loading) → render an empty placeholder rather than `—`. Avoids
  // the column flickering as data arrives.
  if (!history || history.length === 0) {
    return <span className="block h-[14px] w-[48px]" aria-hidden="true" />;
  }
  const nonNull = history.filter((v): v is number => v !== null).length;
  // Single-day or all-null: show a dash so the row reads cleanly. Two
  // points is the minimum a line conveys; anything less is noise.
  if (nonNull < 2) {
    return (
      <span
        className="inline-block h-[14px] w-[48px] text-center text-[10px] text-muted-foreground/60"
        title="Insufficient history"
      >
        —
      </span>
    );
  }
  return (
    <span
      className="inline-block align-middle"
      title={`14-day Elo history for ${modelName}`}
    >
      <SparklineMini
        data={history}
        width={48}
        height={14}
        strokeWidth={1}
        padding={1}
        label={`14-day Elo history for ${modelName}`}
      />
    </span>
  );
}

function RankDeltaBadge({ delta }: { delta: RankDelta }) {
  if (delta.kind === "new") {
    return <span className="font-mono text-[9px] uppercase tracking-wider text-sky-300/90">NEW</span>;
  }
  if (delta.kind === "same") {
    return <span className="font-mono text-muted-foreground/60">—</span>;
  }
  if (delta.kind === "up") {
    return (
      <span className="font-mono tabular-nums text-emerald-400/90">
        ▲{delta.amount}
      </span>
    );
  }
  return (
    <span className="font-mono tabular-nums text-rose-400/90">
      ▼{delta.amount}
    </span>
  );
}

function EloDeltaBadge({ delta }: { delta: EloDelta }) {
  if (delta.kind === "new") {
    return <span className="font-mono text-[9px] uppercase tracking-wider text-sky-300/90">NEW</span>;
  }
  if (delta.kind === "same") {
    return <span className="font-mono text-muted-foreground/60">—</span>;
  }
  const positive = delta.amount > 0;
  return (
    <span
      className={`font-mono tabular-nums ${positive ? "text-emerald-400/90" : "text-rose-400/90"}`}
    >
      {positive ? "+" : "−"}
      {Math.abs(delta.amount)}
    </span>
  );
}

function StalenessBanner({ days }: { days: number }) {
  return (
    <div
      className="border-b border-amber-500/30 bg-amber-500/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-amber-300/90"
      role="status"
    >
      Last updated {days} days ago — source has not refreshed
    </div>
  );
}

function FooterCaveat({ meta }: { meta: BenchmarksMeta }) {
  return (
    <div className="border-t border-border/30 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
      <p>
        Elo ratings from{" "}
        <a
          href="https://lmarena.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          Chatbot Arena (lmarena.ai)
        </a>{" "}
        — Bradley-Terry scores computed from{" "}
        <span className="tabular-nums text-foreground/80">
          {meta.totalVotes.toLocaleString()}
        </span>{" "}
        pairwise human preference votes. Dataset:{" "}
        <a
          href="https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          lmarena-ai/leaderboard-dataset
        </a>{" "}
        · published {meta.leaderboardPublishDate}. Known critiques: style bias
        (verbose answers score higher), self-selection (volunteer voters ≠
        general users), category overlap.
      </p>
    </div>
  );
}

function AwaitingBody({ message }: { message?: string }) {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-200/90">
      <p className="ap-label-sm" style={{ color: "var(--sev-degrade)" }}>
        Awaiting first poll
      </p>
      <p className="mt-1 leading-relaxed">
        {message ?? "Source verified. Fetching Chatbot Arena snapshot…"}
      </p>
    </div>
  );
}

function ErrorBody({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-muted/30 p-2.5 text-xs text-muted-foreground">
      <p className="ap-label-sm">Source unreachable</p>
      <p className="mt-1 leading-relaxed">{message}</p>
    </div>
  );
}

function formatVotes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}
