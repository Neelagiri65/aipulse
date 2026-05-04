import { describe, expect, it } from "vitest";
import { loadLabsActivityLeaders30dBlock } from "@/lib/reports/blocks/labs-activity-leaders-30d";
import type { LabActivity, LabsPayload } from "@/lib/data/fetch-labs";

function lab(
  id: string,
  total: number,
  overrides: Partial<LabActivity> = {},
): LabActivity {
  return {
    id,
    displayName: id,
    kind: "industry",
    city: "San Francisco",
    country: "US",
    lat: 37.7749,
    lng: -122.4194,
    hqSourceUrl: `https://${id}.example.com/about`,
    url: `https://${id}.example.com`,
    orgs: [id],
    repos: [],
    total,
    byType: {},
    stale: false,
    ...overrides,
  };
}

function payload(...labs: LabActivity[]): LabsPayload {
  return {
    labs,
    generatedAt: "2026-05-04T00:00:00Z",
    failures: [],
  };
}

const FIXED_NOW = () => new Date("2026-05-04T00:00:00.000Z");

describe("loadLabsActivityLeaders30dBlock — happy path", () => {
  it("ranks labs by total event count (descending), keeps top-N", () => {
    const result = loadLabsActivityLeaders30dBlock({
      payload: payload(
        lab("a", 50),
        lab("b", 200),
        lab("c", 120),
        lab("d", 30),
      ),
      topN: 3,
      now: FIXED_NOW,
    });
    expect(result.rows.map((r) => r.label.split(" ·")[0])).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("excludes labs with total = 0 ('quiet' labs don't make a 'leaders' framing)", () => {
    const result = loadLabsActivityLeaders30dBlock({
      payload: payload(lab("loud", 100), lab("quiet", 0)),
      now: FIXED_NOW,
    });
    expect(result.rows.map((r) => r.label.split(" ·")[0])).toEqual(["loud"]);
  });

  it("formats the row label with city + country (geographic spread visible at a glance)", () => {
    const result = loadLabsActivityLeaders30dBlock({
      payload: payload(
        lab("anthropic", 100, { city: "San Francisco", country: "US" }),
      ),
      now: FIXED_NOW,
    });
    expect(result.rows[0].label).toBe("anthropic · San Francisco, US");
  });

  it("formats value as 'N events' with thousand separators", () => {
    const result = loadLabsActivityLeaders30dBlock({
      payload: payload(lab("big", 12_345)),
      now: FIXED_NOW,
    });
    expect(result.rows[0].value).toBe("12,345 events");
  });

  it("uses the lab's primary website + hostname as source link", () => {
    const result = loadLabsActivityLeaders30dBlock({
      payload: payload(
        lab("anthropic", 100, { url: "https://www.anthropic.com" }),
      ),
      now: FIXED_NOW,
    });
    expect(result.rows[0].sourceUrl).toBe("https://www.anthropic.com");
    expect(result.rows[0].sourceLabel).toBe("anthropic.com"); // www stripped
  });
});

describe("loadLabsActivityLeaders30dBlock — tie-breaker", () => {
  it("on equal totals, non-stale labs win (complete data > partial)", () => {
    const result = loadLabsActivityLeaders30dBlock({
      payload: payload(
        lab("partial", 100, { stale: true }),
        lab("complete", 100, { stale: false }),
      ),
      now: FIXED_NOW,
    });
    expect(result.rows[0].label.split(" ·")[0]).toBe("complete");
    expect(result.rows[1].label.split(" ·")[0]).toBe("partial");
  });

  it("on full tie, lexical id sort for stable ranking across requests", () => {
    const result = loadLabsActivityLeaders30dBlock({
      payload: payload(lab("zeta", 50), lab("alpha", 50)),
      now: FIXED_NOW,
    });
    expect(result.rows.map((r) => r.label.split(" ·")[0])).toEqual([
      "alpha",
      "zeta",
    ]);
  });
});

describe("loadLabsActivityLeaders30dBlock — sanity warnings", () => {
  it("warns per stale lab in the top-N (data was partial)", () => {
    const result = loadLabsActivityLeaders30dBlock({
      payload: payload(
        lab("ok", 50),
        lab("partial", 200, { stale: true }),
      ),
      now: FIXED_NOW,
    });
    expect(result.sanityWarnings.length).toBe(1);
    expect(result.sanityWarnings[0]).toContain("partial");
    expect(result.sanityWarnings[0]).toContain("partial data only");
    // Row INCLUDED with the warning, not auto-suppressed.
    expect(result.rows.map((r) => r.label.split(" ·")[0])).toContain("partial");
  });

  it("does NOT warn when no top-N lab is stale", () => {
    const result = loadLabsActivityLeaders30dBlock({
      payload: payload(lab("a", 50), lab("b", 30)),
      now: FIXED_NOW,
    });
    expect(result.sanityWarnings).toEqual([]);
  });
});

describe("loadLabsActivityLeaders30dBlock — edge cases", () => {
  it("returns rows: [] when every lab is quiet", () => {
    const result = loadLabsActivityLeaders30dBlock({
      payload: payload(lab("a", 0), lab("b", 0)),
      now: FIXED_NOW,
    });
    expect(result.rows).toEqual([]);
  });

  it("returns rows: [] for empty payload", () => {
    const result = loadLabsActivityLeaders30dBlock({
      payload: payload(),
      now: FIXED_NOW,
    });
    expect(result.rows).toEqual([]);
  });
});
