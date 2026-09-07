"use client";

import { useMemo, useState } from "react";
import { actorHref, actorLabel, repoHref } from "@/lib/data/event-links";
import { shortEventType } from "@/components/globe/event-types";
import { useNow } from "@/lib/hooks/use-now";

/**
 * The Wire: GitHub public events and Hacker News stories on one clock, newest first (PRD
 * web-restyle-v2 §13). Dashboard owns the merge so the map and the wire share the same HN subset.
 * Rows are a discriminated union: "gh" (GitHub event, provenance from the deterministic
 * file-presence probe) and "hn" (Hacker News story, orange HN pill = the one sanctioned brand mark).
 *
 * Freshness is split: the GitHub side stamps `live · HH:MM:SSZ`; a quiet staleness line appears
 * only when the HN side has not succeeded in > 30 minutes. The empty state is honest: never a
 * fabricated row, never a spinner pretending to be data.
 *
 * Desktop: list left, the selected row's detail right (same shape as Stories, so the view switch
 * does not change the page). Phone: the rows alone, each a link to its source.
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
      sourceKind?: "events-api" | "gharchive" | "tracked-repo" | "gitlab";
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
  /** desktop (default): list + detail; mobile: rows are links to their source */
  variant?: "desktop" | "mobile";
};

const HN_STALE_MINUTES = 30;
/** rows rendered before a "show more" — 1,500 full-height rows at once is not a page */
const PAGE = 200;

const isGitLab = (r: Extract<WireItem, { kind: "gh" }>): boolean =>
  r.sourceKind === "gitlab" || r.eventId.startsWith("gl:") || r.repo.startsWith("gitlab.com/");

const keyOf = (r: WireItem): string => (r.kind === "gh" ? `gh:${r.eventId}` : `hn:${r.id}`);

export function WirePage({
  wireRows,
  ghCoverage,
  hnMeta,
  polledAt,
  error,
  isInitialLoading,
  variant = "desktop",
}: WirePageProps) {
  const ghCount = wireRows.filter((r) => r.kind === "gh").length;
  const hnCount = wireRows.length - ghCount;
  const hnStale = hnMeta && hnMeta.staleMinutes !== null && hnMeta.staleMinutes > HN_STALE_MINUTES;
  const clock = useNow();
  // Before the clock ticks (SSR) ages are measured against the poll time — a real reference.
  const nowMs = clock || (polledAt ? new Date(polledAt).getTime() : 0);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const shown = wireRows.slice(0, limit);
  const selected = useMemo(
    () => wireRows.find((r) => keyOf(r) === selectedKey) ?? wireRows[0],
    [wireRows, selectedKey],
  );

  const coverage = ghCoverage
    ? `Chronological · last ${ghCoverage.windowMinutes}m · ${wireRows.length} rows (${ghCount} gh · ${hnCount} hn)`
    : "Chronological feed";
  const state = isInitialLoading && wireRows.length === 0 ? "loading" : error && wireRows.length === 0 ? "error" : wireRows.length === 0 ? "empty" : "ready";

  return (
    <div className="ap-wire" data-variant={variant} data-wire-state={state}>
      <div className="ap-wire__pane">
        <div className="ap-inset ap-wirerows" data-testid="wire-rows">
          <div className="ap-inset__head ap-inset__head--split">
            <span>The Wire · two sources, one clock</span>
            <FreshnessStamp isLoading={isInitialLoading} error={error} polledAt={polledAt} />
          </div>
          <p className="ap-wire__coverage">
            {coverage}
            {hnStale && hnMeta ? <> · HN: last fetched {hnMeta.staleMinutes}m ago</> : null}
          </p>
          {state === "loading" ? <Empty label="Loading feed…" /> : null}
          {state === "error" ? <Empty label={`Feed error · ${error}`} tone="error" /> : null}
          {state === "empty" ? <Empty label="No rows in this window. Waiting for next poll." /> : null}
          {wireRows.length > 0 ? (
            <ul className="ap-wire__list">
              {shown.map((r) => {
                const k = keyOf(r);
                const isSelected = variant === "desktop" && selected !== undefined && keyOf(selected) === k;
                return (
                  <li key={k} className={`ap-trow${isSelected ? " is-selected" : ""}`} data-wire-kind={r.kind}>
                    {r.kind === "gh" ? (
                      <GhRow row={r} nowMs={nowMs} variant={variant} selected={isSelected} onSelect={() => setSelectedKey(k)} />
                    ) : (
                      <HnRow row={r} nowMs={nowMs} variant={variant} selected={isSelected} onSelect={() => setSelectedKey(k)} />
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {wireRows.length > shown.length ? (
            <div className="ap-wire__more">
              <button type="button" className="ap-btn-ghost" onClick={() => setLimit((n) => n + PAGE)}>
                Show {Math.min(PAGE, wireRows.length - shown.length)} more
              </button>
              <span>
                {shown.length.toLocaleString("en-GB")} of {wireRows.length.toLocaleString("en-GB")} rows shown
              </span>
            </div>
          ) : null}
        </div>
        <p className="ap-wire__foot">
          Every row is a public event as its publisher reports it — GitHub event time, HN story time — newest
          first. ai-cfg / no-cfg is the deterministic file-presence probe (CLAUDE.md, .cursorrules, …), never a
          guess. Nothing is ranked or scored.
        </p>
      </div>
      {variant === "desktop" && selected ? (
        <WireDetail row={selected} nowMs={nowMs} windowMinutes={ghCoverage?.windowMinutes} />
      ) : null}
    </div>
  );
}

type RowProps<K extends WireItem["kind"]> = {
  row: Extract<WireItem, { kind: K }>;
  nowMs: number;
  variant: "desktop" | "mobile";
  selected: boolean;
  onSelect: () => void;
};

function RowShell({
  variant,
  href,
  selected,
  onSelect,
  children,
}: {
  variant: "desktop" | "mobile";
  href: string | undefined;
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  if (variant === "mobile" && href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="ap-trow__head ap-wirerow">
        {children}
      </a>
    );
  }
  return (
    <button type="button" className="ap-trow__head ap-wirerow" aria-current={selected ? "true" : undefined} onClick={onSelect}>
      {children}
    </button>
  );
}

function GhRow({ row, nowMs, variant, selected, onSelect }: RowProps<"gh">) {
  return (
    <RowShell variant={variant} href={repoHref(row.repo)} selected={selected} onSelect={onSelect}>
      <span className={`ap-mark ap-mark--${row.hasAiConfig ? "solid" : "hollow"}`} aria-hidden />
      <span className="ap-trow__body">
        <span className="ap-trow__title ap-wirerow__title">{row.repo}</span>
        <span className="ap-trow__kicker ap-wirerow__kicker" title={isoPublisherTimeTitle(row.createdAt)}>
          {shortEventType(row.type)} · {formatRelative(row.createdAt, nowMs)} · @{actorLabel(row.actor)} ·{" "}
          {row.hasAiConfig ? "ai-cfg" : "no-cfg"}
          {row.sourceKind === "gharchive" ? " · archive" : ""}
        </span>
      </span>
      <span className="ap-trow__chev" aria-hidden>
        ›
      </span>
    </RowShell>
  );
}

function HnRow({ row, nowMs, variant, selected, onSelect }: RowProps<"hn">) {
  return (
    <RowShell variant={variant} href={row.hnUrl} selected={selected} onSelect={onSelect}>
      <span className="ap-hnpill" aria-label={`Hacker News, ${row.points} points`}>
        HN · {row.points}
      </span>
      <span className="ap-trow__body">
        <span className="ap-trow__title ap-wirerow__title">{row.title}</span>
        <span className="ap-trow__kicker ap-wirerow__kicker" title={isoPublisherTimeTitle(row.createdAt)}>
          story · {formatRelative(row.createdAt, nowMs)} · @{row.author} · {row.numComments} comments
          {row.locationLabel ? ` · ${row.locationLabel}` : ""}
        </span>
      </span>
      <span className="ap-trow__chev" aria-hidden>
        ›
      </span>
    </RowShell>
  );
}

/** The detail for one wire row: what it is, where it came from, and its durable links. */
export function WireDetail({ row, nowMs, windowMinutes }: { row: WireItem; nowMs: number; windowMinutes?: number }) {
  if (row.kind === "gh") {
    const repo = repoHref(row.repo);
    const actor = actorHref(row.actor);
    const gl = isGitLab(row);
    const host = gl ? "GitLab" : "GitHub";
    return (
      <article className="ap-inset ap-reading ap-wiredetail" data-testid="wire-detail" data-wire-kind="gh" data-host={host.toLowerCase()} aria-label="Selected event">
        <div className="ap-reading__kicker ap-trow__kicker">
          {host} public event · {shortEventType(row.type)} · {stampUtc(row.createdAt)}
        </div>
        <h2 className="ap-reading__headline ap-wiredetail__headline">{row.repo}</h2>
        <p className="ap-reading__body">
          {prettyType(row.type)} by @{actorLabel(row.actor)}, {formatRelative(row.createdAt, nowMs)}
          {" "}ago by the publisher&apos;s clock.
        </p>
        <dl className="ap-wiredetail__facts">
          <dt>AI config</dt>
          <dd>
            <span className={`ap-mark ap-mark--sm ap-mark--${row.hasAiConfig ? "solid" : "hollow"}`} aria-hidden />
            {row.hasAiConfig ? "ai-cfg — a config file was found" : "no-cfg — none of the probed files present"} (CLAUDE.md,
            .cursorrules, … — file presence only, never inferred)
          </dd>
          <dt>Source</dt>
          <dd>
            {gl
              ? "GitLab public events API"
              : row.sourceKind === "gharchive"
                ? "GH Archive (hourly dump)"
                : row.sourceKind === "tracked-repo"
                  ? "GitHub Events API · tracked repo (complete stream, not the sampled firehose)"
                  : "GitHub Events API"}{" "}
            · event {row.eventId}
          </dd>
        </dl>
        <div className="ap-reading__why">
          <div className="ap-reading__whyhead">Why this is here</div>
          <p>
            A public {prettyType(row.type).toLowerCase()} the poll received
            {windowMinutes ? ` in the last ${windowMinutes} minutes` : ""}. Every event of a tracked kind (push, PR,
            issue, release, create, comment, review) is on the wire in publisher order; nothing is filtered by score.
          </p>
        </div>
        <div className="ap-reading__actions">
          {repo ? (
            <a className="ap-btn-ghost ap-reading__open" href={repo} target="_blank" rel="noopener noreferrer">
              Open the repo
            </a>
          ) : null}
          {actor ? (
            <a className="ap-link-btn" href={actor} target="_blank" rel="noopener noreferrer">
              @{actorLabel(row.actor)} on {host}
            </a>
          ) : null}
        </div>
      </article>
    );
  }
  return (
    <article className="ap-inset ap-reading ap-wiredetail" data-testid="wire-detail" data-wire-kind="hn" aria-label="Selected story">
      <div className="ap-reading__kicker ap-trow__kicker">
        Hacker News · {row.points} points · {row.numComments} comments · {stampUtc(row.createdAt)}
      </div>
      <h2 className="ap-reading__headline ap-wiredetail__headline">{row.title}</h2>
      <p className="ap-reading__body">
        Posted by @{row.author}, {formatRelative(row.createdAt, nowMs)}
        {" "}ago by HN&apos;s clock
        {row.locationLabel ? ` · ${row.locationLabel}` : ""}.
      </p>
      <div className="ap-reading__why">
        <div className="ap-reading__whyhead">Why this is here</div>
        <p>
          An AI story from the Hacker News feed, in publisher order with the points and comments HN reports. The
          link is the discussion, not the article.
        </p>
      </div>
      <div className="ap-reading__actions">
        <a className="ap-btn-ghost ap-reading__open" href={row.hnUrl} target="_blank" rel="noopener noreferrer">
          Open on Hacker News
        </a>
      </div>
    </article>
  );
}

function FreshnessStamp({ isLoading, error, polledAt }: { isLoading: boolean; error?: string; polledAt?: string }) {
  if (isLoading && !polledAt) return <span className="ap-wire__stamp">polling…</span>;
  if (error && !polledAt) return <span className="ap-wire__stamp ap-word--out">error</span>;
  return <span className="ap-wire__stamp">live · {polledAt ? formatClock(polledAt) : "—"}</span>;
}

function Empty({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "error" }) {
  return (
    <div className={`ap-wire__empty${tone === "error" ? " ap-wire__empty--error" : ""}`} role="status">
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

function stampUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

function formatRelative(iso: string, nowMs: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t) || !nowMs) return "—";
  const s = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * Trust-contract tooltip. Every relative timestamp on the Wire is the *publisher's* event time
 * (GitHub event `created_at`, HN Algolia `created_at`) — not our ingest/polling time.
 */
function isoPublisherTimeTitle(iso: string): string {
  try {
    return `${new Date(iso).toISOString()} · publisher event time`;
  } catch {
    return iso;
  }
}
