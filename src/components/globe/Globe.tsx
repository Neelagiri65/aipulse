"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EventCard,
  colorForType,
  hexA,
  type Cluster,
  type EventMeta,
} from "./event-detail";

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
          // Smaller base radius so zoomed-in dots read as data points not
          // paint blobs. react-globe.gl interprets pointRadius in degrees,
          // so a small number here = small footprint at all zoom levels.
          pointRadius={(d) => Math.min(0.22, (d as Cluster).size * 0.09)}
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
