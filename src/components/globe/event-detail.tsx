"use client";

import { forwardRef } from "react";
import type { GlobePoint } from "./Globe";
import { formatAgeLabel } from "@/lib/data/registry-shared";
import type { ConfigKind } from "@/lib/data/registry-shared";

/**
 * Point meta payload shared across live events (kind="event") and
 * registry entries (kind="registry"). The union of fields lets a single
 * EventCard render both rows without branching at the component boundary.
 */
export type EventMeta = {
  /** Present on both kinds. */
  kind?: "event" | "registry";
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
  locationLabel?: string;
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
const MAX_VISIBLE_EVENTS = 5;

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
  const placeRight = anchor.x + CARD_MARGIN + CARD_WIDTH <= containerSize.w;
  const left = placeRight
    ? anchor.x + CARD_MARGIN
    : Math.max(CARD_MARGIN, anchor.x - CARD_WIDTH - CARD_MARGIN);
  const top = Math.min(
    Math.max(CARD_MARGIN, anchor.y - 40),
    Math.max(CARD_MARGIN, containerSize.h - 260),
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
      style={{ left, top, width: CARD_WIDTH, zIndex: 1200 }}
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
          {cluster.liveCount === 0 && cluster.registryCount === 0 && (
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
      <ul className="divide-y divide-border/40">
        {visible.map((p, i) => {
          const kind = (p.meta as EventMeta | undefined)?.kind;
          return kind === "registry" ? (
            <RegistryRow key={eventKey(p, i)} point={p} />
          ) : (
            <EventRow key={eventKey(p, i)} point={p} />
          );
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

function eventKey(p: GlobePoint, fallback: number): string {
  const id = (p.meta as EventMeta | undefined)?.eventId;
  return id ?? `idx:${fallback}`;
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
