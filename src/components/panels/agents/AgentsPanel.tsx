"use client";

/**
 * AgentsPanel — Phase B dashboard view for the eight tracked agent
 * frameworks. Reads the assembled DTO from /api/panels/agents (which
 * joins agents:latest with the 7d-old snapshot), sorts by w/w delta
 * descending with tombstones sunk to the bottom, and renders one row
 * per framework with weekly downloads, stars, last-pushed, and status
 * badge.
 *
 * Bootstrap-friendly: when shipped on day 1, every row's
 * `weeklyDeltaPct` is null with `deltaState: "bootstrap"`. The delta
 * column renders "—" until day 8 when the first 7d-old snapshot
 * exists; the rest of the row (downloads, stars, last-pushed, badge)
 * is fully populated from agents:latest day-one.
 *
 * Status badge is computed in the assembler (`badge: archived |
 * dormant | legacy | null`); this view just maps each badge to a
 * colour:
 *   - archived  → red    (owner explicitly archived)
 *   - dormant   → amber  (registry tombstone OR pushedAt > 90d)
 *   - legacy    → grey   (historical reference, not actively pushed)
 *   - null      → green  ("active" — pushedAt within 90d, no tombstone)
 *
 * Visual language matches LabsPanel (font-mono numerals, tabular-nums,
 * border-border/40 bg-card/30 cards, amber/red/teal accents).
 */

import * as React from "react";
import type {
  AgentsViewDto,
  AgentRowView,
  AgentRowBadge,
  AgentRowDeltaState,
} from "@/lib/data/agents-view";

export type AgentsPanelProps = {
  data: AgentsViewDto | undefined;
  error: string | undefined;
  isInitialLoading: boolean;
};

export function AgentsPanel({
  data,
  error,
  isInitialLoading,
}: AgentsPanelProps): React.ReactElement {
  if (isInitialLoading && !data) {
    return (
      <div className="p-3" role="status" aria-label="Loading agents data">
        <div className="space-y-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-md border border-border/40 bg-card/30"
              aria-hidden
            />
          ))}
        </div>
      </div>
    );
  }
  if (!data || data.rows.length === 0) {
    return (
      <div
        className="m-3 flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 px-6 py-8 text-center font-mono text-[10px] uppercase tracking-wider text-amber-400/90"
        role="status"
      >
        <p>No agent-framework data yet.</p>
        <p className="text-amber-400/70">
          {error
            ? `Last poll error: ${error}`
            : "Cron seeds at 06:30 UTC daily."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-3 pb-2 pt-3">
        <ul className="space-y-1.5">
          {data.rows.map((row, idx) => (
            <AgentRow key={row.id} row={row} rank={idx + 1} />
          ))}
        </ul>
      </div>
      <PanelFooter generatedAt={data.generatedAt} />
    </div>
  );
}

function AgentRow({ row, rank }: { row: AgentRowView; rank: number }) {
  const language = formatLanguages(row.languages);
  const downloads = formatCount(row.weeklyDownloads);
  const stars = formatCount(row.stars);
  const pushed = formatRelative(row.pushedAt);
  const deltaText = formatDelta(row.weeklyDeltaPct, row.deltaState);
  const downloadsStaleAge = formatStaleAge(row.weeklyDownloadsStaleSince);
  const githubStaleAge = formatStaleAge(row.githubStaleSince);
  return (
    <li
      className="rounded-md border border-border/40 bg-card/30 p-2 text-[11px] leading-snug"
      data-agent-id={row.id}
    >
      <div className="flex items-baseline gap-2">
        <span className="w-5 shrink-0 text-right font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          {rank.toString().padStart(2, "0")}
        </span>
        <a
          href={`https://github.com/${row.githubRepo}`}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 truncate font-medium text-foreground underline-offset-2 hover:underline"
          title={`${row.name} · ${row.githubRepo}`}
        >
          {row.name}
        </a>
        <LanguageChip languages={row.languages} />
        <StatusBadge badge={row.badge} />
      </div>
      <div className="mt-1 flex items-center gap-2 pl-7 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/80 tabular-nums">
        <span title={titleForDownloads(row)}>
          {downloads}{" "}
          <span className="text-muted-foreground/60">{language}/wk</span>
        </span>
        {downloadsStaleAge ? <StalePill age={downloadsStaleAge} source="downloads" /> : null}
        <DeltaCell text={deltaText} state={row.deltaState} pct={row.weeklyDeltaPct} />
        <span title={`${row.stars?.toLocaleString() ?? "—"} stars`}>
          {stars} <span className="text-muted-foreground/60">★</span>
        </span>
        <span
          className="ml-auto shrink-0"
          title={row.pushedAt ?? "no push timestamp"}
        >
          pushed {pushed}
        </span>
        {githubStaleAge ? <StalePill age={githubStaleAge} source="github" /> : null}
      </div>
      {row.caveat ? (
        <p className="mt-1 pl-7 text-[9px] leading-snug text-muted-foreground/70">
          {row.caveat}
        </p>
      ) : null}
    </li>
  );
}

/** Amber pill rendered when a value was carried forward from a prior
 *  ingest because today's source fetch failed. Same visual language as
 *  LabsPanel's existing stale pill. The pill's presence is the trust
 *  signal: "this number is real, but it's not from today's run." */
function StalePill({
  age,
  source,
}: {
  age: string;
  source: "downloads" | "github";
}): React.ReactElement {
  const title =
    source === "downloads"
      ? `Last fresh download fetch ${age} — value carried forward from the previous successful run.`
      : `Last fresh GitHub fetch ${age} — value carried forward from the previous successful run.`;
  return (
    <span
      className="shrink-0 rounded-sm border border-amber-500/40 bg-amber-500/10 px-1 py-[1px] text-[8px] tracking-wider text-amber-300"
      title={title}
    >
      stale {age}
    </span>
  );
}

function LanguageChip({
  languages,
}: {
  languages: AgentRowView["languages"];
}): React.ReactElement {
  const label = languages
    .map((l) => (l === "python" ? "py" : "js"))
    .join("·");
  return (
    <span
      className="shrink-0 rounded-sm border border-teal-500/30 bg-teal-500/10 px-1 py-[1px] font-mono text-[8px] uppercase tracking-wider text-teal-300"
      title={`languages: ${languages.join(", ")}`}
    >
      {label}
    </span>
  );
}

function StatusBadge({
  badge,
}: {
  badge: AgentRowBadge | null;
}): React.ReactElement {
  if (badge === null) {
    return (
      <span
        className="shrink-0 inline-flex h-2 w-2 rounded-full bg-emerald-400"
        aria-label="active — pushed within 90 days"
        title="Active — pushed within 90 days"
      />
    );
  }
  if (badge === "archived") {
    return (
      <span
        className="shrink-0 rounded-sm border border-red-500/40 bg-red-500/10 px-1 py-[1px] font-mono text-[8px] uppercase tracking-wider text-red-300"
        title="Repo explicitly archived by owner"
      >
        archived
      </span>
    );
  }
  if (badge === "dormant") {
    return (
      <span
        className="shrink-0 rounded-sm border border-amber-500/40 bg-amber-500/10 px-1 py-[1px] font-mono text-[8px] uppercase tracking-wider text-amber-300"
        title="Dormant — no push in the last 90+ days"
      >
        dormant
      </span>
    );
  }
  // legacy
  return (
    <span
      className="shrink-0 rounded-sm border border-zinc-500/40 bg-zinc-500/10 px-1 py-[1px] font-mono text-[8px] uppercase tracking-wider text-zinc-300"
      title="Legacy — historical reference, not actively pushed"
    >
      legacy
    </span>
  );
}

function DeltaCell({
  text,
  state,
  pct,
}: {
  text: string;
  state: AgentRowDeltaState;
  pct: number | null;
}): React.ReactElement {
  let cls = "text-muted-foreground/60";
  if (state === "fresh" && pct !== null) {
    cls = pct > 0.5 ? "text-emerald-300" : pct < -0.5 ? "text-red-300" : "text-muted-foreground/80";
  } else if (state === "new-from-zero") {
    cls = "text-emerald-300";
  }
  return (
    <span
      className={cls}
      title={
        state === "bootstrap"
          ? "Delta unlocks once 7-day-old snapshot exists (≥ day 8)"
          : state === "new-from-zero"
            ? "New activity — no prior weekly downloads to compare"
            : "Week-over-week change vs 7 days ago"
      }
    >
      {text}
    </span>
  );
}

function PanelFooter({ generatedAt }: { generatedAt: string }) {
  return (
    <div className="border-t border-border/40 px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
      assembled {formatRelative(generatedAt)} · sources: pypi · npm · github
    </div>
  );
}

function formatLanguages(langs: AgentRowView["languages"]): string {
  if (langs.includes("python") && langs.includes("javascript")) return "DLs";
  if (langs.includes("javascript")) return "JS DLs";
  return "PyPI";
}

function titleForDownloads(row: AgentRowView): string {
  if (row.weeklyDownloads === null) {
    return "no download data — GitHub-only tombstone";
  }
  const sources: string[] = [];
  if (row.pypiPackage) sources.push(`PyPI ${row.pypiPackage}`);
  if (row.npmPackage) sources.push(`npm ${row.npmPackage}`);
  const sourceLabel = sources.length > 0 ? ` (${sources.join(" + ")})` : "";
  return `${row.weeklyDownloads.toLocaleString()} downloads / week${sourceLabel}`;
}

function formatCount(n: number | null): string {
  if (n === null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return Math.round(n).toString();
}

function formatDelta(
  pct: number | null,
  state: AgentRowDeltaState,
): string {
  if (state === "new-from-zero") return "+new";
  if (pct === null) return "—";
  if (Math.abs(pct) < 0.5) return "0%";
  const rounded = Math.round(pct);
  return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const ageMs = Date.now() - t;
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  const hrs = Math.floor(ageMs / (60 * 60 * 1000));
  const mins = Math.floor(ageMs / (60 * 1000));
  if (days >= 90) return `${days}d ago`;
  if (days >= 1) return `${days}d ago`;
  if (hrs >= 1) return `${hrs}h ago`;
  if (mins >= 1) return `${mins}m ago`;
  return "just now";
}

/** Compact age string for the stale pill: "3h" / "2d" — never "minutes",
 *  since a sub-hour stale isn't worth flagging (next run is imminent). */
function formatStaleAge(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const ageMs = Date.now() - t;
  const hrs = Math.floor(ageMs / (60 * 60 * 1000));
  if (hrs < 1) return null;
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days}d`;
  return `${hrs}h`;
}
