"use client";

import dynamic from "next/dynamic";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";

const ReactGlobe = dynamic(() => import("react-globe.gl"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-xs font-mono text-muted-foreground">
      Loading globe…
    </div>
  ),
});

export type GlobePoint = {
  lat: number;
  lng: number;
  /** tool signal colour: teal (ai-config), white (no signal), etc. See Globe.legend. */
  color: string;
  /** size multiplier */
  size?: number;
  /** original event reference, for hover/click detail panels */
  meta?: Record<string, unknown>;
};

export type GlobeProps = {
  points?: GlobePoint[];
  /** ISO timestamp of the most recent data update. If undefined, we show "awaiting data". */
  lastUpdatedAt?: string;
};

const SLATE = "#cbd5e1";

// Event-type colour map. Must match src/components/chrome/FilterPanel.tsx
// so the dots on the globe read the same as the filter legend.
const EVENT_TYPE_COLOR: Record<string, string> = {
  PushEvent: "#2dd4bf", // teal
  PullRequestEvent: "#60a5fa", // blue
  PullRequestReviewEvent: "#60a5fa",
  IssuesEvent: "#a78bfa", // purple
  IssueCommentEvent: "#a78bfa",
  ReleaseEvent: "#f59e0b", // amber
  ForkEvent: "#4ade80", // green
  WatchEvent: "#fbbf24", // yellow (Star)
  CreateEvent: "#cbd5e1", // slate
};

function colorForType(type?: string): string {
  if (!type) return SLATE;
  return EVENT_TYPE_COLOR[type] ?? SLATE;
}

type Cluster = {
  lat: number;
  lng: number;
  color: string;
  /** Dominant event type in the bucket (most events). Drives colour + legend. */
  dominantType: string;
  size: number;
  count: number;
  aiCount: number;
  /** Underlying events that collapsed into this cluster. Populated in cluster order (most recent first). */
  events: GlobePoint[];
};

type EventMeta = {
  eventId?: string;
  type?: string;
  actor?: string;
  repo?: string;
  createdAt?: string;
  hasAiConfig?: boolean;
  sourceKind?: "events-api" | "gharchive";
};

/**
 * Bucket points into a coarse lat/lng grid. Two events whose authors geocoded
 * to the same approximate region collapse into one weighted dot — readability
 * over raw count. Bucket centres become the cluster's lat/lng (averaged), and
 * size scales with log(count) so single events stay tiny while concentrations
 * read as bigger glow without overwhelming the globe.
 */
function clusterPoints(points: GlobePoint[]): Cluster[] {
  const BUCKET_DEG = 4;
  const buckets = new Map<
    string,
    { lats: number[]; lngs: number[]; ai: number; total: number; events: GlobePoint[] }
  >();

  for (const p of points) {
    const by = Math.round(p.lat / BUCKET_DEG);
    const bx = Math.round(p.lng / BUCKET_DEG);
    const key = `${by}:${bx}`;
    // AI-config is a separate signal from event-type colour — use the meta
    // flag directly rather than inferring from p.color, because p.color now
    // encodes event type, not AI-config status.
    const meta = p.meta as EventMeta | undefined;
    const isAi = meta?.hasAiConfig === true;
    const b = buckets.get(key);
    if (b) {
      b.lats.push(p.lat);
      b.lngs.push(p.lng);
      b.total += 1;
      if (isAi) b.ai += 1;
      b.events.push(p);
    } else {
      buckets.set(key, {
        lats: [p.lat],
        lngs: [p.lng],
        ai: isAi ? 1 : 0,
        total: 1,
        events: [p],
      });
    }
  }

  const clusters: Cluster[] = [];
  for (const b of buckets.values()) {
    const lat = b.lats.reduce((s, v) => s + v, 0) / b.lats.length;
    const lng = b.lngs.reduce((s, v) => s + v, 0) / b.lngs.length;

    // Dominant event type → cluster colour. Ties broken by insertion order.
    const typeCounts = new Map<string, number>();
    for (const ev of b.events) {
      const t = (ev.meta as EventMeta | undefined)?.type ?? "unknown";
      typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    }
    const dominantType =
      [...typeCounts.entries()].sort((a, z) => z[1] - a[1])[0]?.[0] ?? "unknown";
    const color = colorForType(dominantType);

    const aiDominant = b.ai > 0;
    const base = aiDominant ? 0.55 : 0.32;
    const size = Math.min(1.6, base + Math.log2(1 + b.total) * 0.22);
    // Sort events newest-first so the "top N" list in the click card leads
    // with the freshest activity rather than arbitrary insertion order.
    const sortedEvents = b.events.slice().sort((a, z) => {
      const atA = (a.meta as EventMeta | undefined)?.createdAt ?? "";
      const atZ = (z.meta as EventMeta | undefined)?.createdAt ?? "";
      return atZ.localeCompare(atA);
    });
    clusters.push({
      lat,
      lng,
      color,
      dominantType,
      size,
      count: b.total,
      aiCount: b.ai,
      events: sortedEvents,
    });
  }
  return clusters;
}

export function Globe({ points = [], lastUpdatedAt }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [selection, setSelection] = useState<{
    cluster: Cluster;
    // Screen-space coords relative to the globe container, used to anchor the
    // card near where the user clicked rather than in a fixed corner.
    anchor: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ w: Math.floor(width), h: Math.floor(height) });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const clusters = useMemo(() => clusterPoints(points), [points]);
  // Clusters with >1 event get a numeric badge; singleton AI-config dots
  // also render an HTML overlay so they read as a bright halo ring against
  // the event-type colour dot.
  const labeledClusters = useMemo(
    () => clusters.filter((c) => c.count > 1 || c.aiCount > 0),
    [clusters],
  );
  const hasData = points.length > 0;

  const handlePointClick = useCallback(
    (
      clusterData: object,
      event: MouseEvent,
    ) => {
      const cluster = clusterData as Cluster;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      setSelection({
        cluster,
        anchor: {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        },
      });
    },
    [],
  );

  // Esc + outside-click dismiss. Listens only while a card is open.
  useEffect(() => {
    if (!selection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelection(null);
    };
    const onDown = (e: MouseEvent) => {
      const card = cardRef.current;
      if (!card) return;
      if (card.contains(e.target as Node)) return;
      // Clicks on the globe canvas will re-open via onPointClick above; anywhere
      // else inside the container just dismisses.
      setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    // Mousedown not click so we close before the next point-click fires.
    window.addEventListener("mousedown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown, true);
    };
  }, [selection]);

  // Dismiss the card when the dataset changes under us — stale eventIds would
  // render a card that no longer matches what's on the globe.
  useEffect(() => {
    setSelection(null);
  }, [points]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {size.w > 0 && size.h > 0 && (
        <ReactGlobe
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
          showAtmosphere
          atmosphereColor="#2dd4bf"
          atmosphereAltitude={0.12}
          pointsData={clusters}
          pointLat={(d) => (d as Cluster).lat}
          pointLng={(d) => (d as Cluster).lng}
          pointColor={(d) => (d as Cluster).color}
          pointAltitude={0.005}
          pointRadius={(d) => (d as Cluster).size * 0.18}
          pointsTransitionDuration={2500}
          onPointClick={handlePointClick}
          htmlElementsData={labeledClusters}
          htmlLat={(d) => (d as Cluster).lat}
          htmlLng={(d) => (d as Cluster).lng}
          htmlAltitude={0.02}
          htmlElement={(d) => clusterLabelElement(d as Cluster)}
          htmlTransitionDuration={1200}
        />
      )}

      {selection && (
        <EventCard
          ref={cardRef}
          cluster={selection.cluster}
          anchor={selection.anchor}
          containerSize={size}
          onClose={() => setSelection(null)}
        />
      )}

      <GlobeLegend />
      <GlobeStatus hasData={hasData} lastUpdatedAt={lastUpdatedAt} clusterCount={clusters.length} eventCount={points.length} />
    </div>
  );
}

const CARD_WIDTH = 360;
const CARD_MARGIN = 12;
const MAX_VISIBLE_EVENTS = 5;

type EventCardProps = {
  cluster: Cluster;
  anchor: { x: number; y: number };
  containerSize: { w: number; h: number };
  onClose: () => void;
};

const EventCard = forwardRef<HTMLDivElement, EventCardProps>(function EventCard(
  { cluster, anchor, containerSize, onClose },
  ref,
) {
  // Clamp the card inside the container: prefer right-of-cursor, flip left if
  // that would overflow; vertically anchored near cursor then clamped so the
  // whole card stays visible.
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
      style={{ left, top, width: CARD_WIDTH }}
      className="absolute z-30 rounded-md border border-border/60 bg-background/95 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8),0_0_60px_-20px_rgba(45,212,191,0.25)] backdrop-blur-md"
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
          {cluster.count} event{cluster.count === 1 ? "" : "s"}
          {cluster.aiCount > 0 && (
            <span className="text-[#2dd4bf]"> · {cluster.aiCount} w/ AI cfg</span>
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
        {visible.map((p, i) => (
          <EventRow key={eventKey(p, i)} point={p} />
        ))}
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
  const short = shortEventType(type);
  return <span className="ap-sev-pill ap-sev-pill--info">{short}</span>;
}

function shortEventType(type: string): string {
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

function formatRelative(iso?: string): string {
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

function clusterLabelElement(c: Cluster): HTMLElement {
  const el = document.createElement("div");
  const isAi = c.aiCount > 0;
  const count = c.count;
  const color = c.color;

  // Singleton AI-config dot → render as a halo ring, no numeric badge.
  // That's what visually distinguishes "has AI config" from "no AI config"
  // when there's only one event at the location.
  if (count === 1 && isAi) {
    el.style.cssText = [
      "pointer-events:none",
      "position:relative",
      "transform:translate(-50%,-50%)",
      "width:14px",
      "height:14px",
      "border-radius:9999px",
      "background:transparent",
      `border:1.5px solid ${hexA(color, 0.95)}`,
      `box-shadow:0 0 10px ${hexA(color, 0.55)}, inset 0 0 4px ${hexA(color, 0.35)}`,
    ].join(";");
    el.setAttribute("aria-label", "1 AI-config event in this region");
    return el;
  }

  // Numbered badge. AI-config clusters get a thicker border + outer ring.
  const scale = Math.min(1.35, 0.9 + Math.log10(count) * 0.22);
  const size = Math.round(22 * scale);
  const fontSize = Math.round(10.5 + (scale - 0.9) * 4);
  const border = isAi ? hexA(color, 0.95) : hexA(color, 0.6);
  const glow = isAi ? hexA(color, 0.55) : hexA(color, 0.25);
  const bg = "rgba(8, 14, 20, 0.82)";
  const text = isAi ? "#f0fdfa" : "#e2e8f0";
  const shadow = isAi
    ? `0 0 ${Math.round(18 * scale)}px ${glow}, 0 0 0 2px ${hexA(color, 0.25)}`
    : `0 0 ${Math.round(10 * scale)}px ${glow}`;

  el.style.cssText = [
    "pointer-events:none",
    "position:relative",
    "transform:translate(-50%,-120%)",
    `width:${size}px`,
    `height:${size}px`,
    "border-radius:9999px",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    `background:${bg}`,
    `border:${isAi ? "1.5px" : "1px"} solid ${border}`,
    `box-shadow:${shadow}`,
    `color:${text}`,
    "font-family:var(--font-mono, ui-monospace, monospace)",
    `font-size:${fontSize}px`,
    "font-weight:600",
    "line-height:1",
    "font-variant-numeric:tabular-nums",
    "backdrop-filter:blur(2px)",
  ].join(";");
  el.textContent = count > 99 ? "99+" : String(count);
  el.setAttribute(
    "aria-label",
    `${count} events in this region${isAi ? `, ${c.aiCount} with AI config` : ""}`,
  );
  return el;
}

function hexA(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return `rgba(45,212,191,${alpha})`;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function GlobeLegend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-border/40 bg-background/70 p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
      <div className="mb-1.5 text-[9px] text-foreground/60">Event type</div>
      <ul className="space-y-1">
        <LegendRow color="#2dd4bf" label="Push" />
        <LegendRow color="#60a5fa" label="Pull request" />
        <LegendRow color="#a78bfa" label="Issue" />
        <LegendRow color="#f59e0b" label="Release" />
        <LegendRow color="#4ade80" label="Fork" />
        <LegendRow color="#fbbf24" label="Star" />
      </ul>
      <div className="mt-2 border-t border-border/40 pt-1.5 text-[9px] text-foreground/60">
        Bright ring = repo has AI config
      </div>
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}66` }}
        aria-hidden
      />
      <span>{label}</span>
    </li>
  );
}

function GlobeStatus({
  hasData,
  lastUpdatedAt,
  clusterCount,
  eventCount,
}: {
  hasData: boolean;
  lastUpdatedAt?: string;
  clusterCount: number;
  eventCount: number;
}) {
  if (hasData && lastUpdatedAt) {
    return (
      <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-border/40 bg-background/70 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-emerald-400 backdrop-blur-sm">
        Live · {clusterCount} cluster{clusterCount === 1 ? "" : "s"} · {eventCount} evt · {formatTimestamp(lastUpdatedAt)}
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-amber-400 backdrop-blur-sm">
      Awaiting data · polling…
    </div>
  );
}

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  } catch {
    return iso;
  }
}
