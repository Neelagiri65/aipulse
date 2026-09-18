/**
 * `readEntriesPage` / `countEntries` — the paged read behind the public
 * registry endpoints.
 *
 * The defect these replace: `/api/v1/sources` and `/api/registry` both called
 * `readAllEntriesDetailed`, which walks the ENTIRE hash. Measured 2026-09-18:
 * 31,764 entries, 38,451,538 bytes, 25–30s per response, ~318 HSCAN commands
 * against Upstash for every uncached request, growing ~520 entries a day.
 *
 * The rule each test pins is that ONE page costs ONE command. A page reader
 * that quietly walked the whole hash and sliced the result would pass every
 * shape assertion and fix nothing — so the command count is asserted, not
 * assumed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RegistryEntry } from "@/lib/data/registry-shared";

const hscan = vi.fn();
const hlen = vi.fn();
const hget = vi.fn();

vi.mock("@upstash/redis", () => ({
  Redis: class {
    hscan = hscan;
    hlen = hlen;
    hget = hget;
  },
}));

async function loadStore(configured = true) {
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

function entry(fullName: string, sample = "# CLAUDE.md\n\nrules"): RegistryEntry {
  const [owner, name] = fullName.split("/");
  return {
    fullName,
    owner,
    name,
    firstSeen: "2026-01-01T00:00:00.000Z",
    lastActivity: "2026-09-01T00:00:00.000Z",
    configs: [
      {
        kind: "claude-md",
        path: "CLAUDE.md",
        sample,
        score: 1,
        verifiedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}

/** One HSCAN reply: [nextCursor, [field, value, field, value, ...]]. */
function page(next: string, entries: RegistryEntry[]): [string, string[]] {
  return [next, entries.flatMap((e) => [e.fullName, JSON.stringify(e)])];
}

const ENV = { ...process.env };

beforeEach(() => {
  hscan.mockReset();
  hlen.mockReset();
  hget.mockReset();
});

afterEach(() => {
  process.env = { ...ENV };
});

describe("readEntriesPage — one page costs one command", () => {
  it("issues exactly ONE hscan, whatever the corpus size", async () => {
    hscan.mockResolvedValueOnce(page("512", [entry("a/one"), entry("b/two")]));
    const store = await loadStore();

    const res = await store.readEntriesPage({ limit: 2 });

    // The regression guard. A reader that walked the hash and sliced would
    // call hscan until the cursor came back to "0" — here, many times.
    expect(hscan).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entries.map((e) => e.fullName)).toEqual(["a/one", "b/two"]);
  });

  it("passes the caller's cursor and limit straight through to Redis", async () => {
    hscan.mockResolvedValueOnce(page("0", [entry("a/one")]));
    const store = await loadStore();

    await store.readEntriesPage({ cursor: "512", limit: 250 });

    expect(hscan).toHaveBeenCalledWith("aipulse:registry:entries", "512", {
      count: 250,
    });
  });

  it("starts at cursor 0 when none is given, or when it is blank", async () => {
    hscan.mockResolvedValue(page("0", [entry("a/one")]));
    const store = await loadStore();

    await store.readEntriesPage({});
    await store.readEntriesPage({ cursor: "" });
    await store.readEntriesPage({ cursor: "   " });

    for (const call of hscan.mock.calls) expect(call[1]).toBe("0");
  });

  it("reports nextCursor null ONLY when the walk is complete", async () => {
    hscan.mockResolvedValueOnce(page("768", [entry("a/one")]));
    const store = await loadStore();
    const mid = await store.readEntriesPage({});
    expect(mid.ok && mid.nextCursor).toBe("768");

    hscan.mockResolvedValueOnce(page("0", [entry("b/two")]));
    const last = await store.readEntriesPage({ cursor: "768" });
    expect(last.ok && last.nextCursor).toBe(null);
  });

  it("treats an empty MIDDLE page as ordinary SCAN behaviour, not as absent", async () => {
    // Redis may return a page with no fields and a live cursor. Reading that
    // as "the registry is gone" would publish a degraded state on a healthy
    // store — the inverse of the 2026-06-05 zero.
    hscan.mockResolvedValueOnce(["900", []]);
    const store = await loadStore();

    const res = await store.readEntriesPage({ cursor: "512" });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entries).toEqual([]);
    expect(res.nextCursor).toBe("900");
  });

  it("reports `absent` when the FIRST page completes the scan with nothing", async () => {
    hscan.mockResolvedValueOnce(["0", []]);
    const store = await loadStore();

    const res = await store.readEntriesPage({});

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("absent");
  });

  it("reports `unconfigured` without touching Redis", async () => {
    const store = await loadStore(false);

    const res = await store.readEntriesPage({});

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("unconfigured");
    expect(hscan).not.toHaveBeenCalled();
  });

  it("reports `error` when the scan throws, and never a partial page", async () => {
    hscan.mockRejectedValueOnce(new Error("quota exceeded"));
    const store = await loadStore();

    const res = await store.readEntriesPage({});

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("error");
    expect(res.message).toContain("quota");
  });

  it("skips a corrupt field rather than failing the page", async () => {
    hscan.mockResolvedValueOnce([
      "0",
      ["a/one", JSON.stringify(entry("a/one")), "b/bad", "{not json"],
    ]);
    const store = await loadStore();

    const res = await store.readEntriesPage({});

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entries.map((e) => e.fullName)).toEqual(["a/one"]);
  });

  it("sanitises a half-emoji left by the 500-character cap", async () => {
    hscan.mockResolvedValueOnce(
      page("0", [entry("NVIDIA/cuopt", "flow.\n\n> **\uD83D")]),
    );
    const store = await loadStore();

    const res = await store.readEntriesPage({});

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entries[0].configs[0].sample).toBe("flow.\n\n> **");
  });
});

describe("countEntries — the corpus size, one HLEN", () => {
  it("returns the count from a single hlen", async () => {
    hlen.mockResolvedValueOnce(31764);
    const store = await loadStore();

    expect(await store.countEntries()).toBe(31764);
    expect(hlen).toHaveBeenCalledTimes(1);
    expect(hlen).toHaveBeenCalledWith("aipulse:registry:entries");
  });

  it("returns null — never 0 — when the store is unreachable", async () => {
    hlen.mockRejectedValueOnce(new Error("network"));
    const store = await loadStore();
    expect(await store.countEntries()).toBe(null);

    const unconfigured = await loadStore(false);
    expect(await unconfigured.countEntries()).toBe(null);
  });
});

describe("readEntry — the detail path still carries the sample", () => {
  it("returns the full entry, sample included but sanitised", async () => {
    hget.mockResolvedValueOnce(
      JSON.stringify(entry("NVIDIA/cuopt", "quote\uD83D")),
    );
    const store = await loadStore();

    const res = await store.readEntry("NVIDIA/cuopt");

    expect(hget).toHaveBeenCalledTimes(1);
    expect(res?.configs[0].sample).toBe("quote");
  });

  it("returns null for a repo that is not in the registry", async () => {
    hget.mockResolvedValueOnce(null);
    const store = await loadStore();
    expect(await store.readEntry("nobody/here")).toBe(null);
  });
});
