import { afterEach, describe, expect, it } from "vitest";

import type { Redis } from "@upstash/redis";

import {
  __setRedisOverrideForTests,
  forceWriteContainmentState,
  readContainmentState,
  readLastGood,
  writeContainmentState,
  writeLastGood,
} from "../store";
import type { ContainmentState } from "../types";

/**
 * In-memory fake of the two upstash primitives the store uses, plus an
 * emulation of the CAS Lua script: version-compare, then set both keys.
 */
class FakeRedis {
  raw = new Map<string, string>();
  failNextCall = false;

  async get(key: string): Promise<unknown> {
    this.throwIfPoisoned();
    const v = this.raw.get(key);
    if (v === undefined) return null;
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }

  async set(key: string, value: string): Promise<string> {
    this.throwIfPoisoned();
    this.raw.set(key, value);
    return "OK";
  }

  async eval(
    _script: string,
    keys: string[],
    args: string[],
  ): Promise<unknown> {
    this.throwIfPoisoned();
    const [versionKey, stateKey] = keys;
    const [basedOn, nextVersion, blob] = args;
    const current = Number(this.raw.get(versionKey) ?? "0");
    if (current !== Number(basedOn)) return 0;
    this.raw.set(versionKey, nextVersion);
    this.raw.set(stateKey, blob);
    return 1;
  }

  private throwIfPoisoned(): void {
    if (this.failNextCall) {
      this.failNextCall = false;
      throw new Error("redis unavailable");
    }
  }
}

function install(fake: FakeRedis | null): void {
  __setRedisOverrideForTests(() => fake as unknown as Redis | null);
}

afterEach(() => {
  __setRedisOverrideForTests(null);
});

function state(computedAt: number): ContainmentState {
  return {
    schemaVersion: 1,
    computedAt,
    sources: {
      "openrouter-rankings": {
        state: "live",
        consecutivePasses: 0,
        consecutiveFails: 0,
        enteredAt: computedAt,
        reason: "",
        lastProbeAt: computedAt,
        lastGoodAt: computedAt,
        lastPassKey: "2026-07-04T10:00:00Z",
      },
    },
  };
}

describe("readContainmentState", () => {
  it("reports an ERROR (not a cold start) when Redis is unavailable", async () => {
    install(null);
    expect(await readContainmentState()).toEqual({ state: null, error: true });
  });

  it("reports a genuine cold start when the key is missing", async () => {
    install(new FakeRedis());
    expect(await readContainmentState()).toEqual({ state: null, error: false });
  });

  it("treats a structurally invalid blob (wrong schemaVersion) as absent, not an error", async () => {
    const fake = new FakeRedis();
    fake.raw.set(
      "containment:state",
      JSON.stringify({ schemaVersion: 2, computedAt: 5, sources: {} }),
    );
    install(fake);
    expect(await readContainmentState()).toEqual({ state: null, error: false });
  });

  it("reports an ERROR instead of throwing when the read errors", async () => {
    const fake = new FakeRedis();
    fake.failNextCall = true;
    install(fake);
    expect(await readContainmentState()).toEqual({ state: null, error: true });
  });

  it("round-trips a state written via CAS", async () => {
    const fake = new FakeRedis();
    install(fake);
    const s = state(1_000);
    expect(await writeContainmentState(s, 0)).toBe(true);
    expect(await readContainmentState()).toEqual({ state: s, error: false });
  });
});

describe("writeContainmentState (CAS)", () => {
  it("cold-start write against no prior state succeeds with basedOnVersion 0", async () => {
    const fake = new FakeRedis();
    install(fake);
    expect(await writeContainmentState(state(1_000), 0)).toBe(true);
    expect(fake.raw.get("containment:state:ver")).toBe("1000");
  });

  it("write based on the current version succeeds and advances the version", async () => {
    const fake = new FakeRedis();
    install(fake);
    await writeContainmentState(state(1_000), 0);
    expect(await writeContainmentState(state(2_000), 1_000)).toBe(true);
    expect(fake.raw.get("containment:state:ver")).toBe("2000");
  });

  it("refuses a lost-update: overlapping cycle that based its maths on a stale version loses", async () => {
    const fake = new FakeRedis();
    install(fake);
    await writeContainmentState(state(1_000), 0);
    // Cycles A and B both read version 1000. B lands first.
    expect(await writeContainmentState(state(2_000), 1_000)).toBe(true);
    // A now tries to land, still based on 1000 — must be refused untouched.
    expect(await writeContainmentState(state(1_500), 1_000)).toBe(false);
    const stored = await readContainmentState();
    expect(stored.state?.computedAt).toBe(2_000);
    expect(fake.raw.get("containment:state:ver")).toBe("2000");
  });

  it("force write recovers a cold-start wedge (stale version key over a corrupt blob)", async () => {
    const fake = new FakeRedis();
    fake.raw.set("containment:state:ver", "5000");
    fake.raw.set("containment:state", "not json at all{{");
    install(fake);
    // CAS against the wedged version fails for a cold-start writer...
    expect(await writeContainmentState(state(6_000), 0)).toBe(false);
    // ...force write clears the wedge and re-aligns both keys.
    expect(await forceWriteContainmentState(state(6_000))).toBe(true);
    expect(fake.raw.get("containment:state:ver")).toBe("6000");
    expect(await readContainmentState()).toEqual({
      state: state(6_000),
      error: false,
    });
  });

  it("returns false without throwing when Redis is unavailable", async () => {
    install(null);
    expect(await writeContainmentState(state(1_000), 0)).toBe(false);
  });

  it("returns false without throwing when the eval errors", async () => {
    const fake = new FakeRedis();
    fake.failNextCall = true;
    install(fake);
    expect(await writeContainmentState(state(1_000), 0)).toBe(false);
  });
});

describe("last-good copies", () => {
  it("round-trips an envelope with the DTO's own provenance", async () => {
    const fake = new FakeRedis();
    install(fake);
    const dto = { ordering: "top-weekly", rows: [{ slug: "a", rank: 1 }] };
    expect(
      await writeLastGood("openrouter-rankings", dto, "2026-07-04T10:00:00Z", 5_000),
    ).toBe(true);
    const got = await readLastGood<typeof dto>("openrouter-rankings");
    expect(got).toEqual({
      data: dto,
      provenance: "2026-07-04T10:00:00Z",
      capturedAt: 5_000,
    });
  });

  it("returns null for a missing source", async () => {
    install(new FakeRedis());
    expect(await readLastGood("nope")).toBeNull();
  });

  it("returns null on a malformed envelope (missing provenance)", async () => {
    const fake = new FakeRedis();
    fake.raw.set(
      "containment:lastgood:openrouter-rankings",
      JSON.stringify({ data: {}, capturedAt: 5 }),
    );
    install(fake);
    expect(await readLastGood("openrouter-rankings")).toBeNull();
  });

  it("degrades to false/null when Redis is unavailable", async () => {
    install(null);
    expect(await writeLastGood("x", {}, "t", 1)).toBe(false);
    expect(await readLastGood("x")).toBeNull();
  });
});
