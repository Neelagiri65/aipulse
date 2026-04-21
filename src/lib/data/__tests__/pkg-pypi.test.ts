import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PYPI_TRACKED_PACKAGES,
  fetchPyPiRecent,
  parsePyPiCounter,
  runPyPiIngest,
} from "@/lib/data/pkg-pypi";

describe("parsePyPiCounter", () => {
  it("reads {last_day,last_week,last_month} from a /recent body", () => {
    const body = {
      data: { last_day: 1234, last_week: 8765, last_month: 123456 },
      package: "anthropic",
      type: "recent_downloads",
    };
    expect(parsePyPiCounter(body)).toEqual({
      lastDay: 1234,
      lastWeek: 8765,
      lastMonth: 123456,
    });
  });

  it("rounds non-integer counters (pypistats can return decimals)", () => {
    const body = {
      data: { last_day: 100.6, last_week: 700.4, last_month: 3000.5 },
    };
    expect(parsePyPiCounter(body)).toEqual({
      lastDay: 101,
      lastWeek: 700,
      lastMonth: 3001,
    });
  });

  it("coerces numeric strings (defensive against upstream shape drift)", () => {
    const body = {
      data: { last_day: "50", last_week: "500", last_month: "5000" },
    };
    expect(parsePyPiCounter(body)).toEqual({
      lastDay: 50,
      lastWeek: 500,
      lastMonth: 5000,
    });
  });

  it("throws on a non-object body", () => {
    expect(() => parsePyPiCounter(null)).toThrow(/non-object body/);
    expect(() => parsePyPiCounter("nope")).toThrow(/non-object body/);
  });

  it("throws when the data field is missing", () => {
    expect(() => parsePyPiCounter({ package: "x" })).toThrow(/missing data/);
  });

  it("throws when a counter is not a non-negative finite number", () => {
    expect(() =>
      parsePyPiCounter({ data: { last_day: -1, last_week: 0, last_month: 0 } }),
    ).toThrow(/last_day/);
    expect(() =>
      parsePyPiCounter({
        data: { last_day: 0, last_week: "nope", last_month: 0 },
      }),
    ).toThrow(/last_week/);
    expect(() =>
      parsePyPiCounter({
        data: { last_day: 0, last_week: 0, last_month: undefined },
      }),
    ).toThrow(/last_month/);
  });
});

describe("fetchPyPiRecent", () => {
  it("GETs /api/packages/{pkg}/recent with the aipulse UA", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { last_day: 1, last_week: 7, last_month: 30 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    const counter = await fetchPyPiRecent("anthropic", fetchImpl);
    expect(counter).toEqual({ lastDay: 1, lastWeek: 7, lastMonth: 30 });

    const [[url, init]] = (fetchImpl as unknown as {
      mock: { calls: [string, RequestInit][] };
    }).mock.calls;
    expect(url).toBe("https://pypistats.org/api/packages/anthropic/recent");
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/aipulse/);
  });

  it("url-encodes the package name (huggingface-hub stays intact)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { last_day: 1, last_week: 7, last_month: 30 },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    await fetchPyPiRecent("huggingface-hub", fetchImpl);
    const [[url]] = (fetchImpl as unknown as {
      mock: { calls: [string][] };
    }).mock.calls;
    expect(url).toContain("/huggingface-hub/recent");
  });

  it("throws on non-2xx responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("not found", { status: 404 })) as unknown as typeof fetch;
    await expect(fetchPyPiRecent("missing", fetchImpl)).rejects.toThrow(
      /HTTP 404/,
    );
  });
});

describe("runPyPiIngest", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tracks the 7-package AI-SDK slate", () => {
    expect(PYPI_TRACKED_PACKAGES).toHaveLength(7);
    expect(PYPI_TRACKED_PACKAGES).toContain("anthropic");
    expect(PYPI_TRACKED_PACKAGES).toContain("openai");
    expect(PYPI_TRACKED_PACKAGES).toContain("transformers");
  });

  it("returns ok:true + counters for every successful package", async () => {
    const fetchImpl = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: { last_day: 10, last_week: 70, last_month: 300 },
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;

    const result = await runPyPiIngest({
      fetchImpl,
      packages: ["anthropic", "openai"],
    });

    expect(result.ok).toBe(true);
    expect(result.written).toBe(2);
    expect(result.failures).toEqual([]);
    expect(result.counters.anthropic).toEqual({
      lastDay: 10,
      lastWeek: 70,
      lastMonth: 300,
    });
    expect(result.counters.openai).toEqual({
      lastDay: 10,
      lastWeek: 70,
      lastMonth: 300,
    });
  });

  it("records per-package failures without dropping the whole run", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/openai/")) {
        return new Response("boom", { status: 500 });
      }
      return new Response(
        JSON.stringify({ data: { last_day: 1, last_week: 7, last_month: 30 } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await runPyPiIngest({
      fetchImpl,
      packages: ["anthropic", "openai", "langchain"],
    });

    expect(result.ok).toBe(true);
    expect(result.written).toBe(2);
    expect(result.failures).toEqual([
      { pkg: "openai", message: expect.stringMatching(/HTTP 500/) },
    ]);
    expect(Object.keys(result.counters).sort()).toEqual([
      "anthropic",
      "langchain",
    ]);
  });

  it("returns ok:false when every package fails (and does not overwrite latest)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("boom", { status: 500 })) as unknown as typeof fetch;

    const result = await runPyPiIngest({
      fetchImpl,
      packages: ["anthropic", "openai"],
    });

    expect(result.ok).toBe(false);
    expect(result.written).toBe(0);
    expect(result.failures).toHaveLength(2);
    expect(result.counters).toEqual({});
  });

  it("stamps fetchedAt from the injected clock", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { last_day: 1, last_week: 7, last_month: 30 },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const result = await runPyPiIngest({
      fetchImpl,
      packages: ["anthropic"],
      now: () => new Date("2026-04-21T12:15:00Z"),
    });

    expect(result.fetchedAt).toBe("2026-04-21T12:15:00.000Z");
  });
});
