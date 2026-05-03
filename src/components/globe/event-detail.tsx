"use client";

import { forwardRef } from "react";
import type { GlobePoint } from "./Globe";
import { formatAgeLabel } from "@/lib/data/registry-shared";
import type { ConfigKind } from "@/lib/data/registry-shared";
import { LabCard } from "@/components/labs/LabCard";
import { SourceCard } from "@/components/wire/SourceCard";
import { CountryPill, LangTag } from "@/components/wire/country-pill";
import type { RssSourcePanel, RssWireItem } from "@/lib/data/wire-rss";
import {
  summariseClusterTypes,
  formatBreakdownLine,
} from "@/lib/map/insights";

/**
 * Point meta payload shared across live events (kind="event") and
 * registry entries (kind="registry"). The union of fields lets a single
 * EventCard render both rows without branching at the component boundary.
 */
export type EventMeta = {
  /** Present on all kinds. */
  kind?: "event" | "registry" | "hn" | "lab" | "rss";
  /** Live-event fields. */
  eventId?: string;
  type?: string;
  actor?: string;
  repo?: string;
  createdAt?: string;
  hasAiConfig?: boolean;
  sourceKind?: "events-api" | "gharchive";
  /** Registry fields (kind === "registry"). */
  fullName?: string;
  stars?: number;
  language?: string | null;
  description?: string | null;
  lastActivity?: string;
  decayScore?: number;
  configKinds?: ConfigKind[];
  /** Shared: registry uses it for city/country; hn uses it for author location. */
  locationLabel?: string | null;
  /** HN fields (kind === "hn"). */
  id?: string;
  title?: string;
  points?: number;
  numComments?: number;
  hnUrl?: string;
  author?: string;
  url?: string | null;
  /** AI Lab fields (kind === "lab"). */
  labId?: string;
  displayName?: string;
  labKind?: "industry" | "academic" | "non-profit";
  labCity?: string;
  labCountry?: string;
  labTotal?: number;
  labByType?: Record<string, number>;
  labRepos?: Array<{
    owner: string;
    repo: string;
    sourceUrl: string;
    total: number;
    byType: Record<string, number>;
    stale: boolean;
  }>;
  labOrgs?: string[];
  labHqSourceUrl?: string;
  /** Lab's primary website — click target for the lab name. */
  labUrl?: string;
  labStale?: boolean;
  /** True when labTotal === 0; renderer dims the dot. */
  labInactive?: boolean;
  /** Regional-RSS fields (kind === "rss"). */
  rssSourceId?: string;
  rssDisplayName?: string;
  rssCity?: string;
  rssCountry?: string;
  rssLang?: string;
  rssHqSourceUrl?: string;
  rssFeedFormat?: "rss" | "atom";
  rss24h?: number;
  rss7d?: number;
  rssStale?: boolean;
  /** True when rss24h === 0; renderer dims the dot. */
  rssInactive?: boolean;
  rssRecentItems?: RssWireItem[];
  rssCaveat?: string;
  rssStaleHours?: number | null;
  rssLastFetchOkTs?: string | null;
  /** Full source panel object, forwarded to SourceCard on single-source clusters. */
  rssSource?: RssSourcePanel;
};

export type Cluster = {
  lat: number;
  lng: number;
  color: string;
  /** Dominant event type in the bucket (most events). Drives colour. */
  dominantType: string;
  size: number;
  count: number;
  aiCount: number;
  /** How many of `events` are live events vs registry-base entries. */
  liveCount: number;
  registryCount: number;
  /** How many of `events` are HN stories (kind === "hn"). */
  hnCount: number;
  /** How many of `events` are AI-Lab dots (kind === "lab"). */
  labCount: number;
  /** How many of the lab entries in this bucket have >0 7d activity. */
  activeLabCount: number;
  /** How many of `events` are regional-publisher dots (kind === "rss"). */
  rssCount: number;
  /** How many of those publishers have >0 24h items (i.e. active). */
  activeRssCount: number;
  /** Avg decayScore across registry entries in this bucket (0..1). */
  avgDecay: number;
  /** Underlying events that collapsed into this cluster. Sorted newest-first. */
  events: GlobePoint[];
};

const SLATE = "#cbd5e1";

/**
 * Event-type → dot colour. Must stay in sync with FilterPanel legend so the
 * globe, flat map, and filter chips all read the same semantic.
 */
export const EVENT_TYPE_COLOR: Record<string, string> = {
  PushEvent: "#2dd4bf", // teal
  PullRequestEvent: "#60a5fa", // blue
  PullRequestReviewEvent: "#60a5fa",
  IssuesEvent: "#a78bfa", // purple
  IssueCommentEvent: "#a78bfa",
  ReleaseEvent: "#f59e0b", // amber
  ForkEvent: "#4ade80", // green
  WatchEvent: "#fbbf24", // yellow (star)
  CreateEvent: "#cbd5e1", // slate
};

export function colorForType(type?: string): string {
  if (!type) return SLATE;
  return EVENT_TYPE_COLOR[type] ?? SLATE;
}

export function hexA(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return `rgba(45,212,191,${alpha})`;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const CARD_WIDTH = 360;
// Offset the card clear of a cluster badge (up to ~30px wide at high zoom).
const CARD_MARGIN = 48;
const MAX_VISIBLE_EVENTS = 10;
// Floor + ceiling for the card's vertical footprint. The actual height
// is computed from the available space below the chosen `top` so a
// card anchored near the bottom of a short viewport never extends off
// screen — that was the "99+ clusters overflow" symptom on mobile.
const CARD_MIN_HEIGHT = 280;
const CARD_MAX_HEIGHT = 560;

/**
 * Pure layout helper — computes the card's `top` and `maxHeight` so it
 * never extends off the viewport regardless of where the user clicks.
 *
 * Constraints:
 *  - `top` is at least CARD_MARGIN (clears the top chrome).
 *  - `top` is at most `containerSize.h - CARD_MIN_HEIGHT - CARD_MARGIN`
 *    so a minimum-height card still fits with a bottom margin.
 *  - `maxHeight` is the available vertical space below `top`, capped at
 *    CARD_MAX_HEIGHT and floored at CARD_MIN_HEIGHT.
 *  - When the container is shorter than CARD_MIN_HEIGHT + 2*margin, the
 *    card pins to top=CARD_MARGIN and accepts the floor — better than
 *    a negative-height card or a margin violation.
 *
 * Exported for tests.
 */
export function computeEventCardLayout(
  anchorY: number,
  containerH: number,
): { top: number; maxHeight: number } {
  const topCeiling = Math.max(
    CARD_MARGIN,
    containerH - CARD_MIN_HEIGHT - CARD_MARGIN,
  );
  const top = Math.min(Math.max(CARD_MARGIN, anchorY - 40), topCeiling);
  const availableH = Math.max(
    CARD_MIN_HEIGHT,
    containerH - top - CARD_MARGIN,
  );
  const maxHeight = Math.min(CARD_MAX_HEIGHT, availableH);
  return { top, maxHeight };
}

type EventCardProps = {
  cluster: Cluster;
  anchor: { x: number; y: number };
  containerSize: { w: number; h: number };
  onClose: () => void;
};

export const EventCard = forwardRef<HTMLDivElement, EventCardProps>(function EventCard(
  { cluster, anchor, containerSize, onClose },
  ref,
) {
  // Lab-only clusters (no live / hn / registry / rss) delegate to the
  // dedicated LabCard — the richer layout shows repo breakdown + HQ
  // source link, which is the point of the whole labs layer. Mixed
  // clusters stay with the shared EventCard so the live pulse + the
  // lab row show side-by-side.
  if (
    cluster.labCount > 0 &&
    cluster.liveCount === 0 &&
    cluster.hnCount === 0 &&
    cluster.registryCount === 0 &&
    cluster.rssCount === 0
  ) {
    const labMetas = cluster.events
      .map((e) => e.meta as EventMeta | undefined)
      .filter((m): m is EventMeta => m?.kind === "lab");
    return (
      <LabCard
        ref={ref}
        labs={labMetas}
        anchor={anchor}
        containerSize={containerSize}
        onClose={onClose}
      />
    );
  }

  // Single-publisher RSS-only cluster delegates to SourceCard — its
  // richer layout shows recent items + HQ source link + stale banner,
  // which is the point of the regional layer. Multi-source or mixed
  // clusters fall through to the shared EventCard with RssRow, so a
  // live pulse + a publisher row show side-by-side.
  if (
    cluster.rssCount === 1 &&
    cluster.liveCount === 0 &&
    cluster.hnCount === 0 &&
    cluster.labCount === 0 &&
    cluster.registryCount === 0
  ) {
    const rssMeta = cluster.events
      .map((e) => e.meta as EventMeta | undefined)
      .find((m) => m?.kind === "rss");
    if (rssMeta?.rssSource) {
      return (
        <SourceCard
          ref={ref}
          source={rssMeta.rssSource}
          anchor={anchor}
          containerSize={containerSize}
          onClose={onClose}
        />
      );
    }
  }

  const placeRight = anchor.x + CARD_MARGIN + CARD_WIDTH <= containerSize.w;
  const left = placeRight
    ? anchor.x + CARD_MARGIN
    : Math.max(CARD_MARGIN, anchor.x - CARD_WIDTH - CARD_MARGIN);
  const { top, maxHeight: cardMaxHeight } = computeEventCardLayout(
    anchor.y,
    containerSize.h,
  );

  const visible = cluster.events.slice(0, MAX_VISIBLE_EVENTS);
  const overflow = Math.max(0, cluster.count - visible.length);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${cluster.count} event${cluster.count === 1 ? "" : "s"} in this region`}
      // z-index 1200 sits above Leaflet's highest pane (controls at 800,
      // popups at 700, markers at 600, tiles at 200) so the card isn't
      // occluded by the map on the flat-map view. Safe on the globe too —
      // no competing positioned siblings there.
      style={{
        left,
        top,
        width: CARD_WIDTH,
        zIndex: 1200,
        maxHeight: cardMaxHeight,
        display: "flex",
        flexDirection: "column",
      }}
      className="absolute rounded-md border border-border/60 bg-background/95 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8),0_0_60px_-20px_rgba(45,212,191,0.25)] backdrop-blur-md"
    >
      <div className="flex h-7 items-center gap-2 border-b border-border/50 px-2.5 font-mono text-[10px] uppercase tracking-wider text-foreground/70">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: "var(--ap-accent)",
            boxShadow: "0 0 6px var(--ap-accent-glow)",
          }}
          aria-hidden
        />
        <span className="flex-1 truncate">
          {cluster.liveCount > 0 && (
            <>
              {cluster.liveCount} live
              {cluster.aiCount > 0 && (
                <span className="text-[#2dd4bf]"> · {cluster.aiCount} w/ AI cfg</span>
              )}
            </>
          )}
          {cluster.liveCount > 0 && cluster.registryCount > 0 && (
            <span className="text-foreground/50"> · </span>
          )}
          {cluster.registryCount > 0 && (
            <span className="text-foreground/70">
              {cluster.registryCount} registry
            </span>
          )}
          {cluster.hnCount > 0 && (
            <>
              {(cluster.liveCount > 0 || cluster.registryCount > 0) && (
                <span className="text-foreground/50"> · </span>
              )}
              <span style={{ color: "#ff6600" }}>
                {cluster.hnCount} HN
              </span>
            </>
          )}
          {cluster.labCount > 0 && (
            <>
              {(cluster.liveCount > 0 ||
                cluster.registryCount > 0 ||
                cluster.hnCount > 0) && (
                <span className="text-foreground/50"> · </span>
              )}
              <span style={{ color: "#a855f7" }}>
                {cluster.labCount} lab{cluster.labCount === 1 ? "" : "s"}
              </span>
            </>
          )}
          {cluster.rssCount > 0 && (
            <>
              {(cluster.liveCount > 0 ||
                cluster.registryCount > 0 ||
                cluster.hnCount > 0 ||
                cluster.labCount > 0) && (
                <span className="text-foreground/50"> · </span>
              )}
              <span style={{ color: "#f97316" }}>
                {cluster.rssCount} rss
              </span>
            </>
          )}
          {cluster.liveCount === 0 &&
            cluster.registryCount === 0 &&
            cluster.hnCount === 0 &&
            cluster.labCount === 0 &&
            cluster.rssCount === 0 && (
              <>{cluster.count} event{cluster.count === 1 ? "" : "s"}</>
            )}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-5 w-5 items-center justify-center rounded text-foreground/60 hover:bg-white/5 hover:text-foreground"
        >
          <span aria-hidden>×</span>
        </button>
      </div>
      <ClusterTypeStrip events={cluster.events} />
      <ul
        className="divide-y divide-border/40 overflow-y-auto"
        style={{ flex: "1 1 auto", minHeight: 0 }}
      >
        {visible.map((p, i) => {
          const kind = (p.meta as EventMeta | undefined)?.kind;
          if (kind === "registry") {
            return <RegistryRow key={eventKey(p, i)} point={p} />;
          }
          if (kind === "hn") {
            return <HnRow key={eventKey(p, i)} point={p} />;
          }
          if (kind === "lab") {
            return <LabRow key={eventKey(p, i)} point={p} />;
          }
          if (kind === "rss") {
            return <RssRow key={eventKey(p, i)} point={p} />;
          }
          return <EventRow key={eventKey(p, i)} point={p} />;
        })}
      </ul>
      {overflow > 0 && (
        <div className="border-t border-border/40 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          and {overflow} more in this region
        </div>
      )}
    </div>
  );
});

/**
 * Per-type breakdown strip rendered under the cluster header. Aggregates
 * live events in the cluster by their GH event type and shows a single
 * line: "52 pushes · 23 PRs · 12 issues · 8 releases · 4 stars".
 *
 * Renders nothing for clusters with zero live events (pure registry /
 * lab / hn / rss popups don't have a type to break down — the header
 * strip already shows their kind counts).
 */
function ClusterTypeStrip({ events }: { events: GlobePoint[] }) {
  const rows = summariseClusterTypes(events);
  if (rows.length === 0) return null;
  const line = formatBreakdownLine(rows);
  return (
    <div className="border-b border-border/40 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80 tabular-nums">
      {line}
    </div>
  );
}

function eventKey(p: GlobePoint, fallback: number): string {
  const m = p.meta as EventMeta | undefined;
  if (m?.kind === "hn" && typeof m.id === "string") return `hn:${m.id}`;
  if (m?.kind === "lab" && typeof m.labId === "string") return `lab:${m.labId}`;
  if (m?.kind === "rss" && typeof m.rssSourceId === "string")
    return `rss:${m.rssSourceId}`;
  if (typeof m?.eventId === "string") return m.eventId;
  return `idx:${fallback}`;
}

function EventRow({ point }: { point: GlobePoint }) {
  const meta = (point.meta ?? {}) as EventMeta;
  const repo = meta.repo ?? "(unknown repo)";
  const actor = meta.actor ?? "(unknown)";
  const createdAt = meta.createdAt;
  const type = meta.type ?? "Event";
  const hasAi = meta.hasAiConfig === true;
  const source = meta.sourceKind;
  const repoHref = meta.repo ? `https://github.com/${meta.repo}` : undefined;

  return (
    <li className="px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <EventTypePill type={type} />
        {hasAi ? (
          <span className="ap-sev-pill ap-sev-pill--info">AI CFG</span>
        ) : (
          <span className="ap-sev-pill ap-sev-pill--pending">NO CFG</span>
        )}
        {source === "gharchive" && (
          <span
            className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
            title="Sourced from GH Archive hourly dump"
          >
            archive
          </span>
        )}
      </div>
      <div className="mt-1.5 truncate font-mono text-[12px] text-foreground">
        {repoHref ? (
          <a
            href={repoHref}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#2dd4bf] hover:underline"
          >
            {repo}
          </a>
        ) : (
          repo
        )}
      </div>
      <div className="mt-0.5 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
        <span className="truncate">@{actor}</span>
        <span className="ml-2 shrink-0 tabular-nums">{formatRelative(createdAt)}</span>
      </div>
    </li>
  );
}

function EventTypePill({ type }: { type: string }) {
  return <span className="ap-sev-pill ap-sev-pill--info">{shortEventType(type)}</span>;
}

/**
 * Registry-entry row: base-layer context for a repo that has a verified
 * AI-config file but no live event in the current window. The "Last
 * activity: Xd ago" line tells the user exactly how cold this dot is,
 * so a 90-day-old repo next to a push-today repo is legible at a glance.
 */
function RegistryRow({ point }: { point: GlobePoint }) {
  const meta = (point.meta ?? {}) as EventMeta;
  const repo = meta.fullName ?? meta.repo ?? "(unknown repo)";
  const repoHref = meta.fullName
    ? `https://github.com/${meta.fullName}`
    : undefined;
  const age = meta.lastActivity ? formatAgeLabel(meta.lastActivity) : null;
  const kinds = meta.configKinds ?? [];
  const stars = meta.stars;
  const lang = meta.language;

  return (
    <li className="px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="ap-sev-pill ap-sev-pill--pending">REGISTRY</span>
        {kinds.map((k) => (
          <span key={k} className="ap-sev-pill ap-sev-pill--info">
            {shortConfigKind(k)}
          </span>
        ))}
      </div>
      <div className="mt-1.5 truncate font-mono text-[12px] text-foreground">
        {repoHref ? (
          <a
            href={repoHref}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#2dd4bf] hover:underline"
          >
            {repo}
          </a>
        ) : (
          repo
        )}
      </div>
      {meta.description && (
        <div className="mt-0.5 line-clamp-1 font-mono text-[10px] text-muted-foreground">
          {meta.description}
        </div>
      )}
      <div className="mt-0.5 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
        <span className="truncate">
          {lang ?? "—"}
          {typeof stars === "number" && stars > 0 && (
            <span className="ml-1.5 tabular-nums">★ {formatStars(stars)}</span>
          )}
        </span>
        {age && <span className="ml-2 shrink-0 tabular-nums">{age}</span>}
      </div>
    </li>
  );
}

/**
 * HN story row: surfaces title + points + comments + author + resolved
 * location. Whole row is a link to the HN comments page (new tab).
 * Orange pill matches the WIRE feed's brand accent so a dot on the map
 * and a row in the feed read as the same source.
 */
function HnRow({ point }: { point: GlobePoint }) {
  const meta = (point.meta ?? {}) as EventMeta;
  const title = meta.title ?? "(untitled)";
  const author = meta.author ?? "(unknown)";
  const pts = typeof meta.points === "number" ? meta.points : 0;
  const cmts = typeof meta.numComments === "number" ? meta.numComments : 0;
  const href =
    meta.hnUrl ??
    (typeof meta.id === "string"
      ? `https://news.ycombinator.com/item?id=${meta.id}`
      : undefined);
  const loc = meta.locationLabel;

  return (
    <li className="px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <span
          className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white"
          style={{ backgroundColor: "#ff6600" }}
        >
          HN · {pts} pts · {cmts} cmt
        </span>
      </div>
      <div className="mt-1.5 font-mono text-[12px] text-foreground">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#ff6600] hover:underline"
          >
            {title}
          </a>
        ) : (
          title
        )}
      </div>
      <div className="mt-0.5 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
        <span className="truncate">
          @{author}
          {loc && <span className="ml-1.5">· {loc}</span>}
        </span>
        <span className="ml-2 shrink-0 tabular-nums">
          {formatRelative(meta.createdAt)}
        </span>
      </div>
    </li>
  );
}

/**
 * Minimal AI-Lab row — shipped with LABS-03 so a lab dot click doesn't
 * land on the default `EventRow` branch (which would render "(unknown
 * repo)"). The full LabCard UI (repo breakdown, HQ link, stale pill)
 * arrives in LABS-04; this stub just surfaces the lab name, HQ city,
 * and 7d total so the card is informative end-to-end from day one.
 */
function LabRow({ point }: { point: GlobePoint }) {
  const meta = (point.meta ?? {}) as EventMeta;
  const name = meta.displayName ?? meta.labId ?? "(unknown lab)";
  const city = meta.labCity;
  const country = meta.labCountry;
  const total = typeof meta.labTotal === "number" ? meta.labTotal : 0;
  const isInactive = meta.labInactive === true;
  const isStale = meta.labStale === true;
  const primary = meta.labUrl ?? meta.labHqSourceUrl;
  const repos = meta.labRepos ?? [];
  return (
    <li className="px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white"
          style={{ backgroundColor: "#a855f7" }}
        >
          AI LAB
        </span>
        {isStale && (
          <span className="ap-sev-pill ap-sev-pill--pending">STALE</span>
        )}
        {isInactive && !isStale && (
          <span className="ap-sev-pill ap-sev-pill--pending">QUIET 7D</span>
        )}
      </div>
      <div className="mt-1.5 font-mono text-[12px] text-foreground">
        {primary ? (
          <a
            href={primary}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#a855f7] hover:underline"
          >
            {name}
          </a>
        ) : (
          name
        )}
      </div>
      <div className="mt-0.5 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
        <span className="truncate">
          {city && country ? `${city}, ${country}` : country ?? city ?? "—"}
          {repos.length > 0 && (
            <span className="ml-1.5 tabular-nums">· {repos.length} repo{repos.length === 1 ? "" : "s"}</span>
          )}
        </span>
        <span className="ml-2 shrink-0 tabular-nums">
          {total} evt · 7d
        </span>
      </div>
    </li>
  );
}

/**
 * Regional-publisher row — surfaces country pill, publisher name, 24h/7d
 * item counts, and a stale/quiet badge. Renders inside mixed clusters
 * (e.g. a live GH event + a publisher in the same region); single-RSS
 * clusters delegate to SourceCard for the richer layout.
 */
function RssRow({ point }: { point: GlobePoint }) {
  const meta = (point.meta ?? {}) as EventMeta;
  const name = meta.rssDisplayName ?? meta.rssSourceId ?? "(unknown publisher)";
  const country = meta.rssCountry ?? "";
  const lang = meta.rssLang ?? "en";
  const city = meta.rssCity;
  const last24 = typeof meta.rss24h === "number" ? meta.rss24h : 0;
  const last7 = typeof meta.rss7d === "number" ? meta.rss7d : 0;
  const isStale = meta.rssStale === true;
  const isInactive = meta.rssInactive === true;
  // Prefer the publisher's own site (forwarded via rssSource) over the
  // HQ-coord citation (hqSourceUrl may point to Wikipedia for some
  // publishers). Fallback chain keeps the row functional if either
  // upstream field is absent.
  const primary = meta.rssSource?.publisherUrl ?? meta.rssHqSourceUrl;
  return (
    <li className="px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white"
          style={{ backgroundColor: "#f97316" }}
        >
          RSS
        </span>
        {country && <CountryPill country={country} />}
        <LangTag lang={lang} />
        {isStale && <span className="ap-sev-pill ap-sev-pill--pending">STALE</span>}
        {isInactive && !isStale && (
          <span className="ap-sev-pill ap-sev-pill--pending">QUIET 24H</span>
        )}
      </div>
      <div className="mt-1.5 font-mono text-[12px] text-foreground">
        {primary ? (
          <a
            href={primary}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#f97316] hover:underline"
          >
            {name}
          </a>
        ) : (
          name
        )}
      </div>
      <div className="mt-0.5 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
        <span className="truncate">
          {city && country ? `${city}, ${country}` : country || city || "—"}
        </span>
        <span className="ml-2 shrink-0 tabular-nums">
          {last24} · 24h <span className="text-foreground/30">/</span> {last7} · 7d
        </span>
      </div>
    </li>
  );
}

function shortConfigKind(kind: ConfigKind): string {
  switch (kind) {
    case "claude-md":
      return "CLAUDE.MD";
    case "agents-md":
      return "AGENTS.MD";
    case "cursorrules":
      return ".CURSORRULES";
    case "windsurfrules":
      return ".WINDSURFRULES";
    case "copilot-instructions":
      return "COPILOT";
    case "continue-config":
      return "CONTINUE";
  }
}

function formatStars(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

export function shortEventType(type: string): string {
  switch (type) {
    case "PushEvent":
      return "PUSH";
    case "PullRequestEvent":
      return "PR";
    case "PullRequestReviewEvent":
      return "PR REVIEW";
    case "IssuesEvent":
      return "ISSUE";
    case "IssueCommentEvent":
      return "ISSUE CMT";
    case "ReleaseEvent":
      return "RELEASE";
    case "CreateEvent":
      return "CREATE";
    case "ForkEvent":
      return "FORK";
    case "WatchEvent":
      return "STAR";
    default:
      return type.replace(/Event$/, "").toUpperCase();
  }
}

export function formatRelative(iso?: string): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const delta = Date.now() - t;
  const sec = Math.round(delta / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
