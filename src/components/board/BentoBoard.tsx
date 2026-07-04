/**
 * BentoBoard — prototype of gawk's condensed "state of the AI ecosystem"
 * representation (research 2026-06-29: dense, source-grouped, Tufte-clean;
 * replaces the map as the at-a-glance primary).
 *
 * Pure server component: renders entirely from the existing FeedResponse —
 * one loader, every number already carries a primary-source URL. Trust
 * non-negotiables preserved:
 *   - provenance: every row links its sourceUrl (no number without a source)
 *   - no scoring: severity is the existing sort key, not an invented rank
 *   - graceful degradation: staleSources → "as of <time>" badge per domain;
 *     a quiet domain shows an explicit quiet state, never a fabricated value
 *   - honest emptiness: a DEGRADED source (e.g. OpenRouter on
 *     catalogue-fallback) is labelled "source degraded", never collapsed
 *     into "quiet" — an empty tile must say WHY it is empty
 *   - deterministic: headlines are the feed's deterministic copy, no LLM
 *
 * v1 = dense card bento. v2 (next): inline sparklines per tile from the
 * time-series snapshots (openrouter-store etc.).
 */

import type { Card, CardType, ContainedSource, FeedResponse } from "@/lib/feed/types";
import { SparklineMini } from "@/components/charts/SparklineMini";
import {
  EMPTY_BOARD_SERIES,
  type BoardSeries,
} from "@/lib/board/series";

type Domain = {
  key: string;
  title: string;
  types: CardType[];
  /** Column span on the 12-col desktop grid (tile-size hierarchy). */
  span: string;
  /** Which 30-day snapshot series to sparkline, if any. Feed-only domains
   *  (no captured history) omit this and render without a sparkline. */
  seriesKey?: keyof BoardSeries;
  /** Human label for the sparkline (accessibility). */
  seriesLabel?: string;
  /** Canonical source name feeding this domain. Lets a tile match a
   *  degraded/stale source even when it has ZERO cards to match against
   *  (an empty tile carries no card.sourceName otherwise). */
  sourceName?: string;
};

// Tile-size hierarchy: the busiest / highest-signal domains get more room.
const DOMAINS: Domain[] = [
  { key: "models", title: "Models", types: ["MODEL_MOVER"], span: "lg:col-span-4", seriesKey: "models", seriesLabel: "Top benchmark Elo, last 30 days", sourceName: "OpenRouter" },
  { key: "tools", title: "Tool Health", types: ["TOOL_ALERT"], span: "lg:col-span-4", seriesKey: "tools", seriesLabel: "Tools operational, last 30 days" },
  { key: "packages", title: "Packages / SDKs", types: ["SDK_TREND"], span: "lg:col-span-4", seriesKey: "packages", seriesLabel: "Weekly package downloads, last 30 days", sourceName: "SDK registries" },
  { key: "launches", title: "Launches", types: ["PRODUCT_LAUNCH"], span: "lg:col-span-3" },
  { key: "releases", title: "Releases", types: ["NEW_RELEASE"], span: "lg:col-span-3" },
  { key: "research", title: "Research", types: ["RESEARCH"], span: "lg:col-span-3" },
  { key: "discussion", title: "Discussion", types: ["NEWS"], span: "lg:col-span-3" },
  { key: "labs", title: "Labs", types: ["LAB_HIGHLIGHT"], span: "lg:col-span-12", seriesKey: "labs", seriesLabel: "Tracked-lab activity, last 30 days" },
];

/** A series is worth drawing only with ≥2 real (non-null) points. */
function hasSeries(series: Array<number | null> | undefined): boolean {
  return !!series && series.filter((v) => v !== null).length >= 2;
}

function fmtTime(iso: string): string {
  // Deterministic HH:MM UTC — no locale drift between server/client.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} UTC`;
}

/** Severity → a single non-colour-only accent label + dot class. */
function severityAccent(sev: number): { label: string; dot: string } {
  if (sev >= 80) return { label: "high", dot: "bg-red-400" };
  if (sev >= 50) return { label: "notable", dot: "bg-amber-400" };
  return { label: "routine", dot: "bg-neutral-500" };
}

function CardRow({ card }: { card: Card }) {
  const a = severityAccent(card.severity);
  return (
    <li className="group flex items-start gap-2 py-1.5 border-t border-neutral-800/70 first:border-t-0">
      <span
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${a.dot}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <a
          href={card.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Source: ${card.sourceName} · ${fmtTime(card.timestamp)} · severity ${card.severity} (${a.label})`}
          className="block truncate text-[13px] leading-tight text-neutral-100 hover:text-white hover:underline decoration-neutral-600"
        >
          {card.headline}
        </a>
        {card.detail ? (
          <span className="block truncate text-[11px] leading-tight text-neutral-400">
            {card.detail}
          </span>
        ) : null}
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-neutral-500">
        {fmtTime(card.timestamp)}
      </span>
    </li>
  );
}

function Tile({
  domain,
  cards,
  staleAsOf,
  degradedReason,
  contained,
  series,
}: {
  domain: Domain;
  cards: Card[];
  staleAsOf: string | null;
  /** Non-null when this domain's source is serving a degraded fallback. */
  degradedReason: string | null;
  /** Non-null when the containment loop has QUARANTINED this domain's
   *  source — the strongest disclosure; wins over degraded and stale. */
  contained: ContainedSource | null;
  series?: Array<number | null>;
}) {
  const top = cards.slice(0, domain.key === "labs" ? 6 : 4);
  const showSpark = hasSeries(series);
  return (
    <section
      className={`flex flex-col rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 ${domain.span}`}
    >
      <header className="mb-1.5 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          {domain.title}
        </h2>
        <div className="flex items-center gap-2">
          {showSpark ? (
            <span
              className="text-neutral-500"
              title={`${domain.seriesLabel ?? "Trend"} (source: daily snapshots)`}
            >
              <SparklineMini
                data={series as Array<number | null>}
                width={56}
                height={14}
                label={domain.seriesLabel ?? `${domain.title} trend`}
                strokeWidth={1}
              />
            </span>
          ) : null}
          <span className="text-[10px] tabular-nums text-neutral-500">
            {/* Precedence: quarantined (containment loop stopped this
                source's signal) over degraded (serving a fallback) over
                stale (real-but-old) over a plain count. The strongest
                disclosure explains an otherwise-empty tile. */}
            {contained ? (
              <span
                title={contained.reasons.join("; ")}
                className="text-neutral-400"
              >
                ⊘ source quarantined
              </span>
            ) : degradedReason ? (
              <span title={degradedReason} className="text-amber-500/80">
                ◐ source degraded
              </span>
            ) : staleAsOf ? (
              <span
                title={`Live fetch failed — showing last-known data as of ${fmtTime(staleAsOf)}`}
                className="text-amber-500/80"
              >
                ◐ as of {fmtTime(staleAsOf)}
              </span>
            ) : (
              `${cards.length}`
            )}
          </span>
        </div>
      </header>
      {contained ? (
        // Quarantined: the loop verified this source's output is failing its
        // probes. Never render its numbers as live — show the reasons and
        // the honest last-known anchor (or the honest empty).
        <div className="flex-1 py-2 text-[11px] italic text-neutral-500">
          <p>{contained.reasons.join(" · ")}</p>
          <p className="mt-1 not-italic text-neutral-600">
            {contained.lastKnownAt
              ? `last known value · as of ${fmtTime(contained.lastKnownAt)}`
              : "no trustworthy value available"}
          </p>
        </div>
      ) : top.length > 0 ? (
        <ul className="flex-1">
          {top.map((c) => (
            <CardRow key={c.id} card={c} />
          ))}
        </ul>
      ) : degradedReason ? (
        // Empty BECAUSE the source is degraded — say why, never "quiet".
        <p className="flex-1 py-2 text-[11px] italic text-amber-500/70">
          {degradedReason}
        </p>
      ) : (
        <p className="flex-1 py-2 text-[11px] italic text-neutral-600">
          quiet — no activity in window
        </p>
      )}
    </section>
  );
}

export function BentoBoard({
  feed,
  series = EMPTY_BOARD_SERIES,
}: {
  feed: FeedResponse;
  series?: BoardSeries;
}) {
  const staleByName = new Map(
    (feed.staleSources ?? []).map((s) => [s.source, s.staleAsOf]),
  );
  const degradedByName = new Map(
    (feed.degradedSources ?? []).map((s) => [s.source, s.reason]),
  );
  const containedByName = new Map(
    (feed.containedSources ?? []).map((s) => [s.source, s]),
  );
  const { toolHealth } = feed.currentState;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 text-neutral-200">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-neutral-800 pb-3">
        <h1 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-100">
          Gawk — State of the AI Ecosystem
        </h1>
        <div className="flex items-center gap-3 text-[11px] tabular-nums text-neutral-400">
          <span title="Tools operational / total (from Tool Health source)">
            tools {toolHealth.operational}/{toolHealth.total} up
          </span>
          <span aria-hidden className="text-neutral-700">
            ·
          </span>
          <span>as of {fmtTime(feed.lastComputed)}</span>
          {feed.monitoringImpaired ? (
            <span
              className="text-amber-500/80"
              title="The containment watchdog's own state is missing or stale — data is served as-is; standing quarantines remain applied"
            >
              ◌ monitoring impaired
            </span>
          ) : null}
          <span
            className={`h-2 w-2 rounded-full ${feed.quietDay ? "bg-neutral-600" : "bg-emerald-400"}`}
            title={feed.quietDay ? "Quiet day" : "Live"}
            aria-hidden
          />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-12">
        {DOMAINS.map((domain) => {
          const cards = feed.cards
            .filter((c) => domain.types.includes(c.type))
            .sort((a, b) => b.severity - a.severity);
          // Match degraded/stale by the domain's canonical source first (so a
          // ZERO-card tile can still disclose its state — it has no card
          // sourceName to match), then fall back to any card's source.
          const sourceNames = [
            domain.sourceName,
            ...cards.map((c) => c.sourceName),
          ].filter((v): v is string => Boolean(v));
          const contained =
            sourceNames
              .map((n) => containedByName.get(n))
              .find((v): v is ContainedSource => Boolean(v)) ?? null;
          const degradedReason =
            sourceNames
              .map((n) => degradedByName.get(n))
              .find((v): v is string => Boolean(v)) ?? null;
          const stale =
            sourceNames
              .map((n) => staleByName.get(n))
              .find((v): v is string => Boolean(v)) ?? null;
          return (
            <Tile
              key={domain.key}
              domain={domain}
              cards={cards}
              staleAsOf={stale}
              degradedReason={degradedReason}
              contained={contained}
              series={domain.seriesKey ? series[domain.seriesKey] : undefined}
            />
          );
        })}
      </div>

      <footer className="mt-4 border-t border-neutral-800 pt-2 text-[10px] leading-relaxed text-neutral-500">
        Every row links its primary source · ◐ = last-known value, source
        fetch failed · severity is a sort key over public data, not an
        invented score · prototype — compare with the map at{" "}
        <a href="/" className="underline hover:text-neutral-300">
          /
        </a>
      </footer>
    </main>
  );
}

export default BentoBoard;
