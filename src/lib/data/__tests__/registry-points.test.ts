/**
 * `/api/registry/points` — the map's registry read.
 *
 * Pins: an entry without both finite coordinates is not a point; nothing
 * from `configs` but `kind` reaches the wire; and a registry that could not
 * be read yields `degraded: true` with NULL counts, never zeros.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RegistryEntry } from "@/lib/data/registry-shared";

const readAllEntriesDetailed = vi.fn();

vi.mock("@/lib/data/repo-registry", async () => {
  const shared = await import("@/lib/data/registry-shared");
  return { ...shared, readAllEntriesDetailed: () => readAllEntriesDetailed() };
});

import { buildRegistryPointsBody, toRegistryPoint } from "@/lib/data/registry-points";

function entry(fullName: string, location?: RegistryEntry["location"]): RegistryEntry {
  const [owner, name] = fullName.split("/");
  return {
    fullName,
    owner,
    name,
    firstSeen: "2026-01-01T00:00:00.000Z",
    lastActivity: "2026-09-01T00:00:00.000Z",
    stars: 42,
    language: "TypeScript",
    description: "a repo",
    configs: [
      { kind: "claude-md", path: "CLAUDE.md", sample: "# CLAUDE.md\n\nrules", score: 1, verifiedAt: "2026-01-01T00:00:00.000Z" },
      { kind: "cursorrules", path: ".cursorrules", sample: "be terse", score: 1, verifiedAt: "2026-01-01T00:00:00.000Z" },
    ],
    location,
  };
}

const BERLIN = { lat: 52.52, lng: 13.405, label: "Berlin, Germany" };

beforeEach(() => {
  readAllEntriesDetailed.mockReset();
});

describe("toRegistryPoint", () => {
  it("drops an entry with no location", () => {
    expect(toRegistryPoint(entry("a/one"))).toBeNull();
    expect(toRegistryPoint(entry("a/one", null))).toBeNull();
  });

  it("drops an entry whose lat is finite but lng is missing or not a number", () => {
    expect(toRegistryPoint(entry("a/one", { lat: 51.5 } as never))).toBeNull();
    expect(toRegistryPoint(entry("a/one", { lat: 51.5, lng: "0.1" } as never))).toBeNull();
    expect(toRegistryPoint(entry("a/one", { lat: Number.NaN, lng: 0.1, label: "x" }))).toBeNull();
  });

  it("carries the config kinds and nothing else from configs", () => {
    const p = toRegistryPoint(entry("a/one", BERLIN));
    expect(p).not.toBeNull();
    expect(p!.kinds).toEqual(["claude-md", "cursorrules"]);
    const wire = JSON.stringify(p);
    for (const key of ["sample", "path", "score", "verifiedAt", "configs"]) {
      expect(wire).not.toContain(`"${key}"`);
    }
    expect(p).toMatchObject({ fullName: "a/one", lat: 52.52, lng: 13.405, label: "Berlin, Germany", stars: 42 });
  });
});

describe("buildRegistryPointsBody", () => {
  it("returns located points with both counts when the read succeeded", async () => {
    readAllEntriesDetailed.mockResolvedValue({
      ok: true,
      entries: [entry("a/one", BERLIN), entry("b/two"), entry("c/three", BERLIN), entry("d/four", { lat: 1 } as never)],
    });
    const body = await buildRegistryPointsBody();
    expect(body.degraded).toBe(false);
    expect(body.points.map((p) => p.fullName)).toEqual(["a/one", "c/three"]);
    expect(body.located).toBe(2);
    expect(body.corpus).toBe(4);
    expect(body.corpus!).toBeGreaterThan(body.located!);
  });

  it("is degraded with NULL counts when the registry could not be read", async () => {
    readAllEntriesDetailed.mockResolvedValue({ ok: false, reason: "absent", message: "evicted" });
    const body = await buildRegistryPointsBody();
    expect(body.degraded).toBe(true);
    expect(body.degradedReason).toBe("absent");
    expect(body.points).toEqual([]);
    expect(body.located).toBeNull();
    expect(body.corpus).toBeNull();
  });

  it("makes one full read per response", async () => {
    readAllEntriesDetailed.mockResolvedValue({ ok: true, entries: [entry("a/one", BERLIN)] });
    await buildRegistryPointsBody();
    expect(readAllEntriesDetailed).toHaveBeenCalledTimes(1);
  });
});
