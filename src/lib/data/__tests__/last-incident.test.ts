/**
 * pickLastIncident + formatIncidentDuration + formatIncidentImpact —
 * pure helpers for the Tool Health card's "Last incident" recap line.
 */

import { describe, it, expect } from "vitest";
import {
  pickLastIncident,
  formatIncidentDuration,
  formatIncidentImpact,
} from "@/lib/data/last-incident";
import type { DayBucket, HistoricalIncident } from "@/lib/data/status-history";

function bucket(
  date: string,
  ...incidents: HistoricalIncident[]
): DayBucket {
  return {
    date,
    worstStatus: "operational",
    worstImpact: "none",
    incidents,
    sampleCount: 0,
  };
}

function inc(
  overrides: Partial<HistoricalIncident> & { id: string; createdAt: string },
): HistoricalIncident {
  return {
    id: overrides.id,
    name: overrides.name ?? "Test incident",
    status: overrides.status ?? "resolved",
    impact: overrides.impact ?? "minor",
    createdAt: overrides.createdAt,
    resolvedAt: overrides.resolvedAt,
  };
}

describe("pickLastIncident", () => {
  it("returns none when history is undefined", () => {
    expect(pickLastIncident(undefined)).toEqual({ kind: "none" });
  });

  it("returns none when history is empty", () => {
    expect(pickLastIncident([])).toEqual({ kind: "none" });
  });

  it("returns none when history has buckets but no incidents", () => {
    expect(
      pickLastIncident([
        bucket("2026-04-30"),
        bucket("2026-05-01"),
      ]),
    ).toEqual({ kind: "none" });
  });

  it("picks the most recent incident across multiple bucket days", () => {
    const history: DayBucket[] = [
      bucket(
        "2026-04-30",
        inc({
          id: "old",
          createdAt: "2026-04-30T10:00:00Z",
          resolvedAt: "2026-04-30T10:30:00Z",
          impact: "minor",
        }),
      ),
      bucket(
        "2026-05-02",
        inc({
          id: "newer",
          createdAt: "2026-05-02T14:00:00Z",
          resolvedAt: "2026-05-02T14:12:00Z",
          impact: "major",
        }),
      ),
    ];
    const result = pickLastIncident(history);
    expect(result.kind).toBe("incident");
    if (result.kind === "incident") {
      expect(result.createdAt).toBe("2026-05-02T14:00:00Z");
      expect(result.durationMinutes).toBe(12);
      expect(result.impact).toBe("major");
    }
  });

  it("dedupes incidents that overlap two adjacent buckets (same id)", () => {
    const sameIncident = inc({
      id: "spans-midnight",
      createdAt: "2026-05-01T23:30:00Z",
      resolvedAt: "2026-05-02T00:30:00Z",
      impact: "minor",
    });
    const result = pickLastIncident([
      bucket("2026-05-01", sameIncident),
      bucket("2026-05-02", sameIncident),
    ]);
    expect(result.kind).toBe("incident");
    if (result.kind === "incident") {
      expect(result.createdAt).toBe("2026-05-01T23:30:00Z");
      expect(result.durationMinutes).toBe(60);
    }
  });

  it("durationMinutes is null for ongoing incidents (no resolvedAt)", () => {
    const result = pickLastIncident([
      bucket(
        "2026-05-02",
        inc({
          id: "ongoing",
          createdAt: "2026-05-02T14:00:00Z",
          status: "investigating",
          impact: "major",
        }),
      ),
    ]);
    expect(result.kind).toBe("incident");
    if (result.kind === "incident") {
      expect(result.durationMinutes).toBeNull();
      expect(result.resolvedAt).toBeNull();
      expect(result.status).toBe("investigating");
    }
  });

  it("rounds durationMinutes to nearest minute", () => {
    const result = pickLastIncident([
      bucket(
        "2026-05-02",
        inc({
          id: "x",
          createdAt: "2026-05-02T14:00:00Z",
          resolvedAt: "2026-05-02T14:00:45Z", // 45 seconds = 0.75 min → 1
        }),
      ),
    ]);
    if (result.kind === "incident") expect(result.durationMinutes).toBe(1);
  });
});

describe("formatIncidentDuration", () => {
  it("'ongoing' for null", () => {
    expect(formatIncidentDuration(null)).toBe("ongoing");
  });

  it("'<1 min' for sub-minute durations", () => {
    expect(formatIncidentDuration(0)).toBe("<1 min");
  });

  it("'12 min' for sub-hour", () => {
    expect(formatIncidentDuration(12)).toBe("12 min");
    expect(formatIncidentDuration(59)).toBe("59 min");
  });

  it("'2h' for whole-hour", () => {
    expect(formatIncidentDuration(120)).toBe("2h");
  });

  it("'2h 15m' for hour + remainder", () => {
    expect(formatIncidentDuration(135)).toBe("2h 15m");
  });

  it("'1d 4h' for multi-day", () => {
    expect(formatIncidentDuration(28 * 60)).toBe("1d 4h");
  });

  it("'1d' for whole-day", () => {
    expect(formatIncidentDuration(24 * 60)).toBe("1d");
  });
});

describe("formatIncidentImpact", () => {
  it("maps Statuspage severities to user-facing labels", () => {
    expect(formatIncidentImpact("critical")).toBe("major outage");
    expect(formatIncidentImpact("major")).toBe("partial outage");
    expect(formatIncidentImpact("minor")).toBe("degraded");
    expect(formatIncidentImpact("none")).toBe("no impact");
  });
});
