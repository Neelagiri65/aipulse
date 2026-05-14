import { describe, expect, it } from "vitest";
import {
  stripLeadingNullDates,
  firstDataDate,
  coverageOf,
  groupByRegistry,
  computeWindowDelta,
} from "@/lib/data/sdk-adoption-view";
import type {
  SdkAdoptionDto,
  SdkAdoptionPackage,
} from "@/lib/data/sdk-adoption";

function pkg(
  id: string,
  days: Array<{ date: string; count: number | null }>,
  overrides: Partial<SdkAdoptionPackage> = {},
): SdkAdoptionPackage {
  return {
    id,
    label: id.split(":")[1] ?? id,
    registry: id.split(":")[0] as SdkAdoptionPackage["registry"],
    latest: { count: null, fetchedAt: null },
    days: days.map((d) => ({ ...d, delta: null })),
    firstParty: true,
    caveat: null,
    counterName: "lastDay",
    counterUnits: "downloads/day",
    ...overrides,
  };
}

function dto(packages: SdkAdoptionPackage[]): SdkAdoptionDto {
  return { generatedAt: "now", packages };
}

describe("stripLeadingNullDates", () => {
  it("returns the DTO unchanged when every package is empty", () => {
    const d = dto([]);
    expect(stripLeadingNullDates(d)).toBe(d);
  });

  it("strips columns where every row is null", () => {
    const d = dto([
      pkg("pypi:a", [
        { date: "d1", count: null },
        { date: "d2", count: null },
        { date: "d3", count: 100 },
      ]),
      pkg("npm:b", [
        { date: "d1", count: null },
        { date: "d2", count: null },
        { date: "d3", count: 50 },
      ]),
    ]);
    const out = stripLeadingNullDates(d);
    expect(out.packages[0].days.map((x) => x.date)).toEqual(["d3"]);
    expect(out.packages[1].days.map((x) => x.date)).toEqual(["d3"]);
  });

  it("keeps a column where any row has data", () => {
    const d = dto([
      pkg("pypi:a", [
        { date: "d1", count: null },
        { date: "d2", count: 100 },
        { date: "d3", count: 110 },
      ]),
      pkg("npm:b", [
        { date: "d1", count: null },
        { date: "d2", count: null },
        { date: "d3", count: 50 },
      ]),
    ]);
    const out = stripLeadingNullDates(d);
    // d2 has data on row 0 → kept. d1 is null everywhere → stripped.
    expect(out.packages[0].days.map((x) => x.date)).toEqual(["d2", "d3"]);
    expect(out.packages[1].days.map((x) => x.date)).toEqual(["d2", "d3"]);
  });

  it("keeps the last column if every column is null (so the matrix renders ≥1 col)", () => {
    const d = dto([
      pkg("pypi:a", [
        { date: "d1", count: null },
        { date: "d2", count: null },
      ]),
    ]);
    const out = stripLeadingNullDates(d);
    expect(out.packages[0].days).toHaveLength(1);
    expect(out.packages[0].days[0].date).toBe("d2");
  });
});

describe("firstDataDate", () => {
  it("returns null when no row has any non-null count", () => {
    const d = dto([
      pkg("pypi:a", [
        { date: "d1", count: null },
        { date: "d2", count: null },
      ]),
    ]);
    expect(firstDataDate(d)).toBeNull();
  });

  it("returns the earliest date that any row has a non-null count", () => {
    const d = dto([
      pkg("pypi:a", [
        { date: "2026-04-22", count: null },
        { date: "2026-04-23", count: 100 },
        { date: "2026-04-24", count: 110 },
      ]),
      pkg("npm:b", [
        { date: "2026-04-22", count: 50 },
        { date: "2026-04-23", count: null },
        { date: "2026-04-24", count: 60 },
      ]),
    ]);
    expect(firstDataDate(d)).toBe("2026-04-22");
  });
});

describe("coverageOf", () => {
  it("counts non-null entries", () => {
    expect(
      coverageOf([
        { date: "d1", count: 1, delta: null },
        { date: "d2", count: null, delta: null },
        { date: "d3", count: 2, delta: null },
      ]),
    ).toEqual({ filled: 2, total: 3 });
  });

  it("returns 0/0 on empty input", () => {
    expect(coverageOf([])).toEqual({ filled: 0, total: 0 });
  });

  it("returns 0/N when every entry is null", () => {
    expect(
      coverageOf([
        { date: "d1", count: null, delta: null },
        { date: "d2", count: null, delta: null },
      ]),
    ).toEqual({ filled: 0, total: 2 });
  });
});

describe("groupByRegistry", () => {
  it("groups packages under stable registry order: pypi, npm, crates, docker, brew", () => {
    const d = dto([
      pkg("brew:ollama", []),
      pkg("crates:burn", []),
      pkg("pypi:transformers", []),
      pkg("npm:openai", []),
      pkg("docker:vllm/vllm-openai", []),
    ]);
    const groups = groupByRegistry(d.packages);
    expect(groups.map((g) => g.registry)).toEqual([
      "pypi",
      "npm",
      "crates",
      "docker",
      "brew",
    ]);
  });

  it("sorts packages within a group by latest count descending, nulls last", () => {
    const d = dto([
      pkg("pypi:a", [], { latest: { count: 100, fetchedAt: null } }),
      pkg("pypi:b", [], { latest: { count: 1000, fetchedAt: null } }),
      pkg("pypi:c", [], { latest: { count: null, fetchedAt: null } }),
      pkg("pypi:d", [], { latest: { count: 500, fetchedAt: null } }),
    ]);
    const [pypi] = groupByRegistry(d.packages);
    expect(pypi.packages.map((p) => p.id)).toEqual([
      "pypi:b",
      "pypi:d",
      "pypi:a",
      "pypi:c",
    ]);
  });

  it("omits empty registry groups", () => {
    const d = dto([pkg("pypi:a", [])]);
    const groups = groupByRegistry(d.packages);
    expect(groups).toHaveLength(1);
    expect(groups[0].registry).toBe("pypi");
  });

  describe("groupByRegistry — sortBy: 'movement' (S62g.10)", () => {
    function days(values: Array<number | null>) {
      return values.map((count, i) => ({
        date: `2026-04-${String(i + 1).padStart(2, "0")}`,
        count,
        delta: null,
      }));
    }

    it("ranks packages by absolute 7d delta % descending — biggest movers first, either direction", () => {
      // Three packages, all on pypi, with very different 7d movement.
      // a: flat 100→100 over 7 days  → ~0% delta
      // b: 100→100→100→100→100→100→100→200 → +100% delta vs prior 6
      // c: 1000→1000→1000→1000→1000→1000→1000→200 → -80% delta
      const d = dto([
        pkg(
          "pypi:flat",
          days([100, 100, 100, 100, 100, 100, 100, 100]),
          { latest: { count: 100, fetchedAt: null } },
        ),
        pkg(
          "pypi:gainer",
          days([100, 100, 100, 100, 100, 100, 100, 200]),
          { latest: { count: 200, fetchedAt: null } },
        ),
        pkg(
          "pypi:faller",
          days([1000, 1000, 1000, 1000, 1000, 1000, 1000, 200]),
          { latest: { count: 200, fetchedAt: null } },
        ),
      ]);
      const [pypi] = groupByRegistry(d.packages, "movement");
      // Faller has |-80%| = 0.8; Gainer has |+100%| = 1.0; Flat ~0.
      // Order: gainer > faller > flat.
      expect(pypi.packages.map((p) => p.id)).toEqual([
        "pypi:gainer",
        "pypi:faller",
        "pypi:flat",
      ]);
    });

    it("packages with no delta data fall to the bottom; tiebreak by count desc", () => {
      const d = dto([
        pkg(
          "pypi:no-data",
          [{ date: "d1", count: 5000 }], // <2 days, delta is null
          { latest: { count: 5000, fetchedAt: null } },
        ),
        pkg(
          "pypi:mover",
          days([100, 100, 100, 100, 100, 100, 100, 150]),
          { latest: { count: 150, fetchedAt: null } },
        ),
      ]);
      const [pypi] = groupByRegistry(d.packages, "movement");
      // Mover has delta data → ranks ahead even though its count is
      // smaller. no-data packages sink.
      expect(pypi.packages.map((p) => p.id)).toEqual([
        "pypi:mover",
        "pypi:no-data",
      ]);
    });

    it("default (no sortBy arg) is unchanged 'count' behavior — back-compat preserved", () => {
      const d = dto([
        pkg("pypi:a", [], { latest: { count: 100, fetchedAt: null } }),
        pkg("pypi:b", [], { latest: { count: 1000, fetchedAt: null } }),
      ]);
      const [pypi] = groupByRegistry(d.packages); // no second arg
      expect(pypi.packages.map((p) => p.id)).toEqual(["pypi:b", "pypi:a"]);
    });

    it("registry grouping + stable order are preserved under movement sort", () => {
      const d = dto([
        pkg("npm:x", days([100, 100, 100, 100, 100, 100, 100, 200])),
        pkg("pypi:y", days([100, 100, 100, 100, 100, 100, 100, 110])),
      ]);
      const groups = groupByRegistry(d.packages, "movement");
      expect(groups.map((g) => g.registry)).toEqual(["pypi", "npm"]);
    });
  });
});

describe("computeWindowDelta", () => {
  it("returns null when fewer than 2 non-null counts in the window", () => {
    expect(
      computeWindowDelta(
        [
          { date: "d1", count: null, delta: null },
          { date: "d2", count: 100, delta: null },
        ],
        7,
      ),
    ).toBeNull();
  });

  it("computes delta vs the prior-window mean, excluding the last day", () => {
    expect(
      computeWindowDelta(
        [
          { date: "d1", count: 100, delta: null },
          { date: "d2", count: 100, delta: null },
          { date: "d3", count: 200, delta: null },
        ],
        7,
      ),
    ).toBeCloseTo(1.0, 6);
  });

  it("returns null when last day is null", () => {
    expect(
      computeWindowDelta(
        [
          { date: "d1", count: 100, delta: null },
          { date: "d2", count: null, delta: null },
        ],
        7,
      ),
    ).toBeNull();
  });

  it("returns null when baseline mean is zero", () => {
    expect(
      computeWindowDelta(
        [
          { date: "d1", count: 0, delta: null },
          { date: "d2", count: 50, delta: null },
        ],
        7,
      ),
    ).toBeNull();
  });
});
