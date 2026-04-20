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
import {
  LABS_VIOLET,
  LABS_INACTIVE_OPACITY,
} from "@/components/labs/labs-to-points";
import {
  RSS_AMBER,
  RSS_INACTIVE_OPACITY,
} from "@/components/wire/rss-to-points";

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
      // Test hook: expose the Leaflet map instance on the container so
      // Playwright specs can drive setView([lat, lng], zoom) deterministically
      // (e.g. the lab-HQ violet-dot smoke zooms to a quiet HQ past the
      // `disableClusteringAtZoom: 9` threshold). No-op for real users.
      (mapDivRef.current as unknown as { __apMap?: L.Map }).__apMap = map;
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
      const isLab = meta.kind === "lab";
      const isRss = meta.kind === "rss";
      const color = isLab
        ? LABS_VIOLET
        : isRss
          ? RSS_AMBER
          : isHn
            ? "#ff6600"
            : isRegistry
              ? "#cbd5e1"
              : colorForType(meta.type);
      const hasAi = meta.hasAiConfig === true;
      const decay =
        typeof meta.decayScore === "number" ? meta.decayScore : 0;
      const labInactive = isLab && meta.labInactive === true;
      const labSize =
        isLab && typeof p.size === "number" ? p.size : 0.6;
      const rssInactive = isRss && meta.rssInactive === true;
      const rssSize =
        isRss && typeof p.size === "number" ? p.size : 0.6;

      const icon = L.divIcon({
        html: isLab
          ? labMarkerHtml(labSize, labInactive)
          : isRss
            ? rssMarkerHtml(rssSize, rssInactive)
            : isHn
              ? hnMarkerHtml()
              : isRegistry
                ? registryMarkerHtml(decay)
                : markerHtml(color, hasAi),
        className: "ap-fm-marker",
        iconSize: isLab
          ? [labIconPx(labSize), labIconPx(labSize)]
          : isRss
            ? [rssIconPx(rssSize), rssIconPx(rssSize)]
            : isHn
              ? [10, 10]
              : isRegistry
                ? [8, 8]
                : hasAi
                  ? [16, 16]
                  : [10, 10],
        iconAnchor: isLab
          ? [labIconPx(labSize) / 2, labIconPx(labSize) / 2]
          : isRss
            ? [rssIconPx(rssSize) / 2, rssIconPx(rssSize) / 2]
            : isHn
              ? [5, 5]
              : isRegistry
                ? [4, 4]
                : hasAi
                  ? [8, 8]
                  : [5, 5],
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
 * AI-Lab marker — violet dot at the lab's HQ. Size scales with the lab's
 * 7d activity (already log-linear / p95-clamped by labsToGlobePoints).
 * Zero-activity labs dim to LABS_INACTIVE_OPACITY but stay visible so
 * the presence of the lab is always on the map.
 */
function labIconPx(labSize: number): number {
  // labSize is ~0.3..1.2; map to ~8..18px on screen so even quiet labs
  // are visible but an active lab reads clearly larger.
  const px = Math.round(8 + (labSize - 0.3) * 11);
  return Math.max(8, Math.min(18, px));
}

function labMarkerHtml(labSize: number, inactive: boolean): string {
  const px = labIconPx(labSize);
  const dotPx = Math.max(6, px - 2);
  const alpha = inactive ? LABS_INACTIVE_OPACITY : 0.95;
  const bg = hexA(LABS_VIOLET, alpha);
  const glow = hexA(LABS_VIOLET, inactive ? alpha * 0.4 : 0.55);
  return `<span style="display:flex;align-items:center;justify-content:center;width:${px}px;height:${px}px;"><span style="display:block;width:${dotPx}px;height:${dotPx}px;border-radius:9999px;background:${bg};box-shadow:0 0 ${inactive ? 3 : 6}px ${glow}"></span></span>`;
}

/**
 * Regional-RSS marker — amber dot at the publisher's HQ. Size scales
 * with the 24h item count (already log-linear / p95-clamped by
 * rssToGlobePoints). Inactive publishers dim to RSS_INACTIVE_OPACITY
 * but stay visible so the curated registry is always represented on
 * the map.
 */
function rssIconPx(rssSize: number): number {
  // rssSize is ~0.3..1.1; map to ~8..16px on screen so quiet publishers
  // are visible but a busy one reads clearly larger.
  const px = Math.round(8 + (rssSize - 0.3) * 10);
  return Math.max(8, Math.min(16, px));
}

function rssMarkerHtml(rssSize: number, inactive: boolean): string {
  const px = rssIconPx(rssSize);
  const dotPx = Math.max(6, px - 2);
  const alpha = inactive ? RSS_INACTIVE_OPACITY : 0.95;
  const bg = hexA(RSS_AMBER, alpha);
  const glow = hexA(RSS_AMBER, inactive ? alpha * 0.4 : 0.55);
  return `<span style="display:flex;align-items:center;justify-content:center;width:${px}px;height:${px}px;"><span style="display:block;width:${dotPx}px;height:${dotPx}px;border-radius:9999px;background:${bg};box-shadow:0 0 ${inactive ? 3 : 6}px ${glow}"></span></span>`;
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
  let lab = 0;
  let activeLab = 0;
  let rss = 0;
  let activeRss = 0;
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
    } else if (kind === "lab") {
      lab += 1;
      if (meta?.labInactive !== true) activeLab += 1;
    } else if (kind === "rss") {
      rss += 1;
      if (meta?.rssInactive !== true) activeRss += 1;
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
  const registryOnly =
    live === 0 && hn === 0 && lab === 0 && rss === 0 && registry > 0;
  const hnOnly =
    live === 0 && registry === 0 && lab === 0 && rss === 0 && hn > 0;
  const labOnly = live === 0 && hn === 0 && lab > 0 && rss === 0;
  const rssOnly = live === 0 && lab === 0 && rss > 0;
  // Majority-wins colour: live > lab > rss > hn > registry.
  //   live > 0, hn > live   → HN orange
  //   live > 0, hn ≤ live   → dominant GH event-type colour
  //   live == 0, lab > 0    → LABS_VIOLET
  //   live == 0, lab == 0,
  //     rss > 0             → RSS_AMBER (regional layer wins when no live/lab)
  //   hn-only               → HN orange
  //   registry-only         → slate base
  // Tie between live and hn goes to live (code-action > discussion).
  const hnMajority = hn > live;
  const color =
    live === 0 && lab > 0
      ? LABS_VIOLET
      : live === 0 && lab === 0 && rss > 0
        ? RSS_AMBER
        : hnOnly
          ? "#ff6600"
          : registryOnly
            ? "#cbd5e1"
            : hnMajority
              ? "#ff6600"
              : colorForType(dominantLiveType);
  const isAi =
    ai > 0 &&
    !registryOnly &&
    !hnOnly &&
    !hnMajority &&
    !labOnly &&
    !rssOnly;
  // A lab-only cluster with zero active labs dims the icon border/glow
  // so the cluster is still clickable but reads as "tracked, quiet."
  const labInactiveCluster = labOnly && activeLab === 0;
  const rssInactiveCluster = rssOnly && activeRss === 0;

  // Registry-only clusters render quieter: smaller, no bold AI ring, and
  // the border alpha scales with avgDecay so a dormant region reads as
  // faded density, not as "activity." HN-only clusters take the HN
  // brand orange with a similar mid-intensity look (community signal,
  // not activity pulse). RSS-only clusters mirror the lab treatment —
  // calm amber ring, dim if inactive.
  const presenceOnly = registryOnly || labOnly || rssOnly;
  const scale = presenceOnly
    ? Math.min(1.0, 0.7 + Math.log10(count) * 0.18)
    : Math.min(1.4, 0.9 + Math.log10(count) * 0.22);
  const size = Math.round((presenceOnly ? 22 : 26) * scale);
  const fontSize = Math.round(11 + (scale - 0.9) * 4);
  const hnStyled = hnOnly || hnMajority;
  const borderAlpha = registryOnly
    ? Math.max(0.15, Math.min(0.6, avgDecay * 0.7))
    : labOnly
      ? labInactiveCluster
        ? LABS_INACTIVE_OPACITY
        : 0.9
      : rssOnly
        ? rssInactiveCluster
          ? RSS_INACTIVE_OPACITY
          : 0.9
        : hnStyled
          ? 0.85
          : isAi
            ? 0.95
            : 0.6;
  const glowAlpha = registryOnly
    ? borderAlpha * 0.5
    : labOnly
      ? labInactiveCluster
        ? LABS_INACTIVE_OPACITY * 0.5
        : 0.5
      : rssOnly
        ? rssInactiveCluster
          ? RSS_INACTIVE_OPACITY * 0.5
          : 0.5
        : hnStyled
          ? 0.5
          : isAi
            ? 0.55
            : 0.25;
  const border = hexA(color, borderAlpha);
  const glow = hexA(color, glowAlpha);
  const textColor = registryOnly
    ? "#cbd5e1"
    : labOnly
      ? "#ede9fe"
      : rssOnly
        ? "#fed7aa"
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
  const isLab = meta.kind === "lab";
  const isRss = meta.kind === "rss";
  const isLive = !isRegistry && !isHn && !isLab && !isRss;
  const isLabActive = isLab && meta.labInactive !== true;
  const isRssActive = isRss && meta.rssInactive !== true;
  const decay = typeof meta.decayScore === "number" ? meta.decayScore : 0;
  return {
    lat: p.lat,
    lng: p.lng,
    color,
    dominantType: isHn
      ? "hn"
      : isLab
        ? "lab"
        : isRss
          ? "rss"
          : type ?? "unknown",
    size: 1,
    count: 1,
    aiCount: hasAi ? 1 : 0,
    liveCount: isLive ? 1 : 0,
    registryCount: isRegistry ? 1 : 0,
    hnCount: isHn ? 1 : 0,
    labCount: isLab ? 1 : 0,
    activeLabCount: isLabActive ? 1 : 0,
    rssCount: isRss ? 1 : 0,
    activeRssCount: isRssActive ? 1 : 0,
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
  let lab = 0;
  let activeLab = 0;
  let rss = 0;
  let activeRss = 0;
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
    } else if (kind === "lab") {
      lab += 1;
      if (meta.labInactive !== true) activeLab += 1;
    } else if (kind === "rss") {
      rss += 1;
      if (meta.rssInactive !== true) activeRss += 1;
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
  // the cluster badge the user just clicked agree on colour. Live >
  // lab > rss > HN > registry. Tie live==hn goes to live.
  const hnMajority = hn > live;
  const dominantLiveType =
    live > 0
      ? [...counts.entries()].sort((a, z) => z[1] - a[1])[0]?.[0] ?? "unknown"
      : undefined;
  const dominant = hnMajority
    ? "hn"
    : live > 0
      ? dominantLiveType ?? "unknown"
      : lab > 0
        ? "lab"
        : rss > 0
          ? "rss"
          : hn > 0 && registry === 0
            ? "hn"
            : "registry";
  const color = hnMajority
    ? "#ff6600"
    : live > 0
      ? colorForType(dominantLiveType)
      : lab > 0
        ? LABS_VIOLET
        : rss > 0
          ? RSS_AMBER
          : hn > 0 && registry === 0
            ? "#ff6600"
            : "#cbd5e1";
  const sorted = points.slice().sort((a, z) => {
    const am = a.meta as EventMeta | undefined;
    const zm = z.meta as EventMeta | undefined;
    const rank = (m: EventMeta | undefined) =>
      m?.kind === "registry"
        ? 4
        : m?.kind === "lab"
          ? 3
          : m?.kind === "rss"
            ? 2
            : m?.kind === "hn"
              ? 1
              : 0;
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
    labCount: lab,
    activeLabCount: activeLab,
    rssCount: rss,
    activeRssCount: activeRss,
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
        AI Labs
      </div>
      <ul className="mt-1 space-y-1">
        <LegendRow color={LABS_VIOLET} label="Lab HQ · 7d activity" />
      </ul>
      <div className="mt-2 border-t border-border/40 pt-1.5 text-[9px] text-foreground/60">
        Regional RSS
      </div>
      <ul className="mt-1 space-y-1">
        <LegendRow color={RSS_AMBER} label="Publisher HQ · 24h items" />
      </ul>
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
