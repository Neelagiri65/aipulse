"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

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

const TEAL = "#2dd4bf";
const SLATE = "#cbd5e1";

type Cluster = {
  lat: number;
  lng: number;
  color: string;
  size: number;
  count: number;
  aiCount: number;
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
  const buckets = new Map<string, { lats: number[]; lngs: number[]; ai: number; total: number }>();

  for (const p of points) {
    const by = Math.round(p.lat / BUCKET_DEG);
    const bx = Math.round(p.lng / BUCKET_DEG);
    const key = `${by}:${bx}`;
    const isAi = p.color === TEAL;
    const b = buckets.get(key);
    if (b) {
      b.lats.push(p.lat);
      b.lngs.push(p.lng);
      b.total += 1;
      if (isAi) b.ai += 1;
    } else {
      buckets.set(key, { lats: [p.lat], lngs: [p.lng], ai: isAi ? 1 : 0, total: 1 });
    }
  }

  const clusters: Cluster[] = [];
  for (const b of buckets.values()) {
    const lat = b.lats.reduce((s, v) => s + v, 0) / b.lats.length;
    const lng = b.lngs.reduce((s, v) => s + v, 0) / b.lngs.length;
    const aiDominant = b.ai > 0;
    const base = aiDominant ? 0.55 : 0.32;
    const size = Math.min(1.6, base + Math.log2(1 + b.total) * 0.22);
    clusters.push({
      lat,
      lng,
      color: aiDominant ? TEAL : SLATE,
      size,
      count: b.total,
      aiCount: b.ai,
    });
  }
  return clusters;
}

export function Globe({ points = [], lastUpdatedAt }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

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
  const hasData = points.length > 0;

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
          pointsMerge
          pointsTransitionDuration={2500}
        />
      )}

      <GlobeLegend />
      <GlobeStatus hasData={hasData} lastUpdatedAt={lastUpdatedAt} clusterCount={clusters.length} eventCount={points.length} />
    </div>
  );
}

function GlobeLegend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-border/40 bg-background/70 p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
      <div className="mb-1.5 text-[9px] text-foreground/60">Dot legend</div>
      <ul className="space-y-1">
        <LegendRow color="#2dd4bf" label="Repo has AI config (CLAUDE.md / .cursorrules / …)" />
        <LegendRow color="#cbd5e1" label="Public commit, no AI config detected" />
        <LegendRow color="#60a5fa" label="Tool migration signal (config rename within 7d)" />
        <LegendRow color="#f87171" label="Region affected by tool outage" />
      </ul>
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
