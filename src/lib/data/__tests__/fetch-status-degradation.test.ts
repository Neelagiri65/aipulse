/**
 * Degradation contract for `fetchAllStatus` — the two ways it used to take the
 * whole homepage down instead of one card.
 *
 * 1. A HUNG upstream. Every fetch here had no `AbortSignal`, so one status page
 *    that accepts the connection and never answers held the shared
 *    `Promise.all` open until the platform killed the function. Under ISR the
 *    stale entry keeps serving, so nobody sees an error — the numbers just
 *    freeze at the last good poll and never move again.
 *
 * 2. A MALFORMED 200. Every network leg resolves to an `Error` value rather
 *    than throwing, so the surviving throw path is the synchronous assembly
 *    over `as`-asserted payloads: `incidents` arriving as a truthy non-array
 *    makes `activeIncidentsOf`'s `.filter` a TypeError. That single upstream
 *    took all six cards with it, and the homepage fell back to the S98 shell —
 *    the no-numbers page #123 existed to remove.
 *
 * Both assert the same shape: the broken source degrades into `failures[]`,
 * every healthy source still renders.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/status-history", () => ({
  // The real module owns the shared ceiling. Omitting it here makes every
  // `AbortSignal.timeout(undefined)` throw, which silently empties the page.
  FETCH_TIMEOUT_MS: 5_000,
  fetchHistoricalIncidents: vi.fn(async () => []),
  readSamples: vi.fn(async () => []),
  readProbeSignals: vi.fn(async () => ({})),
  recordSample: vi.fn(async () => undefined),
  hasRedisConfigured: () => false,
  bucketToDays: () => [],
}));

import { fetchAllStatus } from "@/lib/data/fetch-status";

/** A healthy statuspage payload: everything operational, no incidents. */
function healthy() {
  return {
    page: { name: "Test Status" },
    status: { indicator: "none", description: "All Systems Operational" },
    components: [
      { name: "Codex Web", status: "operational" },
      { name: "Codex API", status: "operational" },
      { name: "Copilot", status: "operational" },
    ],
    incidents: [],
  };
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

const OPENAI_STATUS_URL = "status.openai.com/api/v2/summary.json";
const ANTHROPIC_STATUS_URL = "status.claude.com/api/v2/summary.json";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  // `unstubAllGlobals` does not reset env stubs — without this, the GH_TOKEN
  // set below leaks into the tests after it and their passing depends on order.
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("fetchAllStatus — one broken source degrades one card", () => {
  it("attaches an abort ceiling to every outbound status fetch", async () => {
    // Without a token `fetchClaudeCodeIssues` returns before it fetches, so the
    // assertion below would silently skip it.
    vi.stubEnv("GH_TOKEN", "test-token");
    const fetchMock = vi.fn(async () => jsonResponse(healthy()));
    vi.stubGlobal("fetch", fetchMock);

    await fetchAllStatus();

    // 6 statuspage/incidents fetches + the GitHub issues search. The five
    // history fetches live in the mocked module and are covered separately.
    expect(fetchMock.mock.calls.length).toBe(7);

    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    for (const [, init] of fetchMock.mock.calls as unknown as Array<
      [string, RequestInit]
    >) {
      // Without this the hang below has nothing to stop it.
      expect(init.signal, "every status fetch needs a timeout").toBeDefined();
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it(
    "returns when one upstream hangs forever, instead of holding the render open",
    async () => {
      // The feared path itself: a connection that is accepted and never
      // answered. Only the ceiling ends this.
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
          if (String(url).includes(OPENAI_STATUS_URL)) {
            return new Promise<Response>((_resolve, reject) => {
              init.signal?.addEventListener("abort", () =>
                reject(new DOMException("timed out", "TimeoutError")),
              );
            });
          }
          return jsonResponse(healthy());
        }),
      );

      const startedAt = Date.now();
      const result = await fetchAllStatus();
      const elapsedMs = Date.now() - startedAt;

      // It came back at all, and on the ceiling rather than the function limit.
      expect(elapsedMs).toBeLessThan(8_000);

      // The hung source degraded...
      expect(result.failures.some((f) => f.toolId === "openai-api")).toBe(true);
      expect(result.data["openai-api"]).toBeUndefined();

      // ...and every source that answered is still on the page.
      expect(result.data["claude-code"]).toBeDefined();
      expect(result.data["copilot"]).toBeDefined();
      expect(result.data["windsurf"]).toBeDefined();
      expect(result.data["cursor"]).toBeDefined();
    },
    15_000,
  );

  it("survives a 200 whose `incidents` is a truthy non-array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes(ANTHROPIC_STATUS_URL)) {
          // A real shape change, not a network error: 200, valid JSON,
          // `incidents` an object. `activeIncidentsOf` calls `.filter` on it.
          return jsonResponse({ ...healthy(), incidents: {} });
        }
        return jsonResponse(healthy());
      }),
    );

    const result = await fetchAllStatus();

    // The malformed card is gone and says why...
    expect(result.data["claude-code"]).toBeUndefined();
    expect(
      result.failures.some(
        (f) => f.toolId === "claude-code" && /assembly failed/.test(f.message),
      ),
    ).toBe(true);

    // ...while every healthy card renders. Before isolation this list was
    // empty and the homepage served the shell.
    expect(result.data["openai-api"]).toBeDefined();
    expect(result.data["codex"]).toBeDefined();
    expect(result.data["copilot"]).toBeDefined();
    expect(result.data["windsurf"]).toBeDefined();
    expect(result.data["cursor"]).toBeDefined();
  });

  it("blames the codex card for a codex failure, not the openai-api card", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes(OPENAI_STATUS_URL)) {
          // `components` a truthy non-array: `overallStatus` reads
          // `status.indicator` and survives, so the openai-api card builds
          // fine — but `findComponent`'s `.find` throws while assembling
          // codex. Both cards read this one payload, so without its own
          // isolation the failure was recorded against a card that rendered.
          return jsonResponse({ ...healthy(), components: {} });
        }
        return jsonResponse(healthy());
      }),
    );

    const result = await fetchAllStatus();

    expect(result.data["openai-api"]).toBeDefined();
    expect(result.data["codex"]).toBeUndefined();
    expect(
      result.failures.some(
        (f) => f.toolId === "codex" && /assembly failed/.test(f.message),
      ),
    ).toBe(true);
    expect(
      result.failures.some((f) => f.toolId === "openai-api"),
      "openai-api rendered — it must not be blamed for codex",
    ).toBe(false);
  });
});
