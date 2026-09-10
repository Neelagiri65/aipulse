/**
 * Sample history is written by the 5-minute cron, and by nothing else.
 *
 * This is a retention fix wearing a cost fix's clothes. `recordSample` used to
 * fire on EVERY `fetchAllStatus` call — the API routes, the feed card page, its
 * OG image — at 18 Redis commands a time (6 tools x lpush + ltrim + expire), so
 * write volume tracked site traffic instead of polling cadence.
 *
 * The damage was not just the bill. `MAX_SAMPLES` is 2100, sized for the
 * designed 288 samples/day (7 x 288 = 2016). The observed rate was ~800/day, so
 * `ltrim` evicted the oldest days continuously and the "7-day" strip actually
 * retained about 2.6 days.
 *
 * Measured on production 2026-09-10, and this is the detail that proves it:
 * every tool's per-day sample counts were [0, 0, 187, 324, 515, 803, 271],
 * which sums to exactly 2100. The two oldest buckets were not empty because
 * nobody polled them — they were empty because they had been trimmed off the
 * end of a saturated list.
 *
 * So the assertion that matters is not "fewer writes"; it is "writes happen on
 * the cron tick and only there".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above module scope, so the spies must be too.
const { readSamples, readProbeSignals, recordSample, fetchHistoricalIncidents } =
  vi.hoisted(() => ({
    readSamples: vi.fn(async () => []),
    readProbeSignals: vi.fn(async () => ({})),
    recordSample: vi.fn(async () => undefined),
    fetchHistoricalIncidents: vi.fn(async () => []),
  }));

// Redis present, which is the only condition under which recording is even
// attempted — and the condition a local run never has.
const hasRedis = vi.hoisted(() => ({ value: true }));

vi.mock("@/lib/data/status-history", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/data/status-history")>();
  return {
    ...actual,
    fetchHistoricalIncidents,
    readSamples,
    readProbeSignals,
    recordSample,
    hasRedisConfigured: () => hasRedis.value,
    bucketToDays: () => [],
  };
});

import { fetchAllStatus } from "@/lib/data/fetch-status";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

const healthy = {
  page: { name: "Test" },
  status: { indicator: "none" },
  components: [{ name: "Copilot", status: "operational" }],
  incidents: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  hasRedis.value = true;
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(healthy)));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchAllStatus({ recordSamples })", () => {
  it("writes NO samples on a plain read — the API-route path", async () => {
    await fetchAllStatus();

    // The read path still needs history to render the strip...
    expect(readSamples).toHaveBeenCalled();
    // ...but must not add to it. This is the regression: before the gate, an
    // ordinary GET of /api/v1/status wrote 18 commands and trimmed a day off
    // the far end of the history it had just read.
    expect(recordSample).not.toHaveBeenCalled();
  });

  it("writes one sample per tool when the cron asks for it", async () => {
    await fetchAllStatus({ recordSamples: true });

    expect(recordSample).toHaveBeenCalled();
    // Exactly one write round per tool — never a second pass over the same
    // tool, which would double the effective sample rate and reintroduce the
    // eviction this fix removes.
    const toolIds = recordSample.mock.calls.map((c) => (c as unknown as unknown[])[0]);
    expect(new Set(toolIds).size).toBe(toolIds.length);
  });

  it("records nothing when Redis is absent, even if the cron asks", async () => {
    hasRedis.value = false;

    await fetchAllStatus({ recordSamples: true });

    expect(recordSample).not.toHaveBeenCalled();
  });

  it("does not record during a render, which cannot touch Redis at all", async () => {
    // skipHistory is the homepage's flag and forces Redis fully off; asking for
    // recording as well must not punch a hole through it.
    await fetchAllStatus({ skipHistory: true, recordSamples: true });

    expect(recordSample).not.toHaveBeenCalled();
    expect(readSamples).not.toHaveBeenCalled();
  });
});
