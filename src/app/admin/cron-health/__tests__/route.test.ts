/**
 * Wire-shape contract for the admin-only `/admin/cron-health` JSON.
 *
 * This route exists to surface the per-workflow fields the public
 * sibling intentionally hides (lastError + failure detail). It's
 * gated by the existing `/admin/*` middleware (basic auth via
 * `ADMIN_PREVIEW_USER` + `ADMIN_PREVIEW_PASS`), tested separately
 * in `src/__tests__/middleware.test.ts`. The handler itself is
 * unconditional — once middleware lets the request through, return
 * the full record so the operator can read the failure cause.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CronHealthRecord } from "@/lib/data/cron-health";

const RECORDS: CronHealthRecord[] = [
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

describe("/admin/cron-health (admin)", () => {
  beforeEach(() => {
    vi.useFakeTimers().setSystemTime(new Date("2026-04-28T06:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the full per-cron record including lastError + failure detail", async () => {
    const { GET } = await import("@/app/admin/cron-health/route");
    const res = await GET();
    const body = (await res.json()) as { crons: Record<string, unknown>[] };
    const entry = body.crons[0]!;
    expect(entry.workflow).toBe("daily-digest");
    expect(entry.lastError).toBe("missing required env var: RESEND_API_KEY");
    expect(entry.lastFailureAt).toBe("2026-04-25T08:42:06.000Z");
    expect(entry.errorCount).toBe(4);
    expect(entry.expectedIntervalMinutes).toBe(1440);
    expect(entry.updatedAt).toBe("2026-04-27T10:07:00.000Z");
    expect(entry.stale).toBeDefined();
  });
});
