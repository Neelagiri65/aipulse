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

const SLATE = "#cbd5e1";

/**
 * Bucket points into a coarse lat/lng grid. Points come from two sources:
 *   - Live events (meta.kind === "event") — the 4-hour pulse layer.
 *     Bright; colour by dominant event type; bucket size scales with
 *     count; AI-cfg drives the halo ring.
 *   - Registry entries (meta.kind === "registry") — the persistent
 *     base layer. Dim slate; opacity = avg decayScore of bucket. A
 *     registry-only bucket renders smaller and quieter than a live one.
 *
 * A bucket with both layers is a "live" cluster: a registry repo that
 * also had a real event in the current window. It takes the bright
 * live colour + event-type pills in the card, with registry rows
 * visible below live rows for context.
 */
function clusterPoints(points: GlobePoint[]): Cluster[] {
  const BUCKET_DEG = 4;
  const buckets = new Map<
    string,
    {
      lats: number[];
      lngs: number[];
      ai: number;
      total: number;
      live: number;
      registry: number;
      hn: number;
      decaySum: number;
      events: GlobePoint[];
    }
  >();

  for (const p of points) {
    const by = Math.round(p.lat / BUCKET_DEG);
    const bx = Math.round(p.lng / BUCKET_DEG);
    const key = `${by}:${bx}`;
    const meta = p.meta as EventMeta | undefined;
    const kind = meta?.kind;
    const isRegistry = kind === "registry";
    const isHn = kind === "hn";
    const isLive = !isRegistry && !isHn;
    const isAi = meta?.hasAiConfig === true;
    const decay = typeof meta?.decayScore === "number" ? meta.decayScore : 0;
    const b = buckets.get(key);
    if (b) {
      b.lats.push(p.lat);
      b.lngs.push(p.lng);
      b.total += 1;
      if (isAi) b.ai += 1;
      if (isLive) b.live += 1;
      else if (isHn) b.hn += 1;
      else {
        b.registry += 1;
        b.decaySum += decay;
      }
      b.events.push(p);
    } else {
      buckets.set(key, {
        lats: [p.lat],
        lngs: [p.lng],
        ai: isAi ? 1 : 0,
        total: 1,
        live: isLive ? 1 : 0,
        registry: isRegistry ? 1 : 0,
        hn: isHn ? 1 : 0,
        decaySum: isRegistry ? decay : 0,
        events: [p],
      });
    }
  }

  const clusters: Cluster[] = [];
  for (const b of buckets.values()) {
    const lat = b.lats.reduce((s, v) => s + v, 0) / b.lats.length;
    const lng = b.lngs.reduce((s, v) => s + v, 0) / b.lngs.length;

    // Bucket colour:
    // - Any live activity → dominant live event type
    // - HN-only → HN brand orange
    // - Registry-only → slate, opacity driven by avg decay
    // Mixed HN + registry (no live) → HN wins so community signal stays
    // visible against the decayed base layer.
    let color: string;
    let dominantType: string;
    if (b.live > 0) {
      const typeCounts = new Map<string, number>();
      for (const ev of b.events) {
        const m = ev.meta as EventMeta | undefined;
        if (m?.kind === "registry" || m?.kind === "hn") continue;
        const t = m?.type ?? "unknown";
        typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
      }
      dominantType =
        [...typeCounts.entries()].sort((a, z) => z[1] - a[1])[0]?.[0] ??
        "unknown";
      color = colorForType(dominantType);
    } else if (b.hn > 0) {
      dominantType = "hn";
      color = "#ff6600";
    } else {
      dominantType = "registry";
      color = SLATE;
    }

    const avgDecay = b.registry > 0 ? b.decaySum / b.registry : 0;

    // Size:
    //   Live buckets — existing rule, scales with live count.
    //   HN-only — steady mid-range; HN reads as community signal, not
    //   activity pulse, so it shouldn't flicker in size with point count.
    //   Registry-only — smaller floor, scaled by registry count and the
    //   avg decay so dormant regions read dimmer + smaller than active
    //   regions with comparable registry density.
    let size: number;
    if (b.live > 0) {
      const aiDominant = b.ai > 0;
      const base = aiDominant ? 0.55 : 0.32;
      size = Math.min(1.6, base + Math.log2(1 + b.live) * 0.22);
    } else if (b.hn > 0) {
      size = Math.min(0.9, 0.32 + Math.log2(1 + b.hn) * 0.18);
    } else {
      const decayWeight = 0.35 + avgDecay * 0.5; // 0.35..0.85
      size = Math.min(
        1.1,
        0.22 + Math.log2(1 + b.registry) * 0.16 * decayWeight,
      );
    }

    // Sort: live events first, then HN stories, then registry entries.
    // Within each band, newest-first by createdAt/lastActivity. Card
    // leads with the freshest live action, then community signal, then
    // the "here's who lives in this region" base layer.
    const sortedEvents = b.events.slice().sort((a, z) => {
      const am = a.meta as EventMeta | undefined;
      const zm = z.meta as EventMeta | undefined;
      const rankFor = (m: EventMeta | undefined) =>
        m?.kind === "registry" ? 2 : m?.kind === "hn" ? 1 : 0;
      const rA = rankFor(am);
      const rZ = rankFor(zm);
      if (rA !== rZ) return rA - rZ;
      const atA = am?.createdAt ?? am?.lastActivity ?? "";
      const atZ = zm?.createdAt ?? zm?.lastActivity ?? "";
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
      liveCount: b.live,
      registryCount: b.registry,
      hnCount: b.hn,
      avgDecay,
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
  // Clusters we adorn with an HTML element:
  //   - Multi-live clusters (numeric badge, live-type colour).
  //   - Singleton live AI-config dots (halo ring).
  //   - Multi-HN clusters with no live activity (numeric badge, orange).
  // Registry-only and singleton-HN dots stay unlabelled — base layer
  // and singleton signal respectively read as density, not call-outs.
  const labeledClusters = useMemo(
    () =>
      clusters.filter((c) => {
        if (c.liveCount > 1) return true;
        if (c.liveCount === 1 && c.aiCount > 0) return true;
        if (c.liveCount === 0 && c.hnCount > 1) return true;
        return false;
      }),
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
          // Per-cluster colour:
          //   Live bucket      → full-opacity event-type colour.
          //   HN-only (no live) → full-opacity HN orange. Community
          //                       signal should read as bright as live.
          //   Registry-only    → slate with alpha = avgDecay × 0.7 so
          //                      a 90-day-old cluster reads ~7% and a
          //                      24h cluster reads ~70% — dim base vs
          //                      fresh base at a glance.
          pointColor={(d) => {
            const c = d as Cluster;
            if (c.liveCount > 0) return c.color;
            if (c.hnCount > 0) return c.color;
            const alpha = Math.max(0.07, Math.min(0.7, c.avgDecay * 0.7));
            return hexA(c.color, alpha);
          }}
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
      <div className="mb-1.5 text-[9px] text-foreground/60">Live event type</div>
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
      <div className="mt-2 border-t border-border/40 pt-1.5 text-[9px] text-foreground/60">
        Registry decay (AI-cfg repos)
      </div>
      <ul className="mt-1 space-y-1">
        <DecayRow opacity={0.7} label="≤24h" />
        <DecayRow opacity={0.6} label="≤7d" />
        <DecayRow opacity={0.4} label="≤30d" />
        <DecayRow opacity={0.18} label="≤90d" />
        <DecayRow opacity={0.08} label=">90d" />
      </ul>
    </div>
  );
}

function DecayRow({ opacity, label }: { opacity: number; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{
          backgroundColor: `rgba(203,213,225,${opacity})`,
          boxShadow: `0 0 4px rgba(203,213,225,${opacity * 0.6})`,
        }}
        aria-hidden
      />
      <span>{label}</span>
    </li>
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
