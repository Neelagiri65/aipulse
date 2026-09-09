/**
 * The five history fetches carry the same ceiling as the status fetches.
 *
 * They are invisible to fetch-status-degradation.test.ts, which mocks this
 * module wholesale — so "all twelve fetches have a timeout" was pinned on six
 * of them until this existed. A hung incidents endpoint holds the same shared
 * `Promise.all` open as a hung status page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FETCH_TIMEOUT_MS,
  fetchHistoricalIncidents,
} from "@/lib/data/status-history";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchHistoricalIncidents — abort ceiling", () => {
  it("passes an AbortSignal on the incidents fetch", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ incidents: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchHistoricalIncidents({
      incidentsApiUrl: "https://status.claude.com/api/v2/incidents.json?limit=50",
      cacheTag: "test-history",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("shares one ceiling constant with the status fetches", () => {
    // A second hardcoded 5_000 here would drift the moment the budget changes.
    expect(FETCH_TIMEOUT_MS).toBe(5_000);
  });

  it("degrades a hung incidents endpoint to an empty history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("timed out", "TimeoutError")),
            );
          }),
      ),
    );

    const startedAt = Date.now();
    const result = await fetchHistoricalIncidents({
      incidentsApiUrl: "https://status.claude.com/api/v2/incidents.json?limit=50",
      cacheTag: "test-history",
    });

    expect(Date.now() - startedAt).toBeLessThan(8_000);
    expect(result).toEqual([]);
  }, 15_000);
});
