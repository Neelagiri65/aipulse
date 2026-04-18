"use client";

import { Globe, type GlobePoint } from "@/components/globe/Globe";
import { HealthCardGrid } from "@/components/health/HealthCardGrid";
import { LiveFeed } from "@/components/dashboard/LiveFeed";
import { usePolledEndpoint } from "@/lib/hooks/use-polled-endpoint";
import type { GlobeEventsResult } from "@/lib/data/fetch-events";
import type { StatusResult } from "@/lib/data/fetch-status";

const STATUS_POLL_MS = 5 * 60 * 1000;
const EVENTS_POLL_MS = 30 * 1000;

export function Dashboard() {
  const status = usePolledEndpoint<StatusResult>("/api/status", STATUS_POLL_MS);
  const events = usePolledEndpoint<GlobeEventsResult>(
    "/api/globe-events",
    EVENTS_POLL_MS,
  );

  const points: GlobePoint[] = events.data?.points ?? [];
  const lastUpdatedAt = events.data?.polledAt;

  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-4 px-4 py-4 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
      <LiveFeed
        events={events.data}
        error={events.error}
        isInitialLoading={events.isInitialLoading}
      />

      <section className="relative h-[min(80vh,900px)] min-h-[520px] overflow-hidden rounded-lg border border-border/60 bg-gradient-to-b from-black/60 to-zinc-950/60">
        <Globe points={points} lastUpdatedAt={lastUpdatedAt} />
        <CoverageBadge events={events.data} />
      </section>

      <aside className="space-y-4">
        <div>
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Tool health
          </h2>
          <HealthCardGrid data={status.data?.data} />
          {status.error && (
            <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-amber-400/80">
              Status poll error: {status.error}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

function CoverageBadge({ events }: { events?: GlobeEventsResult }) {
  if (!events) return null;
  const { coverage } = events;
  if (coverage.eventsReceived === 0) return null;
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 rounded-md border border-border/40 bg-background/70 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
      <span className="text-foreground/80">
        {coverage.eventsWithLocation}/{coverage.eventsReceived}
      </span>{" "}
      events placeable · {coverage.locationCoveragePct}% coverage
    </div>
  );
}
