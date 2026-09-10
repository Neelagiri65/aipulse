/**
 * Sample history is written at a bounded RATE, by whoever wins a shared gate.
 *
 * This is a retention fix wearing a cost fix's clothes. `recordSample` used to
 * fire on EVERY `fetchAllStatus` call — the API routes, the feed card page, its
 * OG image — at 18 Redis commands a time (6 tools x lpush + ltrim + expire), so
 * write volume tracked site traffic instead of polling cadence.
 *
 * The damage was not the bill. `MAX_SAMPLES` is 2100, sized for the designed 288
 * samples/day (7 x 288 = 2016). The observed rate was ~800 rounds/day, so
 * `ltrim` evicted the oldest days continuously and the "7-day" strip actually
 * retained about 2.6 days.
 *
 * Measured on production 2026-09-10, and this is the detail that proves it:
 * every tool's per-day sample counts were [0, 0, 187, 324, 515, 803, 271],
 * which sums to exactly 2100. The two oldest buckets were not empty because
 * nobody polled them — they were empty because they had been trimmed off the
 * end of a saturated list.
 *
 * Why a shared gate and not a cron-only flag: the heartbeat workflow covers only
 * ~76% of the day (measured over five days; GitHub schedule delays, and its own
 * comment records a 127-min restart gap). A cron-only sampler would go blind for
 * hours at a stretch. The gate bounds the rate while still letting a request
 * that lands in a gap record the observation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above module scope, so the spies must be too.
const {
  readSamples,
  readProbeSignals,
  recordSample,
  claimSampleSlot,
  fetchHistoricalIncidents,
} = vi.hoisted(() => ({
  readSamples: vi.fn(async () => []),
  readProbeSignals: vi.fn(async () => ({})),
  recordSample: vi.fn(async () => undefined),
  claimSampleSlot: vi.fn(async () => true),
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
    claimSampleSlot,
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
  claimSampleSlot.mockResolvedValue(true);
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(healthy)));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sample recording is gated", () => {
  it("writes one sample per tool when it wins the gate", async () => {
    await fetchAllStatus();

    expect(claimSampleSlot).toHaveBeenCalledTimes(1);
    expect(recordSample).toHaveBeenCalled();
    // Exactly one write round per tool — a second pass over the same tool would
    // double the effective sample rate and reintroduce the eviction this fixes.
    const toolIds = recordSample.mock.calls.map(
      (c) => (c as unknown as unknown[])[0],
    );
    expect(new Set(toolIds).size).toBe(toolIds.length);
  });

  it("writes NOTHING when it loses the gate — the regression", async () => {
    claimSampleSlot.mockResolvedValue(false);

    await fetchAllStatus();

    // The read path still needs history to render the strip...
    expect(readSamples).toHaveBeenCalled();
    // ...but must not add to it. Before the gate, an ordinary GET of
    // /api/v1/status wrote 18 commands and trimmed a day off the far end of the
    // history it had just finished reading.
    expect(recordSample).not.toHaveBeenCalled();
  });

  it("lets a request record during a cron blind window", async () => {
    // The heartbeat is down ~24% of the day. Nothing about the gate is
    // caller-specific: whoever arrives first while the slot is free records, so
    // a plain read keeps history alive across the gap.
    claimSampleSlot.mockResolvedValue(true);

    await fetchAllStatus();

    expect(recordSample).toHaveBeenCalled();
  });

  it("fails closed when the gate itself errors — no writes, no throw", async () => {
    claimSampleSlot.mockRejectedValue(new Error("upstash down"));

    // Recording must never take the dashboard down with it.
    await expect(fetchAllStatus()).resolves.toBeDefined();
    expect(recordSample).not.toHaveBeenCalled();
  });

  it("never touches the gate when Redis is absent", async () => {
    hasRedis.value = false;

    await fetchAllStatus();

    expect(claimSampleSlot).not.toHaveBeenCalled();
    expect(recordSample).not.toHaveBeenCalled();
  });

  it("never touches the gate during a render", async () => {
    // skipHistory is the homepage's flag and forces Redis fully off. The gate is
    // itself a Redis write, so it must not punch a hole through the guarantee
    // that keeps `/` statically rendered.
    await fetchAllStatus({ skipHistory: true });

    expect(claimSampleSlot).not.toHaveBeenCalled();
    expect(recordSample).not.toHaveBeenCalled();
    expect(readSamples).not.toHaveBeenCalled();
  });
});
