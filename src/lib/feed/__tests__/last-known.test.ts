import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __setRedisOverrideForTests,
  withLastKnown,
} from "@/lib/feed/last-known";

type RedisLike = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: string) => Promise<unknown>;
};

function makeFakeRedis(seed: Record<string, unknown> = {}): RedisLike & {
  store: Record<string, unknown>;
} {
  const store: Record<string, unknown> = { ...seed };
  return {
    store,
    async get(key: string) {
      return store[key];
    },
    async set(key: string, value: string) {
      // Upstash returns the parsed JSON on .get<T>; mirror that by
      // storing the parsed object so the read path round-trips cleanly.
      store[key] = JSON.parse(value);
      return "OK";
    },
  };
}

describe("withLastKnown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T10:00:00.000Z"));
  });

  afterEach(() => {
    __setRedisOverrideForTests(null);
    vi.useRealTimers();
  });

  it("returns fresh data and writes through to Redis on success", async () => {
    const fake = makeFakeRedis();
    __setRedisOverrideForTests(() => fake as never);

    const result = await withLastKnown(
      "research",
      async () => ({ ok: true, papers: [{ id: "1" }] }),
      { ok: false, papers: [] },
    );

    expect(result.staleAsOf).toBeNull();
    expect(result.data).toEqual({ ok: true, papers: [{ id: "1" }] });

    // Allow the write-through promise (kicked off via void) to resolve.
    await Promise.resolve();
    const cached = fake.store["feed:lk:research"] as {
      data: unknown;
      savedAt: string;
    };
    expect(cached.data).toEqual({ ok: true, papers: [{ id: "1" }] });
    expect(cached.savedAt).toBe("2026-04-28T10:00:00.000Z");
  });

  it("falls back to last-known cache when fresh fetch throws", async () => {
    const fake = makeFakeRedis({
      "feed:lk:research": {
        data: { ok: true, papers: [{ id: "cached" }] },
        savedAt: "2026-04-28T03:00:00.000Z",
      },
    });
    __setRedisOverrideForTests(() => fake as never);

    const result = await withLastKnown(
      "research",
      async () => {
        throw new Error("arxiv timeout");
      },
      { ok: false, papers: [] },
    );

    expect(result.data).toEqual({ ok: true, papers: [{ id: "cached" }] });
    expect(result.staleAsOf).toBe("2026-04-28T03:00:00.000Z");
  });

  it("returns the fallback when fresh throws and Redis has no cached payload", async () => {
    const fake = makeFakeRedis();
    __setRedisOverrideForTests(() => fake as never);

    const result = await withLastKnown(
      "labs",
      async () => {
        throw new Error("GH 502");
      },
      { labs: [], generatedAt: "2026-04-28T10:00:00.000Z", failures: [] },
    );

    expect(result.staleAsOf).toBeNull();
    expect(result.data).toEqual({
      labs: [],
      generatedAt: "2026-04-28T10:00:00.000Z",
      failures: [],
    });
  });

  it("returns the fallback when Redis is not configured", async () => {
    __setRedisOverrideForTests(() => null);

    const result = await withLastKnown(
      "status",
      async () => {
        throw new Error("status fetch failed");
      },
      { data: {}, polledAt: "2026-04-28T10:00:00.000Z", failures: [] },
    );

    expect(result.staleAsOf).toBeNull();
    expect(result.data).toEqual({
      data: {},
      polledAt: "2026-04-28T10:00:00.000Z",
      failures: [],
    });
  });
});
