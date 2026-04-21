import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BREW_TRACKED_FORMULAE,
  fetchBrewCounter,
  parseBrewCounter,
  runBrewIngest,
} from "@/lib/data/pkg-brew";

describe("parseBrewCounter", () => {
  it("maps install.30d/90d/365d → lastMonth/last90d/lastYear (summed across keys)", () => {
    const body = {
      name: "ollama",
      analytics: {
        install: {
          "30d": { ollama: 80_000, "ollama@0.1.5": 1_000 },
          "90d": { ollama: 200_000, "ollama@0.1.5": 7_803 },
          "365d": { ollama: 900_000, "ollama@0.1.5": 50_000 },
        },
      },
    };
    expect(parseBrewCounter(body)).toEqual({
      lastMonth: 81_000,
      last90d: 207_803,
      lastYear: 950_000,
    });
  });

  it("tolerates a single-key bucket (no version qualifiers)", () => {
    const body = {
      analytics: {
        install: {
          "30d": { ollama: 50_000 },
          "90d": { ollama: 150_000 },
          "365d": { ollama: 500_000 },
        },
      },
    };
    expect(parseBrewCounter(body)).toEqual({
      lastMonth: 50_000,
      last90d: 150_000,
      lastYear: 500_000,
    });
  });

  it("throws on a non-object body", () => {
    expect(() => parseBrewCounter(null)).toThrow(/non-object body/);
  });

  it("throws when analytics or install is missing", () => {
    expect(() => parseBrewCounter({})).toThrow(/missing analytics/);
    expect(() => parseBrewCounter({ analytics: {} })).toThrow(
      /missing analytics.install/,
    );
  });

  it("throws when a bucket is missing or non-object", () => {
    expect(() =>
      parseBrewCounter({
        analytics: { install: { "30d": null, "90d": {}, "365d": {} } },
      }),
    ).toThrow(/30d/);
    expect(() =>
      parseBrewCounter({
        analytics: { install: { "30d": {}, "90d": 123, "365d": {} } },
      }),
    ).toThrow(/90d/);
  });

  it("throws on a negative or non-numeric entry inside a bucket", () => {
    expect(() =>
      parseBrewCounter({
        analytics: {
          install: {
            "30d": { ollama: -1 },
            "90d": { ollama: 1 },
            "365d": { ollama: 1 },
          },
        },
      }),
    ).toThrow(/30d entry/);
  });
});

describe("fetchBrewCounter", () => {
  it("GETs formulae.brew.sh/api/formula/{name}.json with the aipulse UA", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          analytics: {
            install: {
              "30d": { ollama: 1 },
              "90d": { ollama: 1 },
              "365d": { ollama: 1 },
            },
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const counter = await fetchBrewCounter("ollama", fetchImpl);
    expect(counter).toEqual({ lastMonth: 1, last90d: 1, lastYear: 1 });

    const [[url, init]] = (fetchImpl as unknown as {
      mock: { calls: [string, RequestInit][] };
    }).mock.calls;
    expect(url).toBe("https://formulae.brew.sh/api/formula/ollama.json");
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/aipulse/);
  });

  it("throws on non-2xx responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("not found", { status: 404 })) as unknown as typeof fetch;
    await expect(fetchBrewCounter("missing", fetchImpl)).rejects.toThrow(
      /HTTP 404/,
    );
  });
});

describe("runBrewIngest", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tracks the ollama-only formulae slate", () => {
    expect(BREW_TRACKED_FORMULAE).toEqual(["ollama"]);
  });

  it("returns ok:true + counters when the fetch succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          analytics: {
            install: {
              "30d": { ollama: 80_000 },
              "90d": { ollama: 207_803 },
              "365d": { ollama: 900_000 },
            },
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const result = await runBrewIngest({ fetchImpl });

    expect(result.ok).toBe(true);
    expect(result.written).toBe(1);
    expect(result.counters.ollama).toEqual({
      lastMonth: 80_000,
      last90d: 207_803,
      lastYear: 900_000,
    });
  });

  it("returns ok:false when the fetch fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("boom", { status: 500 })) as unknown as typeof fetch;
    const result = await runBrewIngest({ fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.written).toBe(0);
    expect(result.failures).toHaveLength(1);
  });

  it("stamps fetchedAt from the injected clock", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          analytics: {
            install: {
              "30d": { ollama: 1 },
              "90d": { ollama: 1 },
              "365d": { ollama: 1 },
            },
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const result = await runBrewIngest({
      fetchImpl,
      now: () => new Date("2026-04-21T12:55:00Z"),
    });
    expect(result.fetchedAt).toBe("2026-04-21T12:55:00.000Z");
  });
});
