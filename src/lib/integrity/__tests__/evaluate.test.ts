import { describe, expect, it } from "vitest";
import { evaluate, type ProbeSpec } from "@/lib/integrity/evaluate";

const NOW = Date.parse("2026-06-28T12:00:00.000Z");

// A globe-events-shaped spec: { points[], polledAt, source } — checks
// freshness, provenance, no-fabrication, non-empty.
const globeSpec: ProbeSpec = {
  id: "globe-events",
  extract: (p) => {
    const o = p as { points?: unknown[]; polledAt?: string };
    if (!Array.isArray(o.points)) throw new Error("points missing");
    return {
      observedAt: o.polledAt ?? null,
      records: o.points as Array<Record<string, unknown>>,
    };
  },
  contract: {
    maxAgeMinutes: 180,
    floor: 1,
    checkFabrication: true,
    verifiedAt: "2026-04-18",
    provenanceField: "source",
  },
};

describe("evaluate", () => {
  it("reports OK for a fresh, well-sourced, non-empty payload", () => {
    const payload = {
      polledAt: "2026-06-28T11:30:00.000Z",
      source: "redis",
      points: [{ source: "redis" }, { source: "redis" }],
    };
    expect(evaluate(globeSpec, payload, NOW).verdict).toBe("OK");
  });

  it("reports FAIL when extract throws (malformed payload / shape change)", () => {
    const report = evaluate(globeSpec, { wrong: "shape" }, NOW);
    expect(report.verdict).toBe("FAIL");
    expect(report.checks[0]).toMatchObject({ name: "parse", ok: false });
  });

  it("reports STALE for a fresh-shaped but old payload", () => {
    const payload = {
      polledAt: "2026-06-28T06:00:00.000Z", // 360m old > 180m budget
      points: [{ source: "redis" }],
    };
    expect(evaluate(globeSpec, payload, NOW).verdict).toBe("STALE");
  });

  it("reports FAIL when a record lacks provenance", () => {
    const payload = {
      polledAt: "2026-06-28T11:30:00.000Z",
      points: [{ source: "redis" }, { lat: 1, lng: 2 }],
    };
    expect(evaluate(globeSpec, payload, NOW).verdict).toBe("FAIL");
  });

  it("reports FAIL on a fabricated point (no synthetic data on the globe)", () => {
    const payload = {
      polledAt: "2026-06-28T11:30:00.000Z",
      points: [{ source: "redis" }, { source: "redis", simulated: true }],
    };
    expect(evaluate(globeSpec, payload, NOW).verdict).toBe("FAIL");
  });

  it("reports DEGRADED when the count is below floor (no quiet-day allowance)", () => {
    const payload = { polledAt: "2026-06-28T11:30:00.000Z", points: [] };
    expect(evaluate(globeSpec, payload, NOW).verdict).toBe("DEGRADED");
  });

  it("reports FAIL when the backing source is unverified", () => {
    const spec: ProbeSpec = {
      ...globeSpec,
      contract: { ...globeSpec.contract, verifiedAt: "" },
    };
    const payload = {
      polledAt: "2026-06-28T11:30:00.000Z",
      points: [{ source: "redis" }],
    };
    expect(evaluate(spec, payload, NOW).verdict).toBe("FAIL");
  });

  it("applies a sanity range to a custom value (DEGRADED when out of range)", () => {
    const spec: ProbeSpec = {
      id: "openrouter-rankings",
      extract: (p) => {
        const o = p as { rows?: unknown[]; generatedAt?: string };
        return {
          observedAt: o.generatedAt ?? null,
          records: (o.rows ?? []) as Array<Record<string, unknown>>,
          value: (o.rows ?? []).length,
        };
      },
      contract: { maxAgeMinutes: 720, expectedMin: 50, expectedMax: 100 },
    };
    const payload = {
      generatedAt: "2026-06-28T11:30:00.000Z",
      rows: [{ source: "openrouter" }], // 1 row, below min 50
    };
    expect(evaluate(spec, payload, NOW).verdict).toBe("DEGRADED");
  });

  it("flags a fallback ordering via expectedOrdering (DEGRADED, S91 class)", () => {
    const spec: ProbeSpec = {
      id: "openrouter-rankings",
      extract: (p) => {
        const o = p as { rows?: unknown[]; generatedAt?: string; ordering?: string };
        return {
          observedAt: o.generatedAt ?? null,
          records: (o.rows ?? []) as Array<Record<string, unknown>>,
          ordering: o.ordering ?? null,
        };
      },
      contract: { maxAgeMinutes: 720, expectedOrdering: ["top-weekly", "trending"] },
    };
    const fresh = "2026-06-28T11:30:00.000Z";
    const fallback = evaluate(
      spec,
      { generatedAt: fresh, ordering: "catalogue-fallback", rows: [{ a: 1 }] },
      NOW,
    );
    expect(fallback.verdict).toBe("DEGRADED");
    expect(fallback.checks.find((c) => c.name === "ordering")?.ok).toBe(false);

    const real = evaluate(
      spec,
      { generatedAt: fresh, ordering: "top-weekly", rows: [{ a: 1 }] },
      NOW,
    );
    expect(real.checks.find((c) => c.name === "ordering")?.ok).toBe(true);
  });

  it("omits the ordering check when the contract declares no expectedOrdering", () => {
    const report = evaluate(
      globeSpec,
      { polledAt: "2026-06-28T11:55:00.000Z", points: [{ source: "redis" }] },
      NOW,
    );
    expect(report.checks.some((c) => c.name === "ordering")).toBe(false);
  });
});
