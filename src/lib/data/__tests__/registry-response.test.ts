/**
 * The body `/api/v1/sources` and `/api/registry` share.
 *
 * Both endpoints returned the entire registry with every verbatim file sample
 * — 38,451,538 bytes each, measured 2026-09-18, identical to the byte because
 * they duplicated the same read. These tests pin the paged contract AND the
 * things that must NOT change with it: `degraded` still means "could not
 * read", a count is never invented, and the sample stays reachable.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RegistryEntry, RegistryMeta } from "@/lib/data/registry-shared";

const readEntriesPage = vi.fn();
const readEntry = vi.fn();
const readMeta = vi.fn();
const countEntries = vi.fn();

vi.mock("@/lib/data/repo-registry", async () => {
  const shared = await import("@/lib/data/registry-shared");
  return {
    ...shared,
    readEntriesPage: (o: unknown) => readEntriesPage(o),
    readEntry: (n: string) => readEntry(n),
    readMeta: () => readMeta(),
    countEntries: () => countEntries(),
  };
});

import {
  buildRegistryBody,
  isDetailBody,
  responseCount,
} from "@/lib/data/registry-response";

function entry(fullName: string, sample = "# CLAUDE.md\n\nrules"): RegistryEntry {
  const [owner, name] = fullName.split("/");
  return {
    fullName,
    owner,
    name,
    firstSeen: "2026-01-01T00:00:00.000Z",
    lastActivity: "2026-09-01T00:00:00.000Z",
    stars: 42,
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

const META: RegistryMeta = {
  totalEntries: 31764,
  verifiedEntries: 31764,
  lastDiscoveryRun: "2026-09-18T05:55:36.882Z",
  lastDiscoverySource: "cron-backfill",
  failures: [],
};

const url = (qs = "") => new URL(`https://gawk.dev/api/v1/sources${qs}`);

beforeEach(() => {
  readEntriesPage.mockReset();
  readEntry.mockReset();
  readMeta.mockReset();
  countEntries.mockReset();
  readMeta.mockResolvedValue(META);
  countEntries.mockResolvedValue(31764);
});

describe("list — a page, not the corpus", () => {
  beforeEach(() => {
    readEntriesPage.mockResolvedValue({
      ok: true,
      entries: [entry("a/one"), entry("b/two")],
      nextCursor: "512",
    });
  });

  it("defaults to 100 per page and starts at cursor 0", async () => {
    const body = await buildRegistryBody(url());

    expect(readEntriesPage).toHaveBeenCalledWith({ cursor: "0", limit: 100 });
    expect(isDetailBody(body)).toBe(false);
    if (isDetailBody(body)) return;
    expect(body.page.limit).toBe(100);
    expect(body.page.cursor).toBe("0");
  });

  it("strips `sample` from every listed config — the 58.6% of the weight", async () => {
    const body = await buildRegistryBody(url());
    if (isDetailBody(body)) throw new Error("expected a list");

    for (const e of body.entries) {
      for (const c of e.configs) expect(c).not.toHaveProperty("sample");
    }
    // Everything else survives: this is a projection, not a summary.
    expect(body.entries[0].fullName).toBe("a/one");
    expect(body.entries[0].stars).toBe(42);
    expect(body.entries[0].configs[0].path).toBe("CLAUDE.md");
  });

  it("hands back the cursor for the next page and clamps the limit", async () => {
    const body = await buildRegistryBody(url("?cursor=512&limit=999999"));
    if (isDetailBody(body)) throw new Error("expected a list");

    expect(readEntriesPage).toHaveBeenCalledWith({ cursor: "512", limit: 1000 });
    expect(body.page.cursor).toBe("512");
    expect(body.page.nextCursor).toBe("512");
  });

  it("carries the corpus total separately from this page's length", async () => {
    const body = await buildRegistryBody(url());
    if (isDetailBody(body)) throw new Error("expected a list");

    // The distinction a client MUST be able to make: 2 here, 31,764 in all.
    expect(body.entries).toHaveLength(2);
    expect(body.page.total).toBe(31764);
    expect(responseCount(body)).toBe(2);
  });

  it("keeps every key the old response carried", async () => {
    const body = await buildRegistryBody(url());
    expect(Object.keys(body).sort()).toEqual(
      [
        "degraded",
        "degradedReason",
        "entries",
        "generatedAt",
        "meta",
        "ok",
        "page",
      ].sort(),
    );
  });
});

describe("list — degraded still means 'could not read', never 'empty'", () => {
  it("sets degraded with the reason, and a null total is not a zero", async () => {
    readEntriesPage.mockResolvedValue({
      ok: false,
      reason: "absent",
      message: "key gone",
    });
    countEntries.mockResolvedValue(null);

    const body = await buildRegistryBody(url());
    if (isDetailBody(body)) throw new Error("expected a list");

    expect(body.degraded).toBe(true);
    expect(body.degradedReason).toBe("absent");
    expect(body.entries).toEqual([]);
    // A count nobody measured is the 2026-06-05 incident. Null, not 0.
    expect(body.page.total).toBe(null);
    expect(body.page.nextCursor).toBe(null);
  });

  it("reports a healthy empty page as NOT degraded", async () => {
    // An empty middle page is ordinary SCAN behaviour.
    readEntriesPage.mockResolvedValue({
      ok: true,
      entries: [],
      nextCursor: "900",
    });

    const body = await buildRegistryBody(url("?cursor=512"));
    if (isDetailBody(body)) throw new Error("expected a list");

    expect(body.degraded).toBe(false);
    expect(body.page.nextCursor).toBe("900");
  });
});

describe("?repo= — the sample survives, per repo", () => {
  it("returns the FULL entry including configs[].sample", async () => {
    readEntry.mockResolvedValue(entry("NVIDIA/cuopt", "the quote"));

    const body = await buildRegistryBody(url("?repo=NVIDIA/cuopt"));

    expect(readEntry).toHaveBeenCalledWith("NVIDIA/cuopt");
    expect(isDetailBody(body)).toBe(true);
    if (!isDetailBody(body)) return;
    // The trust contract: "this is WHY we counted it" is still reachable.
    expect(body.entry?.configs[0].sample).toBe("the quote");
    expect(body.repo).toBe("NVIDIA/cuopt");
    expect(responseCount(body)).toBe(1);
  });

  it("does not read a page when asked for one repo", async () => {
    readEntry.mockResolvedValue(entry("a/one"));
    await buildRegistryBody(url("?repo=a/one"));
    expect(readEntriesPage).not.toHaveBeenCalled();
  });

  it("distinguishes 'not registered' (measured) from 'could not read'", async () => {
    readEntry.mockResolvedValue(null);

    const body = await buildRegistryBody(url("?repo=nobody/here"));
    if (!isDetailBody(body)) throw new Error("expected a detail");

    expect(body.entry).toBe(null);
    expect(body.degraded).toBe(false);
    expect(responseCount(body)).toBe(0);
  });

  it("treats a blank ?repo= as a list request rather than an empty lookup", async () => {
    readEntriesPage.mockResolvedValue({
      ok: true,
      entries: [entry("a/one")],
      nextCursor: null,
    });

    const body = await buildRegistryBody(url("?repo=%20"));

    expect(isDetailBody(body)).toBe(false);
    expect(readEntry).not.toHaveBeenCalled();
  });
});
