import { describe, expect, it, vi } from "vitest";
import {
  GET,
  handleGetSdkAdoption,
  type SdkAdoptionDeps,
} from "@/app/api/panels/sdk-adoption/route";
import type { DailySnapshot, SnapshotPackages } from "@/lib/data/snapshot";
import type { PackageLatest } from "@/lib/data/pkg-store";

function makeSnapshot(date: string, packages: SnapshotPackages): DailySnapshot {
  return {
    date,
    capturedAt: `${date}T04:00:00Z`,
    sources: { total: 0, verified: 0, pending: 0 },
    registry: null,
    events24h: null,
    tools: [],
    benchmarks: null,
    packages,
    labs: null,
    labs24h: null,
  };
}

function makeLatest(
  source: string,
  counters: PackageLatest["counters"],
): PackageLatest {
  return {
    source,
    fetchedAt: "2026-04-25T04:00:00Z",
    counters,
    failures: [],
  };
}

function depsFromFixture(opts: {
  pypi?: PackageLatest | null;
  npm?: PackageLatest | null;
  crates?: PackageLatest | null;
  docker?: PackageLatest | null;
  brew?: PackageLatest | null;
  snapshots?: DailySnapshot[];
  today?: string;
  now?: Date;
}): SdkAdoptionDeps {
  const map: Record<string, PackageLatest | null | undefined> = {
    pypi: opts.pypi,
    npm: opts.npm,
    crates: opts.crates,
    docker: opts.docker,
    brew: opts.brew,
  };
  return {
    readLatest: vi.fn(async (source: string) => map[source] ?? null),
    readRecentSnapshots: vi.fn(async (_limit: number) => opts.snapshots ?? []),
    ymdUtc: () => opts.today ?? "2026-04-25",
    now: () => opts.now ?? new Date("2026-04-25T12:00:00Z"),
  };
}

describe("handleGetSdkAdoption", () => {
  it("returns assembled DTO with expected cache header", async () => {
    const deps = depsFromFixture({
      pypi: makeLatest("pypi", { transformers: { lastDay: 1000 } }),
      snapshots: [
        makeSnapshot("2026-04-25", {
          pypi: [{ name: "transformers", lastDay: 1000 }],
        }),
      ],
    });
    const req = new Request("https://gawk.dev/api/panels/sdk-adoption");
    const { dto, cacheHeader } = await handleGetSdkAdoption(req, deps);
    expect(dto.packages).toHaveLength(1);
    expect(dto.packages[0].id).toBe("pypi:transformers");
    expect(cacheHeader).toBe("public, s-maxage=300, stale-while-revalidate=60");
  });

  it("returns empty DTO when no latest blobs and no snapshots exist", async () => {
    const deps = depsFromFixture({});
    const req = new Request("https://gawk.dev/api/panels/sdk-adoption");
    const { dto } = await handleGetSdkAdoption(req, deps);
    expect(dto.packages).toEqual([]);
    expect(dto.generatedAt).toBeTruthy();
  });

  it("survives when some sources are missing — returns only the available rows", async () => {
    const deps = depsFromFixture({
      pypi: makeLatest("pypi", { openai: { lastDay: 100 } }),
      npm: null,
      crates: makeLatest("crates", { burn: { allTime: 50 } }),
    });
    const req = new Request("https://gawk.dev/api/panels/sdk-adoption");
    const { dto } = await handleGetSdkAdoption(req, deps);
    const ids = dto.packages.map((p) => p.id).sort();
    expect(ids).toEqual(["crates:burn", "pypi:openai"]);
  });

  it("requests snapshotLimit = windowDays + 1 for the leading-edge derived diff", async () => {
    const readRecentSnapshots = vi.fn(async (_limit: number) => [] as DailySnapshot[]);
    const deps: SdkAdoptionDeps = {
      readLatest: vi.fn(async () => null),
      readRecentSnapshots,
      ymdUtc: () => "2026-04-25",
      now: () => new Date("2026-04-25T12:00:00Z"),
    };
    const req = new Request(
      "https://gawk.dev/api/panels/sdk-adoption?window=14",
    );
    await handleGetSdkAdoption(req, deps);
    expect(readRecentSnapshots).toHaveBeenCalledWith(15);
  });

  it("clamps window and baseline to 1..60", async () => {
    const deps = depsFromFixture({});
    const req = new Request(
      "https://gawk.dev/api/panels/sdk-adoption?window=999&baseline=0",
    );
    const { dto } = await handleGetSdkAdoption(req, deps);
    // No throw, returns a DTO.
    expect(dto.packages).toEqual([]);
  });

  it("GET returns JSON with Cache-Control header", async () => {
    const req = new Request("https://gawk.dev/api/panels/sdk-adoption");
    const res = await GET(req);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=60",
    );
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = await res.json();
    expect(body).toHaveProperty("packages");
    expect(body).toHaveProperty("generatedAt");
  });
});
