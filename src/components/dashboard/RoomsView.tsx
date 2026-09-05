"use client";

/**
 * Gawk — Community (canvas working title "Rooms"): who is building right now.
 *
 * Phase 2 of the web restyle shows only what main already has: public GitHub events on repos
 * that carry an AI config file (CLAUDE.md, .cursorrules, …), grouped by repo, newest first.
 * The Discord surfaces arrive with the community PRs (#105 / #106) and are not duplicated here.
 * Every number on this surface traces to the events poll; the caption says the window.
 */

import type { WireItem } from "@/components/dashboard/WirePage";

export type RoomsViewProps = {
  rows: WireItem[];
  polledAt?: string;
  windowMinutes?: number;
  compact?: boolean;
};

type RepoRow = { repo: string; events: number; actors: number; latest: string };

export function groupActiveRepos(rows: WireItem[], limit = 12): RepoRow[] {
  const byRepo = new Map<string, { events: number; actors: Set<string>; latest: string }>();
  for (const r of rows) {
    if (r.kind !== "gh" || !r.hasAiConfig) continue;
    const cur = byRepo.get(r.repo) ?? { events: 0, actors: new Set<string>(), latest: r.createdAt };
    cur.events += 1;
    cur.actors.add(r.actor);
    if (r.createdAt > cur.latest) cur.latest = r.createdAt;
    byRepo.set(r.repo, cur);
  }
  return [...byRepo.entries()]
    .map(([repo, v]) => ({ repo, events: v.events, actors: v.actors.size, latest: v.latest }))
    .sort((a, b) => (a.latest < b.latest ? 1 : -1))
    .slice(0, limit);
}

function hhmm(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

export function RoomsView({ rows, polledAt, windowMinutes, compact }: RoomsViewProps) {
  const repos = groupActiveRepos(rows);
  const total = rows.filter((r) => r.kind === "gh" && r.hasAiConfig).length;
  // No polledAt = the events poll has not answered yet. Never assert "no activity" on no data.
  const pending = !polledAt;
  const windowLabel = windowMinutes ? `in the last ${windowMinutes} min` : "in the current window";

  return (
    <section className={`ap-column${compact ? " ap-column--compact" : ""}`} aria-label="Community">
      <h2 className="ap-column__title">
        {pending
          ? "Waiting for the events poll…"
          : repos.length > 0
            ? `${repos.length} repos with AI config saw public activity ${windowLabel}.`
            : `No public activity on repos with AI config ${windowLabel}.`}
      </h2>
      <p className="ap-column__sub">
        {pending
          ? "GitHub Events API · public events only, so this is a floor, not a census."
          : `GitHub Events API · ${total} events on AI-config repos · polled ${hhmm(polledAt)} · public events only, so this is a floor, not a census.`}
      </p>
      <div className="ap-inset">
        <div className="ap-inset__head">Active now · repos with AI config</div>
        {repos.length === 0 ? (
          <div className="ap-list-row ap-list-row--empty">
            {pending ? "Loading…" : "Nothing recorded in this window."}
          </div>
        ) : (
          repos.map((r) => (
            <a
              key={r.repo}
              className="ap-list-row"
              href={`https://github.com/${r.repo}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="ap-list-row__main">{r.repo}</span>
              <span className="ap-list-row__meta">
                {r.events} {r.events === 1 ? "event" : "events"} · {r.actors}{" "}
                {r.actors === 1 ? "contributor" : "contributors"} · {hhmm(r.latest)}
              </span>
            </a>
          ))
        )}
      </div>
    </section>
  );
}
