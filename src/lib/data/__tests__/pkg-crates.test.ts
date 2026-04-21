import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CRATES_TRACKED_PACKAGES,
  fetchCratesCounter,
  parseCratesCounter,
  runCratesIngest,
} from "@/lib/data/pkg-crates";

describe("parseCratesCounter", () => {
  it("reads {downloads, recent_downloads} → {allTime, last90d}", () => {
    const body = {
      crate: {
        id: "candle-core",
        downloads: 2_500_000,
        recent_downloads: 350_000,
      },
    };
    expect(parseCratesCounter(body)).toEqual({
      last90d: 350_000,
      allTime: 2_500_000,
    });
  });

  it("rounds non-integer counters defensively", () => {
    const body = { crate: { downloads: 10.4, recent_downloads: 3.6 } };
    expect(parseCratesCounter(body)).toEqual({ last90d: 4, allTime: 10 });
  });

  it("coerces numeric strings", () => {
    const body = { crate: { downloads: "100", recent_downloads: "10" } };
    expect(parseCratesCounter(body)).toEqual({ last90d: 10, allTime: 100 });
  });

  it("throws on a non-object body", () => {
    expect(() => parseCratesCounter(null)).toThrow(/non-object body/);
    expect(() => parseCratesCounter("nope")).toThrow(/non-object body/);
  });

  it("throws when crate field is missing", () => {
    expect(() => parseCratesCounter({ version: {} })).toThrow(/missing crate/);
  });

  it("throws on negative or non-numeric counter fields", () => {
    expect(() =>
      parseCratesCounter({ crate: { downloads: -1, recent_downloads: 0 } }),
    ).toThrow(/downloads/);
    expect(() =>
      parseCratesCounter({ crate: { downloads: 100, recent_downloads: "nope" } }),
    ).toThrow(/recent_downloads/);
  });
});

describe("fetchCratesCounter", () => {
  it("GETs crates.io/api/v1/crates/{name} with the aipulse UA", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ crate: { downloads: 100, recent_downloads: 50 } }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const counter = await fetchCratesCounter("candle-core", fetchImpl);
    expect(counter).toEqual({ last90d: 50, allTime: 100 });

    const [[url, init]] = (fetchImpl as unknown as {
      mock: { calls: [string, RequestInit][] };
    }).mock.calls;
    expect(url).toBe("https://crates.io/api/v1/crates/candle-core");
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/aipulse/);
  });

  it("url-encodes crate names with special chars", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ crate: { downloads: 1, recent_downloads: 1 } }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    await fetchCratesCounter("foo/bar", fetchImpl);
    const [[url]] = (fetchImpl as unknown as { mock: { calls: [string][] } }).mock
      .calls;
    expect(url).toContain("/crates/foo%2Fbar");
  });

  it("throws on non-2xx responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("not found", { status: 404 })) as unknown as typeof fetch;
    await expect(fetchCratesCounter("missing", fetchImpl)).rejects.toThrow(
      /HTTP 404/,
    );
  });
});

describe("runCratesIngest", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tracks the 4-crate AI/ML Rust slate", () => {
    expect(CRATES_TRACKED_PACKAGES).toEqual([
      "candle-core",
      "burn",
      "tch",
      "ort",
    ]);
  });

  it("returns ok:true + counters for every successful crate", async () => {
    const fetchImpl = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ crate: { downloads: 2000, recent_downloads: 300 } }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;

    const result = await runCratesIngest({
      fetchImpl,
      packages: ["candle-core", "burn"],
    });

    expect(result.ok).toBe(true);
    expect(result.written).toBe(2);
    expect(result.failures).toEqual([]);
    expect(result.counters["candle-core"]).toEqual({
      last90d: 300,
      allTime: 2000,
    });
  });

  it("records per-crate failures without dropping the whole run", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/burn")) return new Response("boom", { status: 500 });
      return new Response(
        JSON.stringify({ crate: { downloads: 1, recent_downloads: 1 } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await runCratesIngest({
      fetchImpl,
      packages: ["candle-core", "burn", "tch"],
    });

    expect(result.ok).toBe(true);
    expect(result.written).toBe(2);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.pkg).toBe("burn");
    expect(Object.keys(result.counters).sort()).toEqual(["candle-core", "tch"]);
  });

  it("returns ok:false when every crate fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("boom", { status: 500 })) as unknown as typeof fetch;
    const result = await runCratesIngest({
      fetchImpl,
      packages: ["candle-core", "burn"],
    });
    expect(result.ok).toBe(false);
    expect(result.written).toBe(0);
    expect(result.failures).toHaveLength(2);
    expect(result.counters).toEqual({});
  });

  it("stamps fetchedAt from the injected clock", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ crate: { downloads: 1, recent_downloads: 1 } }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const result = await runCratesIngest({
      fetchImpl,
      packages: ["candle-core"],
      now: () => new Date("2026-04-21T12:35:00Z"),
    });
    expect(result.fetchedAt).toBe("2026-04-21T12:35:00.000Z");
  });
});
