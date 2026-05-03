/**
 * runGlobeEventsSnapshot — orchestrator that filters the 48h LRANGE
 * to yesterday's UTC window, aggregates, and writes the snapshot.
 *
 * Verifies:
 *   - the date key is yesterday's UTC date (not today)
 *   - the window cutoff is exactly [yesterday 00:00, today 00:00) UTC
 *   - ok:false + no write when zero events fall in the window
 *   - ok:true triggers a write with the aggregated shape
 */

import { describe, it, expect, vi } from "vitest";
import { runGlobeEventsSnapshot } from "@/app/api/ingest/globe-events-snapshot/route";
import type {
  RegionalSnapshot,
  StoredGlobePoint,
} from "@/lib/data/globe-store";

// Wall-clock pinned to 2026-05-04 00:05 UTC — the cron's actual fire time.
const NOW = new Date("2026-05-04T00:05:00Z");

const SF: [number, number] = [37.7749, -122.4194];
const LDN: [number, number] = [51.5074, -0.1278];

function pt(
  coords: [number, number],
  country: string | null,
  iso: string,
  id: string,
): StoredGlobePoint {
  return {
    lat: coords[0],
    lng: coords[1],
    color: "#fff",
    size: 0.5,
    eventAt: iso,
    eventId: id,
    sourceKind: "events-api",
    meta: { country, eventId: id },
  } as StoredGlobePoint;
}

describe("runGlobeEventsSnapshot", () => {
  it("writes a snapshot keyed by yesterday's UTC date", async () => {
    const writeSnapshot = vi.fn(async (_: RegionalSnapshot) => {});
    const result = await runGlobeEventsSnapshot({
      readRecentEvents: async () => [
        pt(SF, "United States", "2026-05-03T15:00:00Z", "1"),
        pt(LDN, "United Kingdom", "2026-05-03T16:00:00Z", "2"),
      ],
      writeSnapshot,
      now: () => NOW,
    });
    expect(result.ok).toBe(true);
    expect(result.date).toBe("2026-05-03");
    expect(result.totalEvents).toBe(2);
    expect(writeSnapshot).toHaveBeenCalledTimes(1);
    const written = writeSnapshot.mock.calls[0][0];
    expect(written.date).toBe("2026-05-03");
    expect(written.byCountry).toEqual({
      "United States": 1,
      "United Kingdom": 1,
    });
  });

  it("filters out events from today and the day before yesterday", async () => {
    const writeSnapshot = vi.fn(async (_: RegionalSnapshot) => {});
    const result = await runGlobeEventsSnapshot({
      readRecentEvents: async () => [
        // today (00:01 UTC) — should be excluded
        pt(SF, "United States", "2026-05-04T00:01:00Z", "today"),
        // exact start of yesterday — should be included
        pt(SF, "United States", "2026-05-03T00:00:00Z", "yesterday-start"),
        // day before yesterday — should be excluded
        pt(SF, "United States", "2026-05-02T23:59:00Z", "older"),
      ],
      writeSnapshot,
      now: () => NOW,
    });
    expect(result.totalEvents).toBe(1);
    const written = writeSnapshot.mock.calls[0][0];
    expect(written.totalEvents).toBe(1);
  });

  it("ok:false when zero events landed in yesterday's window — no write", async () => {
    const writeSnapshot = vi.fn(async (_: RegionalSnapshot) => {});
    const result = await runGlobeEventsSnapshot({
      readRecentEvents: async () => [
        pt(SF, "United States", "2026-05-04T00:01:00Z", "today-only"),
      ],
      writeSnapshot,
      now: () => NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.totalEvents).toBe(0);
    expect(writeSnapshot).not.toHaveBeenCalled();
  });

  it("counts unattributed events (null country) honestly", async () => {
    const writeSnapshot = vi.fn(async (_: RegionalSnapshot) => {});
    await runGlobeEventsSnapshot({
      readRecentEvents: async () => [
        pt(SF, "United States", "2026-05-03T12:00:00Z", "1"),
        pt([0, 0], null, "2026-05-03T13:00:00Z", "2"),
      ],
      writeSnapshot,
      now: () => NOW,
    });
    const written = writeSnapshot.mock.calls[0][0];
    expect(written.totalEvents).toBe(2);
    expect(written.unattributedEvents).toBe(1);
    expect(written.byCountry).toEqual({ "United States": 1 });
  });
});
