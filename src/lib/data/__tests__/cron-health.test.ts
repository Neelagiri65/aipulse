import { describe, expect, it } from "vitest";
import {
  CRON_WORKFLOWS,
  isCronStale,
  type CronHealthRecord,
  type CronWorkflowName,
} from "@/lib/data/cron-health";

function mkRecord(
  workflow: CronWorkflowName,
  overrides: Partial<CronHealthRecord> = {},
): CronHealthRecord {
  return {
    workflow,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    itemsProcessed: 0,
    errorCount: 0,
    expectedIntervalMinutes: CRON_WORKFLOWS[workflow].expectedIntervalMinutes,
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe("isCronStale", () => {
  it("flags a record with no lastSuccessAt as stale (never ran)", () => {
    const record = mkRecord("wire-ingest-hn");
    expect(isCronStale(record, Date.now())).toBe(true);
  });

  it("treats a success within 1× interval as fresh", () => {
    const now = Date.parse("2026-04-21T12:00:00Z");
    const record = mkRecord("wire-ingest-hn", {
      lastSuccessAt: "2026-04-21T11:50:00Z", // 10 min ago, interval 15 min
    });
    expect(isCronStale(record, now)).toBe(false);
  });

  it("treats a success within 2× interval as fresh (tolerates one missed tick)", () => {
    const now = Date.parse("2026-04-21T12:00:00Z");
    const record = mkRecord("wire-ingest-hn", {
      lastSuccessAt: "2026-04-21T11:31:00Z", // 29 min ago, 2× interval = 30 min
    });
    expect(isCronStale(record, now)).toBe(false);
  });

  it("flags a success older than 2× interval as stale", () => {
    const now = Date.parse("2026-04-21T12:00:00Z");
    const record = mkRecord("wire-ingest-hn", {
      lastSuccessAt: "2026-04-21T11:29:00Z", // 31 min ago, 2× interval = 30 min
    });
    expect(isCronStale(record, now)).toBe(true);
  });

  it("flags a malformed lastSuccessAt as stale", () => {
    const record = mkRecord("wire-ingest-hn", {
      lastSuccessAt: "not-a-date",
    });
    expect(isCronStale(record, Date.now())).toBe(true);
  });

  it("uses the record's own expectedIntervalMinutes (not a global)", () => {
    // wire-ingest-rss has 30 min interval, so stale at 60 min.
    const now = Date.parse("2026-04-21T12:00:00Z");
    const freshAt40 = mkRecord("wire-ingest-rss", {
      lastSuccessAt: "2026-04-21T11:20:00Z", // 40 min ago
    });
    const staleAt70 = mkRecord("wire-ingest-rss", {
      lastSuccessAt: "2026-04-21T10:50:00Z", // 70 min ago
    });
    expect(isCronStale(freshAt40, now)).toBe(false);
    expect(isCronStale(staleAt70, now)).toBe(true);
  });
});

describe("CRON_WORKFLOWS registry", () => {
  it("matches the expected cadences of the monitored workflows", () => {
    expect(CRON_WORKFLOWS["globe-ingest"].expectedIntervalMinutes).toBe(5);
    expect(CRON_WORKFLOWS["wire-ingest-hn"].expectedIntervalMinutes).toBe(15);
    expect(CRON_WORKFLOWS["wire-ingest-rss"].expectedIntervalMinutes).toBe(30);
    expect(
      CRON_WORKFLOWS["registry-backfill-events"].expectedIntervalMinutes,
    ).toBe(60);
    expect(
      CRON_WORKFLOWS["registry-discover-topics"].expectedIntervalMinutes,
    ).toBe(120);
    expect(CRON_WORKFLOWS["registry-discover"].expectedIntervalMinutes).toBe(
      360,
    );
    expect(
      CRON_WORKFLOWS["registry-discover-deps"].expectedIntervalMinutes,
    ).toBe(360);
    expect(CRON_WORKFLOWS["labs-cron"].expectedIntervalMinutes).toBe(360);
    expect(CRON_WORKFLOWS["benchmarks-ingest"].expectedIntervalMinutes).toBe(
      1440,
    );
    expect(CRON_WORKFLOWS["daily-snapshot"].expectedIntervalMinutes).toBe(
      1440,
    );
  });

  it("has all documented workflows — nothing silently dropped", () => {
    const keys = Object.keys(CRON_WORKFLOWS).sort();
    expect(keys).toEqual([
      "benchmarks-ingest",
      "daily-snapshot",
      "globe-ingest",
      "labs-cron",
      "registry-backfill-events",
      "registry-discover",
      "registry-discover-deps",
      "registry-discover-topics",
      "wire-ingest-hn",
      "wire-ingest-rss",
    ]);
  });
});
