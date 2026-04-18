"use client";

import { useEffect, useState } from "react";
import { Globe, type GlobePoint } from "@/components/globe/Globe";
import { HealthCardGrid } from "@/components/health/HealthCardGrid";
import { LiveFeed } from "@/components/dashboard/LiveFeed";
import { MetricTicker } from "@/components/dashboard/MetricTicker";
import { TopBar } from "@/components/chrome/TopBar";
import { Win } from "@/components/chrome/Win";
import { LeftNav, type NavItem } from "@/components/chrome/LeftNav";
import { usePolledEndpoint } from "@/lib/hooks/use-polled-endpoint";
import { PENDING_SOURCES, VERIFIED_SOURCES } from "@/lib/data-sources";
import type { GlobeEventsResult } from "@/lib/data/fetch-events";
import type { StatusResult } from "@/lib/data/fetch-status";

const STATUS_POLL_MS = 5 * 60 * 1000;
const EVENTS_POLL_MS = 30 * 1000;

type PanelId = "wire" | "tools";

export function Dashboard() {
  const status = usePolledEndpoint<StatusResult>("/api/status", STATUS_POLL_MS);
  const events = usePolledEndpoint<GlobeEventsResult>(
    "/api/globe-events",
    EVENTS_POLL_MS,
  );

  const points: GlobePoint[] = events.data?.points ?? [];
  const lastUpdatedAt = events.data?.polledAt;

  // Floating panel layout state
  const [panels, setPanels] = useState<Record<PanelId, { open: boolean; min: boolean }>>(
    { wire: { open: true, min: false }, tools: { open: true, min: false } },
  );
  const [zorder, setZorder] = useState<PanelId[]>(["wire", "tools"]);
  const [maxId, setMaxId] = useState<PanelId | null>(null);

  // Initial panel positions — set after mount (window-relative)
  const [initialPos, setInitialPos] = useState<{
    wire: { x: number; y: number; w: number; h: number };
    tools: { x: number; y: number; w: number; h: number };
  } | null>(null);
  useEffect(() => {
    const W = typeof window !== "undefined" ? window.innerWidth : 1440;
    setInitialPos({
      wire: { x: 24, y: 76, w: 360, h: 560 },
      tools: { x: Math.max(420, W - 400), y: 76, w: 376, h: 560 },
    });
  }, []);

  const navItems: NavItem[] = [
    {
      id: "wire",
      label: "Live feed",
      icon: "wire",
      count: events.data?.coverage.windowSize ?? null,
      hot: (events.data?.coverage.windowSize ?? 0) > 0,
    },
    {
      id: "tools",
      label: "Tool health",
      icon: "tools",
      count: status.data ? Object.keys(status.data.data).length : null,
    },
    { id: "audit", label: "Audit", icon: "audit" },
  ];

  const focus = (id: PanelId) =>
    setZorder((z) => [...z.filter((x) => x !== id), id]);

  const toggle = (id: string) => {
    if (id === "audit") {
      window.location.href = "/audit";
      return;
    }
    if (id !== "wire" && id !== "tools") return;
    const pid = id as PanelId;
    setPanels((p) => {
      const cur = p[pid];
      const next = cur.open && !cur.min ? { open: false, min: false } : { open: true, min: false };
      return { ...p, [pid]: next };
    });
    focus(pid);
  };

  const openIds = new Set<string>(
    (Object.keys(panels) as PanelId[])
      .filter((id) => panels[id].open && !panels[id].min)
      .map(String),
  );

  const z = (id: PanelId) => 30 + zorder.indexOf(id);

  return (
    <>
      <TopBar
        status={status.data}
        freshness={{
          isInitialLoading: status.isInitialLoading,
          lastSuccessAt: status.lastSuccessAt,
          intervalMs: STATUS_POLL_MS,
          error: status.error,
        }}
      />

      {/* Full-bleed stage: globe behind, floating chrome on top */}
      <div className="relative min-h-[calc(100vh-100px)]">
        <div className="absolute inset-0 px-4 pt-4 pb-16">
          <section
            className="relative h-full w-full overflow-hidden rounded-lg border border-border/40"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.5), rgba(10,15,18,0.5))",
            }}
          >
            <Globe points={points} lastUpdatedAt={lastUpdatedAt} />
            <CoverageBadge events={events.data} />
          </section>
        </div>

        {/* Left nav — overlay bottom-left */}
        <div
          className="absolute z-20"
          style={{ left: 24, bottom: 80, width: 200 }}
        >
          <LeftNav items={navItems} openIds={openIds} onToggle={toggle} />
        </div>

        {/* Floating panels */}
        {initialPos && panels.wire.open && (
          <Win
            id="wire"
            title="● Live feed · gh-events"
            initial={initialPos.wire}
            zIndex={z("wire")}
            minimized={panels.wire.min}
            maximized={maxId === "wire"}
            onFocus={() => focus("wire")}
            onClose={() =>
              setPanels((p) => ({ ...p, wire: { open: false, min: false } }))
            }
            onMinimize={() =>
              setPanels((p) => ({ ...p, wire: { ...p.wire, min: !p.wire.min } }))
            }
            onMaximize={() => setMaxId((m) => (m === "wire" ? null : "wire"))}
          >
            <LiveFeed
              events={events.data}
              error={events.error}
              isInitialLoading={events.isInitialLoading}
            />
          </Win>
        )}

        {initialPos && panels.tools.open && (
          <Win
            id="tools"
            title="● Tool health"
            initial={initialPos.tools}
            zIndex={z("tools")}
            minimized={panels.tools.min}
            maximized={maxId === "tools"}
            onFocus={() => focus("tools")}
            onClose={() =>
              setPanels((p) => ({ ...p, tools: { open: false, min: false } }))
            }
            onMinimize={() =>
              setPanels((p) => ({
                ...p,
                tools: { ...p.tools, min: !p.tools.min },
              }))
            }
            onMaximize={() => setMaxId((m) => (m === "tools" ? null : "tools"))}
          >
            <div className="p-3">
              <HealthCardGrid data={status.data?.data} />
              {status.error && (
                <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-amber-400/80">
                  Status poll error: {status.error}
                </p>
              )}
            </div>
          </Win>
        )}
      </div>

      <MetricTicker
        status={status.data}
        events={events.data}
        verifiedSourceCount={VERIFIED_SOURCES.length}
        pendingSourceCount={PENDING_SOURCES.length}
        statusLoading={status.isInitialLoading}
        eventsLoading={events.isInitialLoading}
      />
    </>
  );
}

function CoverageBadge({ events }: { events?: GlobeEventsResult }) {
  if (!events) return null;
  const { coverage } = events;
  if (coverage.windowSize === 0 && coverage.eventsReceived === 0) return null;
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 rounded-md border border-border/40 bg-background/70 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
      <span className="text-foreground/80">{coverage.windowSize}</span> events ·{" "}
      {coverage.windowMinutes}m window · {coverage.locationCoveragePct}% placeable
    </div>
  );
}
