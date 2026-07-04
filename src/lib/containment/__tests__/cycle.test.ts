import { afterEach, describe, expect, it } from "vitest";

import type { Redis } from "@upstash/redis";
import type { RunnableSpec } from "@/lib/integrity/run";

import { runContainmentCycle } from "../cycle";
import { __setRedisOverrideForTests } from "../store";
import type { ContainmentState } from "../types";

/** Minimal fake of the upstash surface the store uses (get/set/eval-CAS). */
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

const NOW = Date.parse("2026-07-04T12:00:00Z");
const FRESH_AT = new Date(NOW - 60_000).toISOString();

/** One probe spec: rows must exist, be fresh, and count within [1, 10]. */
function spec(): RunnableSpec {
  return {
    id: "openrouter-rankings",
    url: "https://example.test/api/rankings",
    extract: (p) => {
      const o = p as { generatedAt?: string; rows?: unknown[] };
      if (!Array.isArray(o.rows)) throw new Error("rows missing");
      return {
        observedAt: o.generatedAt ?? null,
        records: o.rows as Array<Record<string, unknown>>,
      };
    },
    contract: { maxAgeMinutes: 60, floor: 1, expectedMin: 1, expectedMax: 10 },
  };
}

function healthyDto(generatedAt = FRESH_AT): unknown {
  return { generatedAt, rows: [{ slug: "a" }, { slug: "b" }] };
}

/** 20 rows breaches expectedMax 10 — a sanity-range (hard) violation. */
function breachingDto(): unknown {
  return {
    generatedAt: FRESH_AT,
    rows: Array.from({ length: 20 }, (_, i) => ({ slug: String(i) })),
  };
}

/** Fetcher returning queued responses in order; an Error entry throws. */
function sequencedFetcher(responses: Array<unknown>): () => Promise<unknown> {
  let i = 0;
  return async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (r instanceof Error) throw r;
    return r;
  };
}

function storedState(fake: FakeRedis): ContainmentState {
  return JSON.parse(fake.raw.get("containment:state")!) as ContainmentState;
}

describe("runContainmentCycle", () => {
  it("cold start: initialises state, all-pass sources go LIVE, last-good captured", async () => {
    const fake = new FakeRedis();
    install(fake);
    const result = await runContainmentCycle({
      specs: [spec()],
      fetcher: sequencedFetcher([healthyDto()]),
      now: NOW,
    });
    expect(result.aborted).toBe(false);
    expect(result.coldStart).toBe(true);
    expect(result.persisted).toBe(true);
    expect(result.transitions).toEqual([]);
    expect(result.observations[0].outcome).toBe("pass");
    expect(storedState(fake).sources["openrouter-rankings"].state).toBe("live");
    // First sighting of this provenance key → last-good copy captured.
    expect(result.lastGoodWrites).toEqual(["openrouter-rankings"]);
    const lastGood = JSON.parse(
      fake.raw.get("containment:lastgood:openrouter-rankings")!,
    );
    expect(lastGood.provenance).toBe(FRESH_AT);
    expect(lastGood.data).toEqual(healthyDto());
  });

  it("does not rewrite last-good when the provenance key is unchanged", async () => {
    const fake = new FakeRedis();
    install(fake);
    const opts = {
      specs: [spec()],
      fetcher: sequencedFetcher([healthyDto()]),
      now: NOW,
    };
    await runContainmentCycle(opts);
    const second = await runContainmentCycle({
      ...opts,
      fetcher: sequencedFetcher([healthyDto()]),
      now: NOW + 1,
    });
    expect(second.lastGoodWrites).toEqual([]);
  });

  it("torn read: a hard violation NOT reproduced by the confirmation read does not actuate", async () => {
    const fake = new FakeRedis();
    install(fake);
    const result = await runContainmentCycle({
      specs: [spec()],
      // First read breaches sanity; the immediate re-read is healthy.
      fetcher: sequencedFetcher([breachingDto(), healthyDto()]),
      now: NOW,
    });
    expect(result.unconfirmedHardFails).toEqual(["openrouter-rankings"]);
    expect(result.confirmedHardFails).toEqual([]);
    expect(result.observations[0].outcome).toBe("pass");
    expect(storedState(fake).sources["openrouter-rankings"].state).toBe("live");
  });

  it("confirmed hard violation quarantines instantly and never captures last-good", async () => {
    const fake = new FakeRedis();
    install(fake);
    const result = await runContainmentCycle({
      specs: [spec()],
      fetcher: sequencedFetcher([breachingDto(), breachingDto()]),
      now: NOW,
    });
    expect(result.confirmedHardFails).toEqual(["openrouter-rankings"]);
    expect(result.transitions).toEqual([
      {
        sourceId: "openrouter-rankings",
        from: "live",
        to: "quarantined",
        reason: expect.stringContaining("sanity"),
      },
    ]);
    expect(storedState(fake).sources["openrouter-rankings"].state).toBe(
      "quarantined",
    );
    expect(result.lastGoodWrites).toEqual([]);
    expect(fake.raw.has("containment:lastgood:openrouter-rankings")).toBe(false);
  });

  it("an unreachable source is a soft failure: SUSPECT, no confirmation re-read", async () => {
    const fake = new FakeRedis();
    install(fake);
    let calls = 0;
    const result = await runContainmentCycle({
      specs: [spec()],
      fetcher: async () => {
        calls += 1;
        throw new Error("connect timeout");
      },
      now: NOW,
    });
    expect(calls).toBe(1);
    expect(result.observations[0].outcome).toBe("soft-fail");
    expect(storedState(fake).sources["openrouter-rankings"].state).toBe(
      "suspect",
    );
  });

  it("aborts the whole cycle untouched when the state READ errors (monitoring failure)", async () => {
    const fake = new FakeRedis();
    fake.failNextCall = true;
    install(fake);
    let fetches = 0;
    const result = await runContainmentCycle({
      specs: [spec()],
      fetcher: async () => {
        fetches += 1;
        return healthyDto();
      },
      now: NOW,
    });
    expect(result.aborted).toBe(true);
    expect(result.abortReason).toContain("read failed");
    expect(fetches).toBe(0);
    expect(fake.raw.has("containment:state")).toBe(false);
  });

  it("a lost CAS write drops the cycle's transitions without corrupting the stored state", async () => {
    const fake = new FakeRedis();
    // A concurrent cycle already wrote version 9999; this cycle reads a blob
    // claiming computedAt 1000 — its CAS must lose.
    const concurrent: ContainmentState = {
      schemaVersion: 1,
      computedAt: 1_000,
      sources: {},
    };
    fake.raw.set("containment:state", JSON.stringify(concurrent));
    fake.raw.set("containment:state:ver", "9999");
    install(fake);
    const result = await runContainmentCycle({
      specs: [spec()],
      fetcher: sequencedFetcher([healthyDto()]),
      now: NOW,
    });
    expect(result.coldStart).toBe(false);
    expect(result.persisted).toBe(false);
    expect(fake.raw.get("containment:state:ver")).toBe("9999");
  });

  it("recovers a cold-start wedge: stale version key over a corrupt blob is force-written once absence is verified", async () => {
    const fake = new FakeRedis();
    fake.raw.set("containment:state:ver", "5000");
    fake.raw.set("containment:state", "corrupt{{");
    install(fake);
    const result = await runContainmentCycle({
      specs: [spec()],
      fetcher: sequencedFetcher([healthyDto()]),
      now: NOW,
    });
    expect(result.coldStart).toBe(true);
    expect(result.persisted).toBe(true);
    expect(fake.raw.get("containment:state:ver")).toBe(String(NOW));
    expect(storedState(fake).sources["openrouter-rankings"].state).toBe("live");
  });
});
