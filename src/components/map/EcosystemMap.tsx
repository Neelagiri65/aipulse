"use client";

import { useEffect, useRef, useState } from "react";
import type L from "leaflet";
import type { LabActivity } from "@/lib/data/fetch-labs";
import { CATEGORY_META, type LabKind } from "@/lib/data/labs-registry";

import "leaflet/dist/leaflet.css";

export type EcosystemMapProps = {
  labs: LabActivity[];
};

type Selection = {
  lab: LabActivity;
  anchor: { x: number; y: number };
};

const TILE_URL =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTR =
  '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';

const BASE_RADIUS = 8;
const MAX_RADIUS = 18;

export function EcosystemMap({ labs }: EcosystemMapProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Layer[]>([]);
  const leafletRef = useRef<typeof L | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<LabKind>>(
    new Set(Object.keys(CATEGORY_META) as LabKind[]),
  );

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const Leaflet = (await import("leaflet")).default;
      if (cancelled || !mapDivRef.current) return;
      leafletRef.current = Leaflet;

      const map = Leaflet.map(mapDivRef.current, {
        center: [30, 0],
        zoom: 3,
        minZoom: 2,
        maxZoom: 12,
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
      });

      Leaflet.tileLayer(TILE_URL, {
        attribution: TILE_ATTR,
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);

      Leaflet.control.zoom({ position: "bottomright" }).addTo(map);
      Leaflet.control
        .attribution({ position: "bottomleft", prefix: false })
        .addAttribution(TILE_ATTR)
        .addTo(map);

      mapRef.current = map;
      addMarkers(Leaflet, map, labs, activeCategories);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const Lf = leafletRef.current;
    const map = mapRef.current;
    if (!Lf || !map) return;
    clearMarkers();
    addMarkers(Lf, map, labs, activeCategories);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labs, activeCategories]);

  function clearMarkers() {
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
  }

  function addMarkers(
    Leaflet: typeof L,
    map: L.Map,
    data: LabActivity[],
    active: Set<LabKind>,
  ) {
    const maxTotal = Math.max(1, ...data.filter((l) => l.total > 0).map((l) => l.total), 1);

    for (const lab of data) {
      if (!active.has(lab.kind)) continue;
      const meta = CATEGORY_META[lab.kind];
      const hasActivity = lab.total > 0;
      const radius = hasActivity
        ? BASE_RADIUS + (MAX_RADIUS - BASE_RADIUS) * Math.min(1, Math.log(1 + lab.total) / Math.log(1 + maxTotal))
        : BASE_RADIUS;

      const marker = Leaflet.circleMarker([lab.lat, lab.lng], {
        radius,
        fillColor: meta.color,
        fillOpacity: hasActivity ? 0.7 : 0.5,
        color: meta.color,
        weight: 2,
        opacity: 0.9,
      }).addTo(map);

      marker.bindTooltip(lab.displayName, {
        className: "ap-eco-tooltip",
        direction: "top",
        offset: [0, -radius],
      });

      marker.on("click", (e: L.LeafletMouseEvent) => {
        setSelection({
          lab,
          anchor: { x: e.containerPoint.x, y: e.containerPoint.y },
        });
      });

      markersRef.current.push(marker);

      const label = Leaflet.marker([lab.lat, lab.lng], {
        icon: Leaflet.divIcon({
          className: "ap-eco-label",
          html: `<span style="color:${meta.color}">${lab.displayName}</span>`,
          iconSize: [0, 0],
          iconAnchor: [-radius - 4, 5],
        }),
        interactive: false,
      }).addTo(map);
      markersRef.current.push(label);
    }
  }

  const toggleCategory = (kind: LabKind) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        if (next.size === 1) return next;
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
    setSelection(null);
  };

  const categoryCounts = labs.reduce(
    (acc, lab) => {
      acc[lab.kind] = (acc[lab.kind] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="relative h-full w-full">
      <div ref={mapDivRef} className="h-full w-full" />

      {/* Category legend / filter — offset right to clear the 44px LeftNav rail */}
      <div
        className="absolute z-[1000] flex flex-col gap-1.5 rounded-lg border border-border/50 bg-background/90 px-3 py-2.5 shadow-lg backdrop-blur-md"
        style={{ left: 56, top: 12 }}
      >
        <span className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-foreground/70">
          AI Ecosystem · {labs.length} companies
        </span>
        {(Object.keys(CATEGORY_META) as LabKind[]).map((kind) => {
          const meta = CATEGORY_META[kind];
          const active = activeCategories.has(kind);
          const count = categoryCounts[kind] ?? 0;
          return (
            <button
              key={kind}
              type="button"
              className="flex items-center gap-2.5 rounded-md px-2 py-1 text-left transition-all hover:bg-white/5"
              style={{ opacity: active ? 1 : 0.3 }}
              onClick={() => toggleCategory(kind)}
            >
              <span
                className="inline-block h-3 w-3 rounded-full border"
                style={{
                  backgroundColor: meta.color + (active ? "cc" : "44"),
                  borderColor: meta.color,
                }}
              />
              <span className="min-w-[52px] font-mono text-[11px] font-medium text-foreground">
                {meta.label}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Detail card */}
      {selection && (
        <LabDetailCard
          lab={selection.lab}
          onClose={() => setSelection(null)}
        />
      )}
    </div>
  );
}

function LabDetailCard({
  lab,
  onClose,
}: {
  lab: LabActivity;
  onClose: () => void;
}) {
  const meta = CATEGORY_META[lab.kind];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      role="dialog"
      className="absolute bottom-4 right-4 z-[1001] w-80 rounded-lg border border-border/60 bg-background/95 p-3 shadow-xl backdrop-blur-md"
    >
      <div className="mb-2 flex items-start justify-between">
        <div>
          <a
            href={lab.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm font-medium text-foreground hover:text-teal-300"
          >
            {lab.displayName}
          </a>
          <div className="mt-0.5 flex items-center gap-2">
            <span
              className="inline-block rounded px-1 py-px font-mono text-[9px] font-semibold"
              style={{
                backgroundColor: meta.color + "22",
                color: meta.color,
              }}
            >
              {meta.label}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {lab.city}, {lab.country}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-mono text-lg font-bold text-foreground">
          {lab.total.toLocaleString()}
        </span>
        <span className="font-mono text-[9px] uppercase text-muted-foreground">
          events · 7d
        </span>
        {lab.stale && (
          <span className="font-mono text-[8px] uppercase text-amber-400">
            stale
          </span>
        )}
      </div>

      {lab.repos.length > 0 && (
        <div className="space-y-1">
          {lab.repos.map((r) => (
            <div
              key={`${r.owner}/${r.repo}`}
              className="flex items-center justify-between"
            >
              <a
                href={r.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] text-teal-300/80 hover:text-teal-300"
              >
                {r.owner}/{r.repo}
              </a>
              <span className="font-mono text-[10px] text-muted-foreground">
                {r.total}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 border-t border-border/30 pt-1.5">
        <a
          href={lab.hqSourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[8px] uppercase text-muted-foreground/60 hover:text-muted-foreground"
        >
          HQ source ↗
        </a>
      </div>
    </div>
  );
}
