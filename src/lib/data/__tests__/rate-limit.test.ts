import { describe, expect, it } from "vitest";
import {
  checkAndIncrement,
  type RateLimitClient,
} from "@/lib/data/rate-limit";
import { MockRedis } from "@/lib/data/__tests__/helpers/mock-redis";

describe("checkAndIncrement", () => {
  it("allows the first N requests within the window", async () => {
    const client = new MockRedis() as unknown as RateLimitClient;
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await checkAndIncrement("rl:test", 5, 60, { client }));
    }
    expect(results.every((r) => r.allowed)).toBe(true);
    expect(results[4].remaining).toBe(0);
  });

  it("blocks requests past the limit", async () => {
    const client = new MockRedis() as unknown as RateLimitClient;
    for (let i = 0; i < 5; i++) {
      await checkAndIncrement("rl:block", 5, 60, { client });
    }
    const r = await checkAndIncrement("rl:block", 5, 60, { client });
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("sets an expire on the first hit only", async () => {
    let now = 1_700_000_000_000;
    const clock = () => now;
    const mock = new MockRedis(clock);
    const client = mock as unknown as RateLimitClient;
    await checkAndIncrement("rl:ttl", 5, 60, { client, now: clock });
    await checkAndIncrement("rl:ttl", 5, 60, { client, now: clock });
    expect(await mock.ttl("rl:ttl")).toBe(60);
    now += 30_000;
    expect(await mock.ttl("rl:ttl")).toBe(30);
  });

  it("resets the counter after the window elapses", async () => {
    let now = 1_700_000_000_000;
    const clock = () => now;
    const mock = new MockRedis(clock);
    const client = mock as unknown as RateLimitClient;
    for (let i = 0; i < 5; i++) {
      await checkAndIncrement("rl:reset", 5, 60, { client, now: clock });
    }
    expect(
      (await checkAndIncrement("rl:reset", 5, 60, { client, now: clock }))
        .allowed,
    ).toBe(false);
    now += 61_000;
    const after = await checkAndIncrement("rl:reset", 5, 60, { client, now: clock });
    expect(after.allowed).toBe(true);
  });

  it("fails open when no client is available (local dev without Redis)", async () => {
    const r = await checkAndIncrement("rl:none", 5, 60, {});
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
  });

  it("returns a resetAt based on the injected now()", async () => {
    const client = new MockRedis() as unknown as RateLimitClient;
    const fixed = 1_700_000_000_000;
    const r = await checkAndIncrement("rl:now", 5, 60, {
      client,
      now: () => fixed,
    });
    expect(r.resetAt).toBeGreaterThanOrEqual(fixed);
    expect(r.resetAt).toBeLessThanOrEqual(fixed + 60_000);
  });
});
