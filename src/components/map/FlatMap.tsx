"use client";

import { useEffect, useRef, useState } from "react";
import type L from "leaflet";
import type { MarkerClusterGroup } from "leaflet";
import type { GlobePoint } from "@/components/globe/Globe";
import {
  EventCard,
  colorForType,
  hexA,
  type Cluster,
  type EventMeta,
} from "@/components/globe/event-detail";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

export type FlatMapProps = {
  points?: GlobePoint[];
  /** ISO timestamp of the most recent data update. If undefined, we show "awaiting data". */
  lastUpdatedAt?: string;
};

type Selection = {
  cluster: Cluster;
  anchor: { x: number; y: number };
};

/**
 * Progressive-resolution 2D world map. Uses CartoDB Dark Matter raster
 * tiles (free, no API key) + leaflet.markercluster for the numbered
 * density bubbles. Each real GitHub event becomes a marker; clicking
 * opens the shared EventCard. Cluster click zooms in to break the
 * group apart (Leaflet's default), matching the World-Monitor UX.
 *
 * Trust contract: identical data path to Globe — reads the same
 * `/api/globe-events` points and renders them one-for-one. No
 * synthesis, no aggregation tricks. A marker on the map IS a real
 * event the pipeline saw.
 */
export function FlatMap({ points = [], lastUpdatedAt }: FlatMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<MarkerClusterGroup | null>(null);
  const leafletRef = useRef<typeof L | null>(null);

  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [selection, setSelection] = useState<Selection | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // Track the container size so the EventCard clamping logic has real dims.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        setSize({ w: Math.floor(width), h: Math.floor(height) });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // One-time map setup. Leaflet is a client-only library; we load it
  // inside an effect so SSR never touches `window`/`document`.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet.markercluster");
      if (cancelled || !mapDivRef.current) return;

      const map = L.map(mapDivRef.current, {
        worldCopyJump: true,
        minZoom: 2,
        maxZoom: 10,
        zoomControl: true,
        attributionControl: true,
      }).setView([20, 0], 2);

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          subdomains: "abcd",
          attribution:
            '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · © <a href="https://carto.com/attributions">CARTO</a>',
          maxZoom: 19,
        },
      ).addTo(map);

      const cluster = (
        L as unknown as {
          markerClusterGroup: (opts: unknown) => MarkerClusterGroup;
        }
      ).markerClusterGroup({
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        disableClusteringAtZoom: 9,
        maxClusterRadius: 48,
        // Disable the default zoom-to-bounds on cluster click so the
        // shared EventCard can open instead. Users still zoom via
        // wheel / zoom controls, matching globe parity (click reveals
        // top events in the region, not a forced zoom).
        zoomToBoundsOnClick: false,
        iconCreateFunction: (c: unknown) =>
          clusterIcon(L, c as MarkerClusterGroup),
      });
      cluster.addTo(map);

      cluster.on("clusterclick", (ev: L.LeafletEvent) => {
        const container = containerRef.current;
        if (!container) return;
        const clusterLayer = (ev as unknown as { layer: MarkerClusterGroup })
          .layer;
        const kids = (
          clusterLayer as unknown as { getAllChildMarkers: () => L.Marker[] }
        ).getAllChildMarkers();
        const pts: GlobePoint[] = [];
        for (const m of kids) {
          const p = (m.options as unknown as { eventPoint?: GlobePoint })
            .eventPoint;
          if (p) pts.push(p);
        }
        if (pts.length === 0) return;

        const rect = container.getBoundingClientRect();
        const orig = (ev as unknown as { originalEvent?: MouseEvent })
          .originalEvent;
        setSelection({
          cluster: clusterFromPoints(pts),
          anchor: {
            x: (orig?.clientX ?? rect.left + rect.width / 2) - rect.left,
            y: (orig?.clientY ?? rect.top + rect.height / 2) - rect.top,
          },
        });
      });

      leafletRef.current = L;
      mapRef.current = map;
      clusterRef.current = cluster;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      clusterRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  // Re-populate markers whenever the points list changes. Cluster group
  // is wiped + refilled — at current density (~1000) this is fast
  // enough; we'd only optimise to diff if we sustained 10k+ markers.
  useEffect(() => {
    const L = leafletRef.current;
    const cluster = clusterRef.current;
    const map = mapRef.current;
    if (!L || !cluster || !map || !ready) return;

    cluster.clearLayers();

    for (const p of points) {
      const meta = (p.meta ?? {}) as EventMeta;
      const isRegistry = meta.kind === "registry";
      const isHn = meta.kind === "hn";
      const color = isHn
        ? "#ff6600"
        : isRegistry
          ? "#cbd5e1"
          : colorForType(meta.type);
      const hasAi = meta.hasAiConfig === true;
      const decay =
        typeof meta.decayScore === "number" ? meta.decayScore : 0;

      const icon = L.divIcon({
        html: isHn
          ? hnMarkerHtml()
          : isRegistry
            ? registryMarkerHtml(decay)
            : markerHtml(color, hasAi),
        className: "ap-fm-marker",
        iconSize: isHn ? [10, 10] : isRegistry ? [8, 8] : hasAi ? [16, 16] : [10, 10],
        iconAnchor: isHn ? [5, 5] : isRegistry ? [4, 4] : hasAi ? [8, 8] : [5, 5],
      });
      const marker = L.marker([p.lat, p.lng], {
        icon,
        keyboard: false,
        // Stash the original point so the click handler can feed EventCard
        // the same shape the Globe does (a 1-event cluster).
        ...({ eventPoint: p } as Record<string, unknown>),
      });
      marker.on("click", (ev: L.LeafletMouseEvent) => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        setSelection({
          cluster: singletonCluster(p, color, meta.type),
          anchor: {
            x: ev.originalEvent.clientX - rect.left,
            y: ev.originalEvent.clientY - rect.top,
          },
        });
      });
      cluster.addLayer(marker);
    }
  }, [points, ready]);

  // Dismiss card on Escape or outside click. Same pattern as Globe.
  useEffect(() => {
    if (!selection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelection(null);
    };
    const onDown = (e: MouseEvent) => {
      const card = cardRef.current;
      if (!card) return;
      if (card.contains(e.target as Node)) return;
      setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown, true);
    };
  }, [selection]);

  // Stale points → stale eventIds. Dismiss so a new card renders.
  useEffect(() => {
    setSelection(null);
  }, [points]);

  const hasData = points.length > 0;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{ background: "#06080a" }}
    >
      <div ref={mapDivRef} className="absolute inset-0 ap-fm-root" />

      {selection && (
        <EventCard
          ref={cardRef}
          cluster={selection.cluster}
          anchor={selection.anchor}
          containerSize={size}
          onClose={() => setSelection(null)}
        />
      )}

      <MapLegend />
      <MapStatus hasData={hasData} lastUpdatedAt={lastUpdatedAt} count={points.length} />
    </div>
  );
}

/**
 * Build a divIcon body. Inner dot uses the event-type colour; for AI-config
 * we wrap a transparent halo ring around it so the flat map reads identical
 * to the 3D globe's halo semantics.
 */
function markerHtml(color: string, hasAi: boolean): string {
  const dot = `<span style="display:block;width:8px;height:8px;border-radius:9999px;background:${color};box-shadow:0 0 4px ${hexA(color, 0.6)}"></span>`;
  if (!hasAi) {
    return `<span style="display:flex;align-items:center;justify-content:center;width:10px;height:10px;">${dot}</span>`;
  }
  return `<span style="display:flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:9999px;border:1.5px solid ${hexA(color, 0.95)};box-shadow:0 0 8px ${hexA(color, 0.5)};">${dot}</span>`;
}

/**
 * HN story marker — bright orange dot (#ff6600), slightly larger than a
 * registry dot so the layer is visible against the registry density
 * backdrop. Same geometry class as the live-event no-AI marker (10×10)
 * so the user reads it as a distinct source, not as an activity pulse.
 */
function hnMarkerHtml(): string {
  return `<span style="display:block;width:8px;height:8px;border-radius:9999px;background:#ff6600;box-shadow:0 0 6px rgba(255,102,0,0.55);margin:1px"></span>`;
}

/**
 * Registry base-layer marker — slate dot, alpha driven by decay score.
 *   ≤24h → ~0.7 alpha, >90d → ~0.07 alpha. Matches Globe's
 *   `avgDecay × 0.7` clamp so the two views read identically.
 */
function registryMarkerHtml(decay: number): string {
  const alpha = Math.max(0.07, Math.min(0.7, decay * 0.7));
  const bg = hexA("#cbd5e1", alpha);
  const glow = hexA("#cbd5e1", alpha * 0.5);
  return `<span style="display:block;width:6px;height:6px;border-radius:9999px;background:${bg};box-shadow:0 0 3px ${glow};margin:1px"></span>`;
}

/** Dominant-colour + numeric-count icon for a Leaflet marker cluster. */
function clusterIcon(L: typeof import("leaflet"), cluster: MarkerClusterGroup): L.DivIcon {
  const kids = (cluster as unknown as { getAllChildMarkers: () => L.Marker[] })
    .getAllChildMarkers();
  const count = kids.length;
  const counts = new Map<string, number>();
  let ai = 0;
  let live = 0;
  let registry = 0;
  let hn = 0;
  let decaySum = 0;
  for (const m of kids) {
    const p = (m.options as unknown as { eventPoint?: GlobePoint }).eventPoint;
    const meta = p?.meta as EventMeta | undefined;
    const kind = meta?.kind;
    if (kind === "registry") {
      registry += 1;
      decaySum += typeof meta?.decayScore === "number" ? meta.decayScore : 0;
    } else if (kind === "hn") {
      hn += 1;
    } else {
      live += 1;
      const t = meta?.type ?? "unknown";
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    if (meta?.hasAiConfig) ai += 1;
  }
  const dominantLiveType =
    live > 0
      ? [...counts.entries()].sort((a, z) => z[1] - a[1])[0]?.[0]
      : undefined;
  const avgDecay = registry > 0 ? decaySum / registry : 0;
  const registryOnly = live === 0 && hn === 0 && registry > 0;
  const hnOnly = live === 0 && registry === 0 && hn > 0;
  // Majority-wins colour between live (any GH event) and HN. Registry
  // never colours a mixed bucket — it's the quiet base layer. So:
  //   hn > live         → HN orange  (community signal dominates)
  //   live ≥ hn, live>0 → dominant GH event-type colour
  //   else registry/hn-only branches above.
  // Tie goes to live on the assumption that a real code-action signal
  // outranks a discussion signal at equal count.
  const hnMajority = hn > live;
  const color = hnOnly
    ? "#ff6600"
    : registryOnly
      ? "#cbd5e1"
      : hnMajority
        ? "#ff6600"
        : colorForType(dominantLiveType);
  const isAi = ai > 0 && !registryOnly && !hnOnly && !hnMajority;

  // Registry-only clusters render quieter: smaller, no bold AI ring, and
  // the border alpha scales with avgDecay so a dormant region reads as
  // faded density, not as "activity." HN-only clusters take the HN
  // brand orange with a similar mid-intensity look (community signal,
  // not activity pulse).
  const scale = registryOnly
    ? Math.min(1.0, 0.7 + Math.log10(count) * 0.18)
    : Math.min(1.4, 0.9 + Math.log10(count) * 0.22);
  const size = Math.round((registryOnly ? 22 : 26) * scale);
  const fontSize = Math.round(11 + (scale - 0.9) * 4);
  const hnStyled = hnOnly || hnMajority;
  const borderAlpha = registryOnly
    ? Math.max(0.15, Math.min(0.6, avgDecay * 0.7))
    : hnStyled
      ? 0.85
      : isAi
        ? 0.95
        : 0.6;
  const glowAlpha = registryOnly
    ? borderAlpha * 0.5
    : hnStyled
      ? 0.5
      : isAi
        ? 0.55
        : 0.25;
  const border = hexA(color, borderAlpha);
  const glow = hexA(color, glowAlpha);
  const textColor = registryOnly
    ? "#cbd5e1"
    : hnStyled
      ? "#ffe4ce"
      : isAi
        ? "#f0fdfa"
        : "#e2e8f0";
  const label = count > 99 ? "99+" : String(count);

  const html = `
    <div style="
      position:relative;
      width:${size}px;
      height:${size}px;
      border-radius:9999px;
      display:flex;
      align-items:center;
      justify-content:center;
      background:rgba(8,14,20,0.88);
      border:${isAi ? "1.5px" : "1px"} solid ${border};
      box-shadow:0 0 ${Math.round(12 * scale)}px ${glow};
      color:${textColor};
      font-family:var(--font-mono, ui-monospace, monospace);
      font-size:${fontSize}px;
      font-weight:600;
      line-height:1;
      font-variant-numeric:tabular-nums;
      backdrop-filter:blur(2px);
    ">${label}</div>
  `.trim();

  return L.divIcon({
    html,
    className: "ap-fm-cluster",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** A singleton cluster wrapper so the flat-map card reuses the globe's card. */
function singletonCluster(
  p: GlobePoint,
  color: string,
  type: string | undefined,
): Cluster {
  const meta = (p.meta ?? {}) as EventMeta;
  const hasAi = meta.hasAiConfig === true;
  const isRegistry = meta.kind === "registry";
  const isHn = meta.kind === "hn";
  const isLive = !isRegistry && !isHn;
  const decay = typeof meta.decayScore === "number" ? meta.decayScore : 0;
  return {
    lat: p.lat,
    lng: p.lng,
    color,
    dominantType: isHn ? "hn" : type ?? "unknown",
    size: 1,
    count: 1,
    aiCount: hasAi ? 1 : 0,
    liveCount: isLive ? 1 : 0,
    registryCount: isRegistry ? 1 : 0,
    hnCount: isHn ? 1 : 0,
    avgDecay: isRegistry ? decay : 0,
    events: [p],
  };
}

/**
 * Aggregate a list of underlying events (the children of a Leaflet cluster)
 * into a Cluster shape the shared EventCard can consume. Dominant type +
 * colour match the cluster-icon rule so the badge the user just clicked is
 * consistent with the card that opens. Live events sort before registry
 * entries, each group newest-first (matches Globe.tsx semantics).
 */
function clusterFromPoints(points: GlobePoint[]): Cluster {
  const counts = new Map<string, number>();
  let ai = 0;
  let live = 0;
  let registry = 0;
  let hn = 0;
  let decaySum = 0;
  let latSum = 0;
  let lngSum = 0;
  for (const p of points) {
    const meta = (p.meta ?? {}) as EventMeta;
    const kind = meta.kind;
    if (kind === "registry") {
      registry += 1;
      decaySum += typeof meta.decayScore === "number" ? meta.decayScore : 0;
    } else if (kind === "hn") {
      hn += 1;
    } else {
      live += 1;
      const t = meta.type ?? "unknown";
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    if (meta.hasAiConfig) ai += 1;
    latSum += p.lat;
    lngSum += p.lng;
  }
  // Same majority-wins rule as clusterIcon so the card's header dot +
  // the cluster badge the user just clicked agree on colour. HN > live
  // → orange; else live wins if any; else registry/hn-only fallback.
  const hnMajority = hn > live;
  const dominantLiveType =
    live > 0
      ? [...counts.entries()].sort((a, z) => z[1] - a[1])[0]?.[0] ?? "unknown"
      : undefined;
  const dominant = hnMajority
    ? "hn"
    : dominantLiveType ?? (hn > 0 && registry === 0 ? "hn" : "registry");
  const color = hnMajority
    ? "#ff6600"
    : live > 0
      ? colorForType(dominantLiveType)
      : hn > 0 && registry === 0
        ? "#ff6600"
        : "#cbd5e1";
  const sorted = points.slice().sort((a, z) => {
    const am = a.meta as EventMeta | undefined;
    const zm = z.meta as EventMeta | undefined;
    const rank = (m: EventMeta | undefined) =>
      m?.kind === "registry" ? 2 : m?.kind === "hn" ? 1 : 0;
    const rA = rank(am);
    const rZ = rank(zm);
    if (rA !== rZ) return rA - rZ;
    const atA = am?.createdAt ?? am?.lastActivity ?? "";
    const atZ = zm?.createdAt ?? zm?.lastActivity ?? "";
    return atZ.localeCompare(atA);
  });
  return {
    lat: latSum / points.length,
    lng: lngSum / points.length,
    color,
    dominantType: dominant,
    size: 1,
    count: points.length,
    aiCount: ai,
    liveCount: live,
    registryCount: registry,
    hnCount: hn,
    avgDecay: registry > 0 ? decaySum / registry : 0,
    events: sorted,
  };
}

function MapLegend() {
  return (
    <div
      className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-border/40 bg-background/70 p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur-sm"
      style={{ zIndex: 1000 }}
    >
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

function MapStatus({
  hasData,
  lastUpdatedAt,
  count,
}: {
  hasData: boolean;
  lastUpdatedAt?: string;
  count: number;
}) {
  if (hasData && lastUpdatedAt) {
    return (
      <div
        className="pointer-events-none absolute right-3 top-3 rounded-md border border-border/40 bg-background/70 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-emerald-400 backdrop-blur-sm"
        style={{ zIndex: 1000 }}
      >
        Live · {count} evt · {formatTimestamp(lastUpdatedAt)}
      </div>
    );
  }
  return (
    <div
      className="pointer-events-none absolute right-3 top-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-amber-400 backdrop-blur-sm"
      style={{ zIndex: 1000 }}
    >
      Awaiting data · polling…
    </div>
  );
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toISOString().replace("T", " ").slice(0, 19) + " UTC";
  } catch {
    return iso;
  }
}
