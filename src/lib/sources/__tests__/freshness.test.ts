import { describe, expect, it } from "vitest";

import type { CronHealthRecord } from "@/lib/data/cron-health";
import {
  formatRelative,
  indexCronRecords,
  resolveFreshness,
} from "@/lib/sources/freshness";
import type { InventoryEntry } from "@/lib/sources/inventory";

const NOW = Date.parse("2026-04-29T12:00:00.000Z");

function cronRecord(
  workflow: CronHealthRecord["workflow"],
  lastSuccessAt: string | null,
  expectedIntervalMinutes = 60,
): CronHealthRecord {
  return {
    workflow,
    lastSuccessAt,
    lastFailureAt: null,
    lastError: null,
    itemsProcessed: 0,
    errorCount: 0,
    expectedIntervalMinutes,
    updatedAt: lastSuccessAt ?? new Date(NOW).toISOString(),
  };
}

const baseEntry: Omit<InventoryEntry, "id" | "freshness"> = {
  category: "code-activity",
  name: "Test source",
  tracks: "...",
  url: "https://example.com",
  updateFrequency: "hourly",
};

describe("resolveFreshness", () => {
  it("marks cron sources live when lastSuccess is within 2× the expected interval", () => {
    const record = cronRecord(
      "globe-ingest",
      new Date(NOW - 30 * 60 * 1000).toISOString(), // 30 min ago
      30, // stale after 60 min
    );
    const result = resolveFreshness(
      {
        ...baseEntry,
        id: "gh-events",
        freshness: { kind: "cron", workflow: "globe-ingest" },
      },
      {
        cronByWorkflow: indexCronRecords([record]),
        lastKnown: () => null,
        nowMs: NOW,
      },
    );
    expect(result.tone).toBe("live");
    expect(result.lastSeenAt).toBe(record.lastSuccessAt);
  });

  it("marks cron sources stale beyond 2× the expected interval", () => {
    const record = cronRecord(
      "globe-ingest",
      new Date(NOW - 4 * 60 * 60 * 1000).toISOString(), // 4 h ago
      30, // stale after 60 min
    );
    const result = resolveFreshness(
      {
        ...baseEntry,
        id: "gh-events",
        freshness: { kind: "cron", workflow: "globe-ingest" },
      },
      {
        cronByWorkflow: indexCronRecords([record]),
        lastKnown: () => null,
        nowMs: NOW,
      },
    );
    expect(result.tone).toBe("stale");
  });

  it("returns unknown for cron sources with no record on file", () => {
    const result = resolveFreshness(
      {
        ...baseEntry,
        id: "gh-events",
        freshness: { kind: "cron", workflow: "globe-ingest" },
      },
      {
        cronByWorkflow: new Map(),
        lastKnown: () => null,
        nowMs: NOW,
      },
    );
    expect(result.tone).toBe("unknown");
    expect(result.lastSeenAt).toBeNull();
  });

  it("uses the last-known cache write timestamp for live-HTTP sources", () => {
    const savedAt = new Date(NOW - 5 * 60 * 1000).toISOString();
    const result = resolveFreshness(
      {
        ...baseEntry,
        id: "anthropic-status",
        category: "tool-status",
        freshness: { kind: "last-known", key: "status" },
      },
      {
        cronByWorkflow: new Map(),
        lastKnown: (k) => (k === "status" ? savedAt : null),
        nowMs: NOW,
      },
    );
    expect(result.tone).toBe("live");
    expect(result.lastSeenAt).toBe(savedAt);
  });

  it("marks last-known stale when older than the live window", () => {
    const savedAt = new Date(NOW - 6 * 60 * 60 * 1000).toISOString(); // 6h
    const result = resolveFreshness(
      {
        ...baseEntry,
        id: "arxiv-papers",
        category: "research",
        freshness: { kind: "last-known", key: "research" },
      },
      {
        cronByWorkflow: new Map(),
        lastKnown: (k) => (k === "research" ? savedAt : null),
        nowMs: NOW,
        lastKnownLiveWindowMs: 30 * 60 * 1000,
      },
    );
    expect(result.tone).toBe("stale");
    expect(result.lastSeenAt).toBe(savedAt);
  });

  it("returns on-demand with a hint for routes without a backing cron", () => {
    const result = resolveFreshness(
      {
        ...baseEntry,
        id: "hf-models",
        category: "models",
        freshness: { kind: "on-demand" },
      },
      {
        cronByWorkflow: new Map(),
        lastKnown: () => null,
        nowMs: NOW,
      },
    );
    expect(result.tone).toBe("on-demand");
    expect(result.lastSeenAt).toBeNull();
    expect(result.note).toMatch(/per request/i);
  });

  it("returns static tone with the published date for annual reference sources", () => {
    const result = resolveFreshness(
      {
        ...baseEntry,
        id: "stanford-ai-index",
        category: "research",
        freshness: { kind: "static", publishedAt: "2026-04-21" },
      },
      {
        cronByWorkflow: new Map(),
        lastKnown: () => null,
        nowMs: NOW,
      },
    );
    expect(result.tone).toBe("static");
    expect(result.lastSeenAt).toBe("2026-04-21");
    expect(result.note).toMatch(/static reference/i);
  });
});

describe("formatRelative", () => {
  it("renders seconds, minutes, hours, days, then date", () => {
    const t = (offsetMs: number) =>
      formatRelative(new Date(NOW - offsetMs).toISOString(), NOW);
    expect(t(10 * 1000)).toBe("10s ago");
    expect(t(5 * 60 * 1000)).toBe("5m ago");
    expect(t(3 * 60 * 60 * 1000)).toBe("3h ago");
    expect(t(3 * 24 * 60 * 60 * 1000)).toBe("3d ago");
    expect(formatRelative(null, NOW)).toBe("—");
  });

  it("handles negative drift as 'Just now' rather than negative seconds", () => {
    const future = new Date(NOW + 10 * 1000).toISOString();
    expect(formatRelative(future, NOW)).toBe("Just now");
  });
});
