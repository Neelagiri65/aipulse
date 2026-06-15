"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import type L from "leaflet";
import type { LabActivity } from "@/lib/data/fetch-labs";
import { CATEGORY_META, type LabKind } from "@/lib/data/labs-registry";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";

export type EcosystemMapProps = {
  labs: LabActivity[];
};

const TILE_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_ATTR =
  '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';

const LIGHT_COLORS: Record<LabKind, { bg: string; border: string; text: string; dot: string }> = {
  labs:    { bg: "#f3e8ff", border: "#c084fc", text: "#7c3aed", dot: "#8b5cf6" },
  infra:   { bg: "#dbeafe", border: "#60a5fa", text: "#2563eb", dot: "#3b82f6" },
  cloud:   { bg: "#cffafe", border: "#22d3ee", text: "#0891b2", dot: "#06b6d4" },
  silicon: { bg: "#fef3c7", border: "#fbbf24", text: "#b45309", dot: "#f59e0b" },
  tooling: { bg: "#dcfce7", border: "#4ade80", text: "#16a34a", dot: "#22c55e" },
};

export function EcosystemMap({ labs }: EcosystemMapProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markerMapRef = useRef<Map<string, L.Marker>>(new Map());
  const leafletRef = useRef<typeof L | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<LabKind>>(
    new Set(Object.keys(CATEGORY_META) as LabKind[]),
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const selectedLab = useMemo(
    () => labs.find((l) => l.id === selectedId) ?? null,
    [labs, selectedId],
  );

  const filteredLabs = useMemo(() => {
    const q = search.toLowerCase().trim();
    return labs.filter((l) => {
      if (!activeCategories.has(l.kind)) return false;
      if (q && !l.displayName.toLowerCase().includes(q) && !l.city.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [labs, activeCategories, search]);

  const selectAndFlyTo = useCallback((lab: LabActivity) => {
    setSelectedId(lab.id);
    const map = mapRef.current;
    if (map) {
      map.flyTo([lab.lat, lab.lng], Math.max(map.getZoom(), 8), { duration: 0.6 });
    }
    const marker = markerMapRef.current.get(lab.id);
    if (marker && clusterRef.current) {
      clusterRef.current.zoomToShowLayer(marker, () => marker.openTooltip());
    }
  }, []);

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const [Leaflet, MC] = await Promise.all([
        import("leaflet").then((m) => m.default),
        import("leaflet.markercluster"),
      ]);
      void MC;
      if (cancelled || !mapDivRef.current) return;
      leafletRef.current = Leaflet;

      const map = Leaflet.map(mapDivRef.current, {
        center: [30, 0],
        zoom: 3,
        minZoom: 2,
        maxZoom: 14,
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
      buildClusters(Leaflet, map, labs, activeCategories);
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
    buildClusters(Lf, map, labs, activeCategories);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labs, activeCategories]);

  function buildClusters(
    Leaflet: typeof L,
    map: L.Map,
    data: LabActivity[],
    active: Set<LabKind>,
  ) {
    if (clusterRef.current) {
      map.removeLayer(clusterRef.current);
      clusterRef.current = null;
    }
    markerMapRef.current.clear();

    const cluster = (Leaflet as any).markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      animate: true,
      iconCreateFunction: (c: any) => {
        const count = c.getChildCount();
        const children: LabActivity[] = c
          .getAllChildMarkers()
          .map((m: any) => m.options._labData)
          .filter(Boolean);
        const kindCounts: Record<string, number> = {};
        for (const l of children) {
          kindCounts[l.kind] = (kindCounts[l.kind] ?? 0) + 1;
        }
        const dominantKind = (Object.entries(kindCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "labs") as LabKind;
        const c_ = LIGHT_COLORS[dominantKind];
        const size = count > 20 ? 52 : count > 10 ? 44 : 36;
        return Leaflet.divIcon({
          className: "",
          html: `<div style="
            width: ${size}px; height: ${size}px;
            background: ${c_.bg};
            border: 2px solid ${c_.border};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: ui-monospace, SFMono-Regular, monospace;
            font-size: ${count > 20 ? 14 : 12}px;
            font-weight: 700;
            color: ${c_.text};
            box-shadow: 0 2px 8px rgba(0,0,0,0.12);
            cursor: pointer;
          ">${count}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
      },
    }) as L.MarkerClusterGroup;

    for (const lab of data) {
      if (!active.has(lab.kind)) continue;
      const c = LIGHT_COLORS[lab.kind];
      const isSelected = lab.id === selectedId;

      const marker = Leaflet.marker([lab.lat, lab.lng], {
        icon: Leaflet.divIcon({
          className: "",
          html: `<div style="
            background: ${isSelected ? c.border : "#fff"};
            border: 1.5px solid ${c.border};
            border-radius: 8px;
            padding: 3px 10px 3px 8px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 11px;
            font-weight: 600;
            color: ${isSelected ? "#fff" : c.text};
            white-space: nowrap;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            cursor: pointer;
            box-shadow: 0 1px 4px rgba(0,0,0,0.10);
            transition: all 0.15s ease;
          "><span style="
            width: 6px; height: 6px;
            border-radius: 50%;
            background: ${isSelected ? "#fff" : c.dot};
            flex-shrink: 0;
          "></span>${lab.displayName}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 12],
        }),
        _labData: lab,
      } as any);

      marker.bindTooltip(
        `<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 12px; line-height: 1.4;">
          <strong>${lab.displayName}</strong><br/>
          <span style="color: ${c.text}; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">${CATEGORY_META[lab.kind].label}</span>
          <span style="color: #64748b; font-size: 11px;"> · ${lab.city}, ${lab.country}</span><br/>
          <span style="color: #334155; font-weight: 600;">${lab.total.toLocaleString()}</span>
          <span style="color: #94a3b8; font-size: 10px;"> events (7d)</span>
        </div>`,
        {
          className: "ap-eco-tooltip-light",
          direction: "top",
          offset: [0, -8],
        },
      );

      marker.on("click", () => setSelectedId(lab.id));
      cluster.addLayer(marker);
      markerMapRef.current.set(lab.id, marker);
    }

    map.addLayer(cluster);
    clusterRef.current = cluster;
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
    setSelectedId(null);
  };

  const categoryCounts = labs.reduce(
    (acc, lab) => {
      acc[lab.kind] = (acc[lab.kind] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const groupedLabs = useMemo(() => {
    const groups: Record<LabKind, LabActivity[]> = { labs: [], infra: [], cloud: [], silicon: [], tooling: [] };
    for (const lab of filteredLabs) {
      groups[lab.kind].push(lab);
    }
    return groups;
  }, [filteredLabs]);

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "#f8fafc" }}>
      <div ref={mapDivRef} className="h-full w-full" />

      {/* Category filter — floating card */}
      <div
        className="absolute z-[1000] flex flex-col gap-1 rounded-xl border border-slate-200 bg-white/95 px-3 py-3 shadow-lg backdrop-blur-sm"
        style={{ left: "calc(var(--ap-nav-w, 176px) + 12px)", top: 12 }}
      >
        <span className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {labs.length} Companies
        </span>
        {(Object.keys(CATEGORY_META) as LabKind[]).map((kind) => {
          const c = LIGHT_COLORS[kind];
          const active = activeCategories.has(kind);
          const count = categoryCounts[kind] ?? 0;
          return (
            <button
              key={kind}
              type="button"
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-all"
              style={{
                opacity: active ? 1 : 0.4,
                background: active ? c.bg : "transparent",
              }}
              onClick={() => toggleCategory(kind)}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: c.dot }}
              />
              <span className="min-w-[48px] text-[11px] font-semibold" style={{ color: c.text }}>
                {CATEGORY_META[kind].label}
              </span>
              <span className="text-[10px] tabular-nums text-slate-400">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sidebar toggle */}
      <button
        type="button"
        onClick={() => setSidebarOpen((p) => !p)}
        className="absolute z-[1001] flex h-8 w-5 items-center justify-center rounded-l-md border border-r-0 border-slate-200 bg-white text-slate-400 shadow-md transition-all hover:bg-slate-50 hover:text-slate-600"
        style={{ right: sidebarOpen ? 320 : 0, top: 16 }}
        aria-label={sidebarOpen ? "Close directory" : "Open directory"}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d={sidebarOpen ? "M6 1L2 5L6 9" : "M4 1L8 5L4 9"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Sidebar directory */}
      <div
        className="absolute right-0 top-0 z-[1000] flex h-full flex-col border-l border-slate-200 bg-white/98 backdrop-blur-sm transition-transform duration-200"
        style={{
          width: 320,
          transform: sidebarOpen ? "translateX(0)" : "translateX(100%)",
        }}
      >
        {/* Header */}
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">AI Companies</h2>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {filteredLabs.length} of {labs.length} companies
          </p>
        </div>

        {/* Search */}
        <div className="border-b border-slate-100 px-4 py-2.5">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or city…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-300 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-200"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filteredLabs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
              <p className="mt-2 text-xs text-slate-400">No companies match</p>
            </div>
          )}
          {(Object.keys(CATEGORY_META) as LabKind[]).map((kind) => {
            const group = groupedLabs[kind];
            if (group.length === 0) return null;
            const c = LIGHT_COLORS[kind];
            return (
              <div key={kind}>
                <div
                  className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-100 bg-white/95 px-4 py-2 backdrop-blur-sm"
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.dot }} />
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: c.text }}>
                    {CATEGORY_META[kind].label}
                  </span>
                  <span className="text-[10px] text-slate-300">{group.length}</span>
                </div>
                {group.map((lab) => {
                  const isActive = selectedId === lab.id;
                  return (
                    <button
                      key={lab.id}
                      type="button"
                      onClick={() => selectAndFlyTo(lab)}
                      className="flex w-full items-start gap-3 border-b border-slate-50 px-4 py-2.5 text-left transition-colors hover:bg-slate-50"
                      style={isActive ? { background: c.bg } : undefined}
                    >
                      <span
                        className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: c.dot }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[12px] font-semibold text-slate-800">
                            {lab.displayName}
                          </span>
                          {lab.total > 0 && (
                            <span className="flex-shrink-0 text-[10px] font-medium tabular-nums text-slate-400">
                              {lab.total.toLocaleString()}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {lab.city}, {lab.country}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail card */}
      {selectedLab && (
        <LabDetailCard
          lab={selectedLab}
          onClose={() => setSelectedId(null)}
          sidebarOpen={sidebarOpen}
        />
      )}

      {/* Tooltip + cluster override styles */}
      <style jsx global>{`
        .ap-eco-tooltip-light {
          background: #fff !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 10px !important;
          padding: 8px 12px !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important;
          color: #334155 !important;
        }
        .ap-eco-tooltip-light .leaflet-tooltip-arrow {
          display: none;
        }
        .leaflet-container {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .marker-cluster-small,
        .marker-cluster-medium,
        .marker-cluster-large {
          background: transparent !important;
        }
        .marker-cluster-small div,
        .marker-cluster-medium div,
        .marker-cluster-large div {
          background: transparent !important;
        }
      `}</style>
    </div>
  );
}

function LabDetailCard({
  lab,
  onClose,
  sidebarOpen,
}: {
  lab: LabActivity;
  onClose: () => void;
  sidebarOpen: boolean;
}) {
  const c = LIGHT_COLORS[lab.kind];

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
      className="absolute bottom-4 z-[1001] w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
      style={{ right: sidebarOpen ? 336 : 16 }}
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <a
            href={lab.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-bold text-slate-800 hover:text-slate-600"
          >
            {lab.displayName} <span className="text-slate-300">↗</span>
          </a>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="inline-block rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
              style={{ backgroundColor: c.bg, color: c.text }}
            >
              {CATEGORY_META[lab.kind].label}
            </span>
            <span className="text-[11px] text-slate-400">
              {lab.city}, {lab.country}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
          aria-label="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2l8 8M10 2l-8 8"/>
          </svg>
        </button>
      </div>

      <div className="mb-3 flex items-baseline gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
        <span className="text-xl font-bold text-slate-800">
          {lab.total.toLocaleString()}
        </span>
        <span className="text-[10px] uppercase text-slate-400">
          events · 7d
        </span>
        {lab.stale && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-600">
            stale
          </span>
        )}
      </div>

      {lab.repos.length > 0 && (
        <div className="mb-3 space-y-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-300">
            Tracked repos
          </span>
          {lab.repos.map((r) => (
            <div
              key={`${r.owner}/${r.repo}`}
              className="flex items-center justify-between"
            >
              <a
                href={r.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-medium text-slate-500 hover:text-slate-800"
              >
                {r.owner}/{r.repo}
              </a>
              <span className="text-[10px] tabular-nums text-slate-300">
                {r.total}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-slate-100 pt-2">
        <a
          href={lab.hqSourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9px] font-medium uppercase tracking-wide text-slate-300 transition-colors hover:text-slate-500"
        >
          HQ source ↗
        </a>
      </div>
    </div>
  );
}
