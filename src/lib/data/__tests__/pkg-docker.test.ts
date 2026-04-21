import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DOCKER_TRACKED_IMAGES,
  fetchDockerCounter,
  parseDockerCounter,
  runDockerIngest,
} from "@/lib/data/pkg-docker";

describe("parseDockerCounter", () => {
  it("reads pull_count → allTime and star_count → stars", () => {
    expect(
      parseDockerCounter({
        pull_count: 18_400_000,
        star_count: 275,
        namespace: "vllm",
        name: "vllm-openai",
      }),
    ).toEqual({ allTime: 18_400_000, stars: 275 });
  });

  it("rounds and coerces defensively", () => {
    expect(parseDockerCounter({ pull_count: "1000", star_count: 4.6 })).toEqual({
      allTime: 1000,
      stars: 5,
    });
  });

  it("throws on a non-object body", () => {
    expect(() => parseDockerCounter(null)).toThrow(/non-object body/);
  });

  it("throws when pull_count or star_count is invalid", () => {
    expect(() =>
      parseDockerCounter({ pull_count: -1, star_count: 0 }),
    ).toThrow(/pull_count/);
    expect(() =>
      parseDockerCounter({ pull_count: 100, star_count: "nope" }),
    ).toThrow(/star_count/);
  });
});

describe("fetchDockerCounter", () => {
  it("GETs hub.docker.com/v2/repositories/{ns}/{name}/ with the aipulse UA", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ pull_count: 100, star_count: 10 }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const counter = await fetchDockerCounter("ollama/ollama", fetchImpl);
    expect(counter).toEqual({ allTime: 100, stars: 10 });

    const [[url, init]] = (fetchImpl as unknown as {
      mock: { calls: [string, RequestInit][] };
    }).mock.calls;
    expect(url).toBe("https://hub.docker.com/v2/repositories/ollama/ollama/");
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/aipulse/);
  });

  it("rejects an image id that lacks a namespace/name separator", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(fetchDockerCounter("ollama", fetchImpl)).rejects.toThrow(
      /namespace\/name/,
    );
    await expect(fetchDockerCounter("ollama/", fetchImpl)).rejects.toThrow(
      /namespace\/name/,
    );
    await expect(fetchDockerCounter("/ollama", fetchImpl)).rejects.toThrow(
      /namespace\/name/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws on non-2xx responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("not found", { status: 404 })) as unknown as typeof fetch;
    await expect(fetchDockerCounter("missing/image", fetchImpl)).rejects.toThrow(
      /HTTP 404/,
    );
  });
});

describe("runDockerIngest", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tracks the 2-image AI container slate", () => {
    expect(DOCKER_TRACKED_IMAGES).toEqual([
      "ollama/ollama",
      "vllm/vllm-openai",
    ]);
  });

  it("returns ok:true + counters for every successful image", async () => {
    const fetchImpl = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ pull_count: 500_000, star_count: 200 }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;

    const result = await runDockerIngest({
      fetchImpl,
      images: ["ollama/ollama", "vllm/vllm-openai"],
    });

    expect(result.ok).toBe(true);
    expect(result.written).toBe(2);
    expect(result.failures).toEqual([]);
    expect(result.counters["ollama/ollama"]).toEqual({
      allTime: 500_000,
      stars: 200,
    });
  });

  it("records per-image failures without dropping the whole run", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/vllm/"))
        return new Response("boom", { status: 500 });
      return new Response(
        JSON.stringify({ pull_count: 1, star_count: 1 }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await runDockerIngest({
      fetchImpl,
      images: ["ollama/ollama", "vllm/vllm-openai"],
    });

    expect(result.ok).toBe(true);
    expect(result.written).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.pkg).toBe("vllm/vllm-openai");
  });

  it("returns ok:false when every image fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("boom", { status: 500 })) as unknown as typeof fetch;
    const result = await runDockerIngest({
      fetchImpl,
      images: ["ollama/ollama", "vllm/vllm-openai"],
    });
    expect(result.ok).toBe(false);
    expect(result.counters).toEqual({});
  });

  it("stamps fetchedAt from the injected clock", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ pull_count: 1, star_count: 1 }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const result = await runDockerIngest({
      fetchImpl,
      images: ["ollama/ollama"],
      now: () => new Date("2026-04-21T12:45:00Z"),
    });
    expect(result.fetchedAt).toBe("2026-04-21T12:45:00.000Z");
  });
});
