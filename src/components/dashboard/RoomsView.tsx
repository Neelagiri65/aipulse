"use client";

/**
 * gawk.dev — Community: the server first, then who is building right now.
 *
 * The tab carries the Discord mark, so it leads with the Discord server: the count the widget
 * actually reported, the sentence saying what that count is and is not, when it was read, and the
 * join link. The count is shown honestly at whatever it is — a server with one member online says
 * one. It is never shown as 0 when it is unknown, and the join link renders whether or not the
 * widget answers.
 *
 * Below it, the second panel is a different measure from a different source: public GitHub events
 * on repos carrying an AI config file (CLAUDE.md, .cursorrules, …), grouped by repo. The two never
 * share a caption — each says its own source, window and meaning.
 */

import type { WireItem } from "@/components/dashboard/WirePage";
import { getCommunityUrl } from "@/components/chrome/CommunityLink";
import type { CommunityState } from "@/lib/community/use-community";

export type RoomsViewProps = {
  rows: WireItem[];
  polledAt?: string;
  windowMinutes?: number;
  compact?: boolean;
  /** The shared /api/community poll. Absent → the Discord panel renders as pending. */
  community?: CommunityState;
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

export function RoomsView({ rows, polledAt, windowMinutes, compact, community }: RoomsViewProps) {
  const repos = groupActiveRepos(rows);
  const total = rows.filter((r) => r.kind === "gh" && r.hasAiConfig).length;
  // No polledAt = the events poll has not answered yet. Never assert "no activity" on no data.
  const pending = !polledAt;
  const windowLabel = windowMinutes ? `in the last ${windowMinutes} min` : "in the current window";

  const joinUrl = getCommunityUrl();
  const live = community?.data && !community.error ? community.data : undefined;
  const lastKnown = community?.data;
  const serverName = lastKnown?.serverName ?? "the gawk.dev Discord";
  const communityPending = !community || (community.isInitialLoading && !lastKnown);

  return (
    <section className={`ap-column${compact ? " ap-column--compact" : ""}`} aria-label="Community">
      <h2 className="ap-column__title">
        {communityPending
          ? "Reading the Discord widget…"
          : live
            ? `${live.onlineCount.toLocaleString("en-GB")} online now in ${serverName}.`
            : `${serverName} — the widget is not answering, so no count is shown.`}
      </h2>
      <p className="ap-column__sub">
        {live
          ? `Discord server widget · read ${hhmm(live.fetchedAt)} · ${live.countMeaning}`
          : lastKnown
            ? `Discord server widget · last answered ${hhmm(lastKnown.fetchedAt)} · a count is shown only while the widget answers, never carried forward as if it were live.`
            : "Discord server widget · the server publishes it or it does not; when it is off, Gawk shows the door and no number."}
      </p>

      <div className="ap-inset" data-testid="community-discord">
        <div className="ap-inset__head ap-inset__head--split">
          <span>The server</span>
          <span data-community-state={live ? "ok" : communityPending ? "pending" : "unavailable"}>
            {live ? `${live.onlineCount.toLocaleString("en-GB")} online` : communityPending ? "connecting…" : "count unavailable"}
          </span>
        </div>
        {joinUrl ? (
          <a
            className="ap-list-row"
            data-testid="community-join"
            href={joinUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="ap-list-row__main">Join {serverName} ↗</span>
            <span className="ap-list-row__meta">
              open server · the invite does not expire
            </span>
          </a>
        ) : (
          <div className="ap-list-row ap-list-row--empty">
            No invite configured — set NEXT_PUBLIC_COMMUNITY_URL.
          </div>
        )}
      </div>

      <div className="ap-inset">
        <div className="ap-inset__head ap-inset__head--split">
          <span>Active now · repos with AI config</span>
          <span>
            {pending
              ? "waiting for the events poll"
              : `${total} ${total === 1 ? "event" : "events"} · polled ${hhmm(polledAt)}`}
          </span>
        </div>
        {repos.length === 0 ? (
          <div className="ap-list-row ap-list-row--empty">
            {pending ? "Loading…" : `No public activity on repos with AI config ${windowLabel}.`}
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
        <p className="ap-column__sub" style={{ padding: "8px 12px 10px" }}>
          GitHub Events API · {pending ? "not polled yet" : `${repos.length} ${repos.length === 1 ? "repo" : "repos"} ${windowLabel}`} · public
          events only, so this is a floor, not a census. A different measure from the count above.
        </p>
      </div>
    </section>
  );
}
