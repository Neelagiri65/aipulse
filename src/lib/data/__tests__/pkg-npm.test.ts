import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NPM_TRACKED_PACKAGES,
  fetchNpmCounter,
  fetchNpmPoint,
  parseNpmPoint,
  runNpmIngest,
} from "@/lib/data/pkg-npm";

describe("parseNpmPoint", () => {
  it("reads the downloads field from a /downloads/point body", () => {
    expect(parseNpmPoint({ downloads: 1234, package: "openai" }, "last-day")).toBe(
      1234,
    );
  });

  it("rounds non-integer counters", () => {
    expect(parseNpmPoint({ downloads: 100.6 }, "last-day")).toBe(101);
  });

  it("coerces numeric strings (defensive against upstream shape drift)", () => {
    expect(parseNpmPoint({ downloads: "5000" }, "last-week")).toBe(5000);
  });

  it("throws on a non-object body", () => {
    expect(() => parseNpmPoint(null, "last-day")).toThrow(/non-object body/);
    expect(() => parseNpmPoint("nope", "last-day")).toThrow(/non-object body/);
  });

  it("throws when the npm error envelope is present", () => {
    expect(() =>
      parseNpmPoint({ error: "package missing" }, "last-month"),
    ).toThrow(/package missing/);
  });

  it("throws when downloads is not a non-negative finite number", () => {
    expect(() => parseNpmPoint({ downloads: -1 }, "last-day")).toThrow(/downloads/);
    expect(() => parseNpmPoint({ downloads: "nope" }, "last-week")).toThrow(
      /downloads/,
    );
    expect(() => parseNpmPoint({ downloads: undefined }, "last-month")).toThrow(
      /downloads/,
    );
  });
});

describe("fetchNpmPoint", () => {
  it("GETs api.npmjs.org/downloads/point/{window}/{pkg} with the aipulse UA", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ downloads: 10 }), { status: 200 }),
      ) as unknown as typeof fetch;
    const n = await fetchNpmPoint("openai", "last-week", fetchImpl);
    expect(n).toBe(10);
    const [[url, init]] = (fetchImpl as unknown as {
      mock: { calls: [string, RequestInit][] };
    }).mock.calls;
    expect(url).toBe("https://api.npmjs.org/downloads/point/last-week/openai");
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/aipulse/);
  });

  it("keeps scoped packages intact (@scope/name path is NOT url-encoded)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ downloads: 1 }), { status: 200 }),
      ) as unknown as typeof fetch;
    await fetchNpmPoint("@anthropic-ai/sdk", "last-day", fetchImpl);
    const [[url]] = (fetchImpl as unknown as { mock: { calls: [string][] } }).mock
      .calls;
    expect(url).toBe(
      "https://api.npmjs.org/downloads/point/last-day/@anthropic-ai/sdk",
    );
  });

  it("throws on non-2xx responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("not found", { status: 404 })) as unknown as typeof fetch;
    await expect(fetchNpmPoint("missing", "last-day", fetchImpl)).rejects.toThrow(
      /HTTP 404/,
    );
  });
});

describe("fetchNpmCounter", () => {
  it("issues three parallel point calls and returns {lastDay, lastWeek, lastMonth}", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/last-day/"))
        return new Response(JSON.stringify({ downloads: 1 }), { status: 200 });
      if (url.includes("/last-week/"))
        return new Response(JSON.stringify({ downloads: 7 }), { status: 200 });
      if (url.includes("/last-month/"))
        return new Response(JSON.stringify({ downloads: 30 }), { status: 200 });
      return new Response("?", { status: 500 });
    }) as unknown as typeof fetch;

    const counter = await fetchNpmCounter("ai", fetchImpl);
    expect(counter).toEqual({ lastDay: 1, lastWeek: 7, lastMonth: 30 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("propagates any per-window failure (never half-populated)", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/last-week/"))
        return new Response("boom", { status: 500 });
      return new Response(JSON.stringify({ downloads: 1 }), { status: 200 });
    }) as unknown as typeof fetch;

    await expect(fetchNpmCounter("ai", fetchImpl)).rejects.toThrow(/HTTP 500/);
  });
});

describe("runNpmIngest", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tracks the 5-package AI-SDK slate", () => {
    expect(NPM_TRACKED_PACKAGES).toHaveLength(5);
    expect(NPM_TRACKED_PACKAGES).toContain("@anthropic-ai/sdk");
    expect(NPM_TRACKED_PACKAGES).toContain("openai");
    expect(NPM_TRACKED_PACKAGES).toContain("@langchain/core");
    expect(NPM_TRACKED_PACKAGES).toContain("ai");
    expect(NPM_TRACKED_PACKAGES).toContain("llamaindex");
  });

  it("returns ok:true + counters for every successful package", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/last-day/"))
        return new Response(JSON.stringify({ downloads: 10 }), { status: 200 });
      if (url.includes("/last-week/"))
        return new Response(JSON.stringify({ downloads: 70 }), { status: 200 });
      if (url.includes("/last-month/"))
        return new Response(JSON.stringify({ downloads: 300 }), { status: 200 });
      return new Response("?", { status: 500 });
    }) as unknown as typeof fetch;

    const result = await runNpmIngest({
      fetchImpl,
      packages: ["openai", "ai"],
    });

    expect(result.ok).toBe(true);
    expect(result.written).toBe(2);
    expect(result.failures).toEqual([]);
    expect(result.counters.openai).toEqual({
      lastDay: 10,
      lastWeek: 70,
      lastMonth: 300,
    });
    expect(result.counters.ai).toEqual({
      lastDay: 10,
      lastWeek: 70,
      lastMonth: 300,
    });
  });

  it("records per-package failures without dropping the whole run", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/openai")) {
        return new Response("boom", { status: 500 });
      }
      if (url.includes("/last-day/"))
        return new Response(JSON.stringify({ downloads: 1 }), { status: 200 });
      if (url.includes("/last-week/"))
        return new Response(JSON.stringify({ downloads: 7 }), { status: 200 });
      if (url.includes("/last-month/"))
        return new Response(JSON.stringify({ downloads: 30 }), { status: 200 });
      return new Response("?", { status: 500 });
    }) as unknown as typeof fetch;

    const result = await runNpmIngest({
      fetchImpl,
      packages: ["openai", "ai", "llamaindex"],
    });

    expect(result.ok).toBe(true);
    expect(result.written).toBe(2);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.pkg).toBe("openai");
    expect(Object.keys(result.counters).sort()).toEqual(["ai", "llamaindex"]);
  });

  it("returns ok:false when every package fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("boom", { status: 500 })) as unknown as typeof fetch;
    const result = await runNpmIngest({
      fetchImpl,
      packages: ["openai", "ai"],
    });
    expect(result.ok).toBe(false);
    expect(result.written).toBe(0);
    expect(result.failures).toHaveLength(2);
    expect(result.counters).toEqual({});
  });

  it("stamps fetchedAt from the injected clock", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ downloads: 1 }), { status: 200 }),
    ) as unknown as typeof fetch;
    const result = await runNpmIngest({
      fetchImpl,
      packages: ["ai"],
      now: () => new Date("2026-04-21T12:25:00Z"),
    });
    expect(result.fetchedAt).toBe("2026-04-21T12:25:00.000Z");
  });
});
