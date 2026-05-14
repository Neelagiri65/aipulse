import { describe, expect, it } from "vitest";
import {
  isLabInTopN,
  pickTopLabsBy7dActivity,
} from "@/lib/data/labs-top";
import type { LabActivity, LabsPayload } from "@/lib/data/fetch-labs";

function lab(
  id: string,
  total: number,
  staleRepos: number = 0,
): LabActivity {
  const repos = Array.from({ length: 2 }, (_, i) => ({
    owner: id,
    repo: `r${i}`,
    sourceUrl: `https://github.com/${id}/r${i}`,
    total: i === 0 ? total : 0,
    byType: i === 0 ? { PushEvent: total } : ({} as Record<string, number>),
    stale: i < staleRepos,
  }));
  return {
    id,
    displayName: id,
    kind: "labs",
    city: "Anywhere",
    country: "US",
    lat: 0,
    lng: 0,
    hqSourceUrl: `https://${id}.example.com/about`,
    url: `https://${id}.example.com`,
    orgs: [id],
    repos,
    total,
    byType: { PushEvent: total },
    stale: staleRepos > 0,
  };
}

function payload(...labs: LabActivity[]): LabsPayload {
  return {
    labs,
    generatedAt: "2026-05-04T00:00:00Z",
    failures: [],
  };
}

describe("pickTopLabsBy7dActivity", () => {
  it("orders labs by 7d activity descending", () => {
    const got = pickTopLabsBy7dActivity(
      payload(lab("a", 5), lab("b", 50), lab("c", 12)),
      3,
    );
    expect(got.map((l) => l.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks ties on fewer stale repos (complete data wins)", () => {
    const got = pickTopLabsBy7dActivity(
      payload(lab("a", 10, 1), lab("b", 10, 0)),
      2,
    );
    expect(got.map((l) => l.id)).toEqual(["b", "a"]);
  });

  it("falls back to lexical id sort on full tie for deterministic output", () => {
    const got = pickTopLabsBy7dActivity(
      payload(lab("zeta", 10), lab("alpha", 10)),
      2,
    );
    expect(got.map((l) => l.id)).toEqual(["alpha", "zeta"]);
  });

  it("caps at n", () => {
    const got = pickTopLabsBy7dActivity(
      payload(lab("a", 5), lab("b", 4), lab("c", 3)),
      2,
    );
    expect(got.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("returns [] for n <= 0", () => {
    expect(pickTopLabsBy7dActivity(payload(lab("a", 5)), 0)).toEqual([]);
    expect(pickTopLabsBy7dActivity(payload(lab("a", 5)), -3)).toEqual([]);
  });

  it("does not mutate the input payload", () => {
    const p = payload(lab("a", 5), lab("b", 50));
    const before = p.labs.map((l) => l.id);
    pickTopLabsBy7dActivity(p, 2);
    expect(p.labs.map((l) => l.id)).toEqual(before);
  });
});

describe("isLabInTopN", () => {
  it("returns true for slugs that survive the top-N cut", () => {
    const p = payload(lab("a", 5), lab("b", 50), lab("c", 12));
    expect(isLabInTopN(p, "b", 2)).toBe(true);
    expect(isLabInTopN(p, "c", 2)).toBe(true);
  });

  it("returns false for slugs ranked outside top-N", () => {
    const p = payload(lab("a", 5), lab("b", 50), lab("c", 12));
    expect(isLabInTopN(p, "a", 2)).toBe(false);
  });

  it("returns false for unknown slugs", () => {
    const p = payload(lab("a", 5));
    expect(isLabInTopN(p, "ghost", 10)).toBe(false);
  });
});
