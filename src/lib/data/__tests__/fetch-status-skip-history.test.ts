/**
 * The homepage render must not touch Redis, because touching it makes the
 * route dynamic.
 *
 * `@upstash/redis` issues every call with `cache: "no-store"`
 * (`nodejs.mjs`: `cache: configOrRequester.cache ?? "no-store"`), and a
 * no-store fetch inside a server component opts the whole route out of static
 * generation. So SSR reading sample history flipped `/` from `○` to `ƒ`.
 *
 * It regressed on PROD ONLY, and that is the part worth remembering: a local
 * build has no `UPSTASH_*`, so `hasRedisConfigured()` short-circuits and the
 * call is never made. Every local check passed while prod served
 * `x-vercel-cache: MISS` on every request — rendering per visitor at ~530ms
 * TTFB and spending ~7 Upstash commands each against a 10k/day budget.
 *
 * Reproduced by building with `UPSTASH_*` set: `ƒ /` without the flag,
 * `○ / 5m` with it.
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

vi.mock("@/lib/data/status-history", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/data/status-history")>();
  return {
    ...actual,
    fetchHistoricalIncidents,
    readSamples,
    readProbeSignals,
    recordSample,
    // The condition that only exists on prod.
    hasRedisConfigured: () => true,
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
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(healthy)));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchAllStatus({ skipHistory })", () => {
  it("makes ZERO Redis calls when the page renders", async () => {
    const result = await fetchAllStatus({ skipHistory: true });

    expect(readSamples).not.toHaveBeenCalled();
    expect(readProbeSignals).not.toHaveBeenCalled();
    expect(recordSample).not.toHaveBeenCalled();

    // The part that must still be in the crawler's HTML.
    expect(result.data["copilot"]).toBeDefined();
    expect(result.polledAt).toBeTruthy();
    // History is the client's job now, and the payload says so rather than
    // implying an empty history is a measured one.
    expect(result.data["copilot"]?.historyHasSamples).toBe(false);
  });

  it("still reads history for the API route, which is not a render", async () => {
    await fetchAllStatus();

    expect(readSamples).toHaveBeenCalled();
    expect(readProbeSignals).toHaveBeenCalled();
  });
});
