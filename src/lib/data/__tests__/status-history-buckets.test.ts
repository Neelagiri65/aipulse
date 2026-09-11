/**
 * bucketToDays — "unknown" must not be a peer of "operational".
 *
 * A bucket is INITIALISED to "unknown" and both loops promote from there. While unknown and
 * operational shared rank 0, the strict `>` in the sample loop meant an operational sample could
 * never beat the initialiser: a day polled 288 times, every sample healthy, still reported
 * `worstStatus: "unknown"`. The strip only drew it green through dayTone's trailing fallback,
 * which made a genuinely unreadable day indistinguishable from a healthy one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bucketToDays } from "@/lib/data/status-history";
import type { HistoricalIncident, StatusSample } from "@/lib/data/status-history";

// Fixed mid-day UTC so "3 hours ago" can never fall into yesterday's bucket.
const NOW = new Date("2026-09-10T12:00:00.000Z");
const TODAY = "2026-09-10";

const sample = (status: StatusSample["status"], hoursAgo = 1): StatusSample => ({
  ts: new Date(NOW.getTime() - hoursAgo * 3600_000).toISOString(),
  status,
  activeIncidents: 0,
});

const today = (incidents: HistoricalIncident[], samples: StatusSample[]) => {
  const buckets = bucketToDays(incidents, samples, 7);
  const b = buckets.find((x) => x.date === TODAY);
  if (!b) throw new Error(`no bucket for ${TODAY}`);
  return b;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("bucketToDays — a healthy day reports as healthy", () => {
  it("a day of nothing but operational samples is 'operational', not 'unknown'", () => {
    const b = today([], [sample("operational", 1), sample("operational", 2), sample("operational", 3)]);
    expect(b.sampleCount).toBe(3);
    expect(b.worstStatus).toBe("operational");
  });

  it("one unreadable sample among healthy ones does not erase the day's measurement", () => {
    const b = today([], [sample("unknown", 1), sample("operational", 2)]);
    expect(b.sampleCount).toBe(2);
    expect(b.worstStatus).toBe("operational");
  });

  it("a day whose every sample was unreadable stays 'unknown' WITH samples", () => {
    const b = today([], [sample("unknown", 1), sample("unknown", 2)]);
    expect(b.sampleCount).toBe(2);
    expect(b.worstStatus).toBe("unknown");
  });

  it("a day with no samples at all stays 'unknown'", () => {
    const b = today([], []);
    expect(b.sampleCount).toBe(0);
    expect(b.worstStatus).toBe("unknown");
  });
});

describe("bucketToDays — promoting unknown must not demote a real fault", () => {
  it("a degraded sample still beats operational ones regardless of order", () => {
    expect(today([], [sample("degraded", 1), sample("operational", 2)]).worstStatus).toBe("degraded");
    expect(today([], [sample("operational", 1), sample("degraded", 2)]).worstStatus).toBe("degraded");
  });

  it("a major outage sample is still the worst", () => {
    const b = today([], [sample("operational", 1), sample("major_outage", 2), sample("degraded", 3)]);
    expect(b.worstStatus).toBe("major_outage");
  });

  it("an incident of impact 'none' leaves an unsampled day unknown (impactToStatus('none') === 'unknown')", () => {
    const inc: HistoricalIncident = {
      id: "i1",
      name: "informational",
      status: "resolved",
      impact: "none",
      createdAt: new Date(NOW.getTime() - 2 * 3600_000).toISOString(),
    };
    const b = today([inc], []);
    expect(b.incidents).toHaveLength(1);
    expect(b.worstImpact).toBe("none");
    expect(b.worstStatus).toBe("unknown");
  });

  it("an incident of impact 'none' does not override a day's real samples", () => {
    const inc: HistoricalIncident = {
      id: "i1",
      name: "informational",
      status: "resolved",
      impact: "none",
      createdAt: new Date(NOW.getTime() - 2 * 3600_000).toISOString(),
    };
    expect(today([inc], [sample("operational", 1)]).worstStatus).toBe("operational");
    expect(today([inc], [sample("degraded", 1)]).worstStatus).toBe("degraded");
  });

  it("an incident's impact still outranks a healthy sample", () => {
    const inc: HistoricalIncident = {
      id: "i2",
      name: "outage",
      status: "resolved",
      impact: "critical",
      createdAt: new Date(NOW.getTime() - 2 * 3600_000).toISOString(),
    };
    const b = today([inc], [sample("operational", 1)]);
    expect(b.worstStatus).toBe("major_outage");
    expect(b.worstImpact).toBe("critical");
  });
});
