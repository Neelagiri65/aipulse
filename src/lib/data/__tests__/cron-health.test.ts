import { describe, expect, it } from "vitest";
import {
  CRON_WORKFLOWS,
  isCronStale,
  isEventTriggered,
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
      lastSuccessAt: "2026-04-21T11:30:00Z", // 30 min ago, interval 60 min
    });
    expect(isCronStale(record, now)).toBe(false);
  });

  it("treats a success within 2× interval as fresh (tolerates one missed tick)", () => {
    const now = Date.parse("2026-04-21T12:00:00Z");
    const record = mkRecord("wire-ingest-hn", {
      lastSuccessAt: "2026-04-21T08:01:00Z", // 239 min ago, 2× interval = 240 min
    });
    expect(isCronStale(record, now)).toBe(false);
  });

  it("flags a success older than 2× interval as stale", () => {
    const now = Date.parse("2026-04-21T12:00:00Z");
    const record = mkRecord("wire-ingest-hn", {
      lastSuccessAt: "2026-04-21T07:59:00Z", // 241 min ago, 2× interval = 240 min
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

  describe("event-triggered workflows (push-send)", () => {
    // Reconstructed S89→S93 incident: push-send sat "STALE" on the
    // status bar for days while its work was actually happening —
    // elapsed time since the last tool-status transition says nothing
    // about health.
    it("never flags an event-triggered workflow as interval-stale — even never-run", () => {
      expect(isCronStale(mkRecord("push-send"), Date.now())).toBe(false);
    });

    it("not stale days after its last success (quiet statuses = zero pushes, correctly)", () => {
      const now = Date.parse("2026-07-05T12:00:00Z");
      const record = mkRecord("push-send", {
        lastSuccessAt: "2026-07-01T03:40:00Z", // 4+ days ago
      });
      expect(isCronStale(record, now)).toBe(false);
    });

    it("isEventTriggered: true only for push-send; interval crons unaffected", () => {
      expect(isEventTriggered("push-send")).toBe(true);
      expect(isEventTriggered("wire-ingest-rss")).toBe(false);
      expect(isEventTriggered("notify-tool-alerts")).toBe(false);
      // Interval semantics unchanged for everything else:
      expect(isCronStale(mkRecord("wire-ingest-hn"), Date.now())).toBe(true);
    });
  });
});

describe("CRON_WORKFLOWS registry", () => {
  it("matches the expected cadences of the monitored workflows", () => {
    expect(CRON_WORKFLOWS["globe-ingest"].expectedIntervalMinutes).toBe(90);
    expect(CRON_WORKFLOWS["wire-ingest-hn"].expectedIntervalMinutes).toBe(120);
    expect(CRON_WORKFLOWS["wire-ingest-rss"].expectedIntervalMinutes).toBe(30);
    expect(
      CRON_WORKFLOWS["registry-backfill-events"].expectedIntervalMinutes,
    ).toBe(150);
    expect(
      CRON_WORKFLOWS["registry-discover-topics"].expectedIntervalMinutes,
    ).toBe(240);
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
    expect(CRON_WORKFLOWS["pkg-pypi"].expectedIntervalMinutes).toBe(360);
    expect(CRON_WORKFLOWS["pkg-npm"].expectedIntervalMinutes).toBe(360);
    expect(CRON_WORKFLOWS["pkg-crates"].expectedIntervalMinutes).toBe(360);
    expect(CRON_WORKFLOWS["pkg-docker"].expectedIntervalMinutes).toBe(360);
    expect(CRON_WORKFLOWS["pkg-brew"].expectedIntervalMinutes).toBe(360);
    expect(CRON_WORKFLOWS["pkg-vscode"].expectedIntervalMinutes).toBe(360);
  });

  it("has all documented workflows — nothing silently dropped", () => {
    const keys = Object.keys(CRON_WORKFLOWS).sort();
    expect(keys).toEqual([
      "agents-ingest",
      "benchmarks-ingest",
      "containment-cycle",
      "daily-digest",
      "daily-snapshot",
      "globe-events-snapshot",
      "globe-ingest",
      "labs-cron",
      "notify-tool-alerts",
      "openrouter-rankings",
      "pkg-brew",
      "pkg-crates",
      "pkg-docker",
      "pkg-npm",
      "pkg-pypi",
      "pkg-vscode",
      "push-send",
      "registry-backfill-events",
      "registry-discover",
      "registry-discover-deps",
      "registry-discover-topics",
      "wire-ingest-hn",
      "wire-ingest-reddit",
      "wire-ingest-rss",
    ]);
  });
});
