/**
 * Registry store — degraded-read + integrity-guard contract.
 *
 * These tests encode the 2026-06-05 incident as executable rules. On that
 * day `registry.total` went 9,670 → 0 in a single tick, every collector
 * recorded `failures: []`, and 42 subsequent archived days carried a
 * `registry.total: 0` that nobody had measured. Each `it()` below pins one
 * link in that chain so it cannot re-form.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RegistryEntry, RegistryMeta } from "@/lib/data/registry-shared";

// ---------------------------------------------------------------------------
// Redis double. `repo-registry` builds `new Redis({url, token})` lazily and
// caches it, so the module is re-imported per test with the env already set.
// ---------------------------------------------------------------------------

const hscan = vi.fn();

/**
 * Drive the `hscan` double from a plain `{field: value}` record, splitting
 * it into pages the way Redis would. `null` models an absent key: a
 * completed scan that yielded nothing.
 *
 * Reads page through HSCAN rather than calling HGETALL (the entries hash
 * outgrew Upstash's 10MB response cap), so the double has to page too —
 * a single-shot mock would let a pagination bug pass.
 */
function mockHash(record: Record<string, unknown> | null, pageSize = 2) {
  const fields = Object.entries(record ?? {});
  const pages: Array<[string, (string | number)[]]> = [];
  for (let i = 0; i < fields.length; i += pageSize) {
    const slice = fields.slice(i, i + pageSize);
    const flat = slice.flat() as (string | number)[];
    const isLast = i + pageSize >= fields.length;
    // Redis signals "scan complete" by returning to cursor 0.
    pages.push([isLast ? "0" : String(i + pageSize), flat]);
  }
  if (pages.length === 0) pages.push(["0", []]);

  hscan.mockReset();
  for (const page of pages) hscan.mockResolvedValueOnce(page);
  // Any extra call past the scripted pages is a completed, empty scan.
  hscan.mockResolvedValue(["0", []]);
  return pages;
}
const hset = vi.fn(async () => 1);
const persist = vi.fn(async () => 1);
const expire = vi.fn(async () => 1);
// Explicit signatures so the assertions below can inspect call args.
const set =
  vi.fn<(key: string, value: string, opts?: unknown) => Promise<string>>();
const get = vi.fn<(key: string) => Promise<string | null>>();

vi.mock("@upstash/redis", () => ({
  Redis: class {
    hscan = hscan;
    hset = hset;
    persist = persist;
    expire = expire;
    set = set;
    get = get;
  },
}));

async function loadStore(configured: boolean = true) {
  vi.resetModules();
  if (configured) {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.invalid";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
  } else {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
  return import("@/lib/data/repo-registry");
}

function entry(fullName: string): RegistryEntry {
  const [owner, name] = fullName.split("/");
  return {
    fullName,
    owner,
    name,
    firstSeen: "2026-01-01T00:00:00.000Z",
    lastActivity: "2026-01-02T00:00:00.000Z",
    configs: [
      {
        kind: "claude-md",
        path: "CLAUDE.md",
        sample: "# CLAUDE.md",
        score: 1,
        verifiedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}

function meta(total: number): RegistryMeta {
  return {
    totalEntries: total,
    verifiedEntries: total,
    lastDiscoveryRun: "2026-06-03T00:00:00.000Z",
    lastDiscoverySource: "code-search",
    failures: [],
  };
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  set.mockResolvedValue("OK");
  get.mockResolvedValue(null);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// ---------------------------------------------------------------------------

describe("readAllEntriesDetailed — paging survives a hash too big for one response", () => {
  /**
   * The 2026-08-27 incident. `HGETALL` on the entries hash returned 25.8MB
   * against Upstash's 10MB response cap, so the call threw and every
   * registry reader went down at once — the public API served
   * `degraded` for eight days while discovery silently lost `skipKnown`
   * dedup. These pin the paged read that replaced it.
   */

  it("assembles entries across multiple pages, not just the first", async () => {
    const store = await loadStore();
    // 5 entries at pageSize 2 => 3 pages. A single-shot read sees 2.
    const names = ["a/1", "a/2", "a/3", "a/4", "a/5"];
    mockHash(
      Object.fromEntries(names.map((n) => [n, JSON.stringify(entry(n))])),
      2,
    );

    const read = await store.readAllEntriesDetailed();

    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error("unreachable");
    expect(read.entries.map((e) => e.fullName).sort()).toEqual(names);
    expect(hscan).toHaveBeenCalledTimes(3);
  });

  it("follows the cursor rather than stopping after one call", async () => {
    const store = await loadStore();
    mockHash(
      Object.fromEntries(
        ["a/1", "a/2", "a/3", "a/4"].map((n) => [n, JSON.stringify(entry(n))]),
      ),
      1,
    );

    await store.readAllEntriesDetailed();

    // Cursor 0 -> 1 -> 2 -> 3, terminating when the reply returns "0".
    expect(hscan.mock.calls.map((c) => String(c[1]))).toEqual([
      "0",
      "1",
      "2",
      "3",
    ]);
  });

  it("counts a field returned twice mid-scan only once", async () => {
    const store = await loadStore();
    // Discovery writes every 6h; a concurrent write can make HSCAN emit
    // the same field on two pages. Double-counting it would inflate a
    // published total.
    hscan.mockReset();
    hscan.mockResolvedValueOnce(["1", ["a/1", JSON.stringify(entry("a/1"))]]);
    hscan.mockResolvedValueOnce(["0", ["a/1", JSON.stringify(entry("a/1"))]]);

    const read = await store.readAllEntriesDetailed();

    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error("unreachable");
    expect(read.entries).toHaveLength(1);
  });

  it("reports `error` when the scan dies partway, never a partial success", async () => {
    const store = await loadStore();
    hscan.mockReset();
    hscan.mockResolvedValueOnce(["1", ["a/1", JSON.stringify(entry("a/1"))]]);
    hscan.mockRejectedValueOnce(new Error("ERR max request size exceeded"));

    const read = await store.readAllEntriesDetailed();

    // Half a registry is the number-that-looks-like-a-measurement this
    // module exists to prevent — the partial page must not surface as ok.
    expect(read.ok).toBe(false);
    if (read.ok) throw new Error("unreachable");
    expect(read.reason).toBe("error");
    expect(read.message).toContain("max request size exceeded");
  });

  it("gives up instead of spinning when the cursor never returns to 0", async () => {
    const store = await loadStore();
    hscan.mockReset();
    hscan.mockResolvedValue(["99", ["a/1", JSON.stringify(entry("a/1"))]]);

    const read = await store.readAllEntriesDetailed();

    expect(read.ok).toBe(false);
    if (read.ok) throw new Error("unreachable");
    expect(read.reason).toBe("error");
    expect(read.message).toMatch(/did not return to 0/);
  });
});

// ---------------------------------------------------------------------------

describe("readAllEntriesDetailed — an absent key is not an empty registry", () => {
  it("reports `absent` when the key is gone, instead of an empty success", async () => {
    const store = await loadStore();
    mockHash(null);

    const read = await store.readAllEntriesDetailed();

    expect(read.ok).toBe(false);
    if (read.ok) throw new Error("unreachable");
    // The 2026-06-05 signature. This case had to become distinguishable,
    // because it is what decided whether the day's snapshot published
    // `total: 0` or `registry: null`.
    expect(read.reason).toBe("absent");
  });

  it("treats an empty hash as absent too — a live hash always has fields", async () => {
    const store = await loadStore();
    mockHash({});

    const read = await store.readAllEntriesDetailed();

    expect(read.ok).toBe(false);
    if (read.ok) throw new Error("unreachable");
    expect(read.reason).toBe("absent");
  });

  it("reports `error` when the read throws, carrying the message", async () => {
    const store = await loadStore();
    hscan.mockRejectedValue(new Error("max daily request limit exceeded"));

    const read = await store.readAllEntriesDetailed();

    expect(read.ok).toBe(false);
    if (read.ok) throw new Error("unreachable");
    expect(read.reason).toBe("error");
    expect(read.message).toContain("max daily request limit exceeded");
  });

  it("reports `unconfigured` with no Redis env, without touching a client", async () => {
    const store = await loadStore(false);

    const read = await store.readAllEntriesDetailed();

    expect(read.ok).toBe(false);
    if (read.ok) throw new Error("unreachable");
    expect(read.reason).toBe("unconfigured");
    expect(hscan).not.toHaveBeenCalled();
  });

  it("reports `corrupt` when fields exist but none parse", async () => {
    const store = await loadStore();
    mockHash({
      "a/b": "{not json",
      "c/d": '{"no":"fullName"}',
    });

    const read = await store.readAllEntriesDetailed();

    expect(read.ok).toBe(false);
    if (read.ok) throw new Error("unreachable");
    expect(read.reason).toBe("corrupt");
  });

  it("succeeds with parsed entries, skipping individual bad fields", async () => {
    const store = await loadStore();
    mockHash({
      "a/b": JSON.stringify(entry("a/b")),
      "c/d": "{not json",
    });

    const read = await store.readAllEntriesDetailed();

    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error("unreachable");
    expect(read.entries.map((e) => e.fullName)).toEqual(["a/b"]);
  });
});

describe("readAllEntries — fail-soft wrapper unchanged for render paths", () => {
  it("still returns [] on every degraded reason", async () => {
    const store = await loadStore();
    for (const outcome of [null, {}, undefined]) {
      mockHash(outcome);
      expect(await store.readAllEntries()).toEqual([]);
    }
    hscan.mockRejectedValue(new Error("boom"));
    expect(await store.readAllEntries()).toEqual([]);
  });
});

describe("storage — the corpus no longer carries a whole-dataset TTL", () => {
  it("upsertEntries persists the key and never sets an expiry", async () => {
    const store = await loadStore();

    await store.upsertEntries([entry("a/b")]);

    expect(hset).toHaveBeenCalledTimes(1);
    // `persist` clears the legacy 14-day TTL still attached to the
    // production key. `expire` must never be called again — one key
    // holding the whole corpus behind an expiry is what lost it.
    expect(persist).toHaveBeenCalledTimes(1);
    expect(expire).not.toHaveBeenCalled();
  });

  it("writeMeta stores without an `ex` option", async () => {
    const store = await loadStore();

    await store.writeMeta(meta(10));

    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0]).toHaveLength(2); // key, value — no options arg
  });
});

describe("assessRegistryShrink", () => {
  it("flags a collapse past the floor", async () => {
    const store = await loadStore();

    const res = store.assessRegistryShrink(0, meta(9670));

    expect(res.shrunk).toBe(true);
    if (!res.shrunk) throw new Error("unreachable");
    expect(res.message).toContain("9670 → 0");
    expect(res.message).toContain("−100%");
  });

  it("flags the live post-incident state: 586 against a 9,670 baseline", async () => {
    const store = await loadStore();
    expect(store.assessRegistryShrink(586, meta(9670)).shrunk).toBe(true);
  });

  it("permits ordinary churn — deletions, renames, repos going private", async () => {
    const store = await loadStore();
    expect(store.assessRegistryShrink(9500, meta(9670)).shrunk).toBe(false);
    expect(store.assessRegistryShrink(9999, meta(9670)).shrunk).toBe(false);
  });

  it("sits exactly on the floor without flagging (boundary is inclusive)", async () => {
    const store = await loadStore();
    expect(store.assessRegistryShrink(50, meta(100)).shrunk).toBe(false);
    expect(store.assessRegistryShrink(49, meta(100)).shrunk).toBe(true);
  });

  it("cannot flag against no baseline — a first-ever run is not a collapse", async () => {
    const store = await loadStore();
    expect(store.assessRegistryShrink(0, null).shrunk).toBe(false);
    expect(store.assessRegistryShrink(0, meta(0)).shrunk).toBe(false);
  });
});

describe("finaliseRegistryMeta — the guard that makes the loss visible", () => {
  it("a degraded read does NOT overwrite meta, preserving the baseline", async () => {
    const store = await loadStore();
    mockHash(null); // key evicted

    const res = await store.finaliseRegistryMeta({
      source: "code-search",
      runAt: "2026-06-05T00:00:00.000Z",
      failures: [],
    });

    // The precise 2026-06-05 regression: the old code read [], wrote
    // `totalEntries: 0`, and destroyed the only surviving evidence of
    // 9,670 in the same tick that lost the entries.
    expect(set).not.toHaveBeenCalled();
    expect(res.wrote).toBe(false);
    expect(res.ok).toBe(false);
    expect(res.totalEntries).toBeNull();
    expect(res.addedFailures).toHaveLength(1);
    expect(res.addedFailures[0].step).toBe("registry-read");
    expect(res.addedFailures[0].message).toContain("absent");
  });

  it("a collapse that DOES read back is written, but recorded as a failure", async () => {
    const store = await loadStore();
    mockHash({ "a/b": JSON.stringify(entry("a/b")) });
    get.mockResolvedValue(JSON.stringify(meta(9670)));

    const res = await store.finaliseRegistryMeta({
      source: "code-search",
      runAt: "2026-06-05T00:00:00.000Z",
      failures: [],
    });

    expect(res.wrote).toBe(true); // 1 entry is a real observation
    expect(res.ok).toBe(false); // …and an integrity event
    expect(res.totalEntries).toBe(1);
    expect(res.addedFailures[0].step).toBe("registry-integrity");

    const written = JSON.parse(set.mock.calls[0][1]) as RegistryMeta;
    expect(written.totalEntries).toBe(1);
    // Persisted in meta, not merely returned — the evidence outlives the
    // process that noticed it.
    expect(written.failures.some((f) => f.step === "registry-integrity")).toBe(
      true,
    );
  });

  it("a healthy run writes clean meta and adds nothing", async () => {
    const store = await loadStore();
    mockHash({
      "a/b": JSON.stringify(entry("a/b")),
      "c/d": JSON.stringify(entry("c/d")),
    });
    get.mockResolvedValue(JSON.stringify(meta(2)));

    const res = await store.finaliseRegistryMeta({
      source: "topics",
      runAt: "2026-08-01T00:00:00.000Z",
      failures: [],
    });

    expect(res.ok).toBe(true);
    expect(res.totalEntries).toBe(2);
    expect(res.addedFailures).toEqual([]);
    const written = JSON.parse(set.mock.calls[0][1]) as RegistryMeta;
    expect(written.totalEntries).toBe(2);
    expect(written.lastDiscoverySource).toBe("topics");
    expect(written.lastDiscoveryRun).toBe("2026-08-01T00:00:00.000Z");
  });

  it("carries the caller's own failures into meta alongside its own", async () => {
    const store = await loadStore();
    mockHash({ "a/b": JSON.stringify(entry("a/b")) });

    await store.finaliseRegistryMeta({
      source: "deps",
      runAt: "2026-08-01T00:00:00.000Z",
      failures: [{ step: "ecosystems", message: "429" }],
    });

    const written = JSON.parse(set.mock.calls[0][1]) as RegistryMeta;
    expect(written.failures.map((f) => f.step)).toContain("ecosystems");
  });
});

describe("hasRegistryIntegrityFailure", () => {
  it("is true for store-integrity steps only", async () => {
    const store = await loadStore();
    expect(
      store.hasRegistryIntegrityFailure([
        { step: "registry-read", message: "absent" },
      ]),
    ).toBe(true);
    expect(
      store.hasRegistryIntegrityFailure([
        { step: "registry-integrity", message: "shrank" },
      ]),
    ).toBe(true);
  });

  it("is false for ordinary upstream failures — those stay partial successes", async () => {
    const store = await loadStore();
    expect(
      store.hasRegistryIntegrityFailure([
        { step: "search", message: "GitHub 502 on one query kind" },
      ]),
    ).toBe(false);
    expect(store.hasRegistryIntegrityFailure([])).toBe(false);
  });
});
