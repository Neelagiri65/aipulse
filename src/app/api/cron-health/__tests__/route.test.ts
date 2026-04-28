/**
 * Wire-shape contract for the public `/api/cron-health` JSON.
 *
 * Public response is read by anyone on the internet — including the
 * StatusBar chip, but anyone can curl the URL. To avoid handing
 * attackers a recon channel, per-cron entries are trimmed to the four
 * fields the chip + a casual reader actually need:
 *
 *   workflow, stale, lastSuccessAt, itemsProcessed
 *
 * Internal-only fields (lastError, lastFailureAt, errorCount,
 * expectedIntervalMinutes, updatedAt) move to `/admin/cron-health`,
 * gated by the same Basic-Auth middleware as `/admin/digest/preview`.
 *
 * The top-level summary (total / healthy / stale / generatedAt) stays
 * unchanged because it's how the StatusBar renders the trust signal.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CronHealthRecord } from "@/lib/data/cron-health";

const RECORDS: CronHealthRecord[] = [
  {
    workflow: "globe-ingest",
    lastSuccessAt: "2026-04-28T05:00:00.000Z",
    lastFailureAt: null,
    lastError: null,
    itemsProcessed: 42,
    errorCount: 0,
    expectedIntervalMinutes: 30,
    updatedAt: "2026-04-28T05:00:00.000Z",
  },
  {
    workflow: "daily-digest",
    lastSuccessAt: "2026-04-27T10:07:00.000Z",
    lastFailureAt: "2026-04-25T08:42:06.000Z",
    lastError: "missing required env var: RESEND_API_KEY",
    itemsProcessed: 0,
    errorCount: 4,
    expectedIntervalMinutes: 1440,
    updatedAt: "2026-04-27T10:07:00.000Z",
  },
];

vi.mock("@/lib/data/cron-health", async (orig) => {
  const real = await orig<typeof import("@/lib/data/cron-health")>();
  return {
    ...real,
    readAllCronHealth: vi.fn(async () => RECORDS),
  };
});

describe("/api/cron-health (public)", () => {
  beforeEach(() => {
    vi.useFakeTimers().setSystemTime(new Date("2026-04-28T06:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns top-level summary unchanged", async () => {
    const { GET } = await import("@/app/api/cron-health/route");
    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.total).toBe(2);
    expect(body.healthy).toBeGreaterThanOrEqual(1);
    expect(typeof body.generatedAt).toBe("string");
    expect(Array.isArray(body.crons)).toBe(true);
  });

  it("trims each cron entry to {workflow, stale, lastSuccessAt, itemsProcessed}", async () => {
    const { GET } = await import("@/app/api/cron-health/route");
    const res = await GET();
    const body = (await res.json()) as { crons: Record<string, unknown>[] };
    for (const entry of body.crons) {
      expect(Object.keys(entry).sort()).toEqual(
        ["itemsProcessed", "lastSuccessAt", "stale", "workflow"].sort(),
      );
    }
  });

  it("does NOT leak lastError, lastFailureAt, errorCount, expectedIntervalMinutes, or updatedAt on any entry", async () => {
    const { GET } = await import("@/app/api/cron-health/route");
    const res = await GET();
    const body = (await res.json()) as { crons: Record<string, unknown>[] };
    const leakable = [
      "lastError",
      "lastFailureAt",
      "errorCount",
      "expectedIntervalMinutes",
      "updatedAt",
    ];
    for (const entry of body.crons) {
      for (const field of leakable) {
        expect(entry[field]).toBeUndefined();
      }
    }
    // Belt-and-braces: stringify the whole body and assert the
    // RESEND_API_KEY error message from RECORDS is not embedded
    // anywhere — catches accidental top-level leaks too.
    expect(JSON.stringify(body)).not.toContain("RESEND_API_KEY");
  });
});
