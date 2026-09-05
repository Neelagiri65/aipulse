"use client";

/**
 * CommunityCard — the Gawk Dev Discord, as a number with its meaning.
 *
 * Shows how many members Discord counts as online right now (from
 * /api/community via the shared poll), the sentence that says what that
 * number is and is not, the source + read time, and the join link.
 *
 * States: loading (first poll in flight), ok, unavailable (widget off or
 * route failing — the join link still renders; a retained last-good count
 * is shown with its time, never as a live number). The count is never
 * shown as 0 when it is unknown.
 */

import type { CommunityDto } from "@/lib/community/discord-widget";

export type CommunityCardProps = {
  data: CommunityDto | undefined;
  error: string | undefined;
  isInitialLoading: boolean;
  /** Permanent invite (NEXT_PUBLIC_COMMUNITY_URL). Undefined → no join link. */
  joinUrl: string | undefined;
};

export function CommunityCard({ data, error, isInitialLoading, joinUrl }: CommunityCardProps) {
  const serverName = data?.serverName ?? "Gawk Dev";
  const live = data && !error ? data : undefined;

  return (
    <div className="p-3 text-[11px] leading-snug" data-testid="community-card">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-foreground">{serverName} on Discord</span>
        {joinUrl ? (
          <a
            href={joinUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="community-card-join"
            className="rounded border border-border/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground hover:border-border hover:text-foreground"
          >
            Join ↗
          </a>
        ) : null}
      </div>

      {isInitialLoading && !data ? (
        <p
          className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          role="status"
        >
          connecting…
        </p>
      ) : live ? (
        <div className="mt-2" data-community-state="ok">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl tabular-nums text-foreground">
              {live.onlineCount}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              online on Discord now
            </span>
          </div>
          <p className="mt-1 text-muted-foreground">{live.countMeaning}</p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/80">
            <a
              href={live.source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              {live.source.name} ↗
            </a>{" "}
            · as of {utcHm(live.fetchedAt)} UTC
          </p>
        </div>
      ) : (
        <div className="mt-2" data-community-state="unavailable">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            online count unavailable
          </p>
          <p className="mt-1 text-muted-foreground">
            Discord&apos;s server widget is off or unreachable. The server is still open.
          </p>
          {data ? (
            <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/80">
              last known {data.onlineCount} online · as of {utcHm(data.fetchedAt)} UTC
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function utcHm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown time";
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
