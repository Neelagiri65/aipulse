/**
 * Needles match at word boundaries, not anywhere in the string.
 *
 * `needleMatches` used to guard only US state suffixes, on the stated
 * reasoning that "for most needles this is identical to includes(needle)".
 * That held only because entries were sorted by length across all bands, so
 * "romania" (7) was always tried before "roma" (4). Band precedence removed
 * that accident and "roma" began matching inside "romania" — every Romanian
 * profile placed on Rome at CITY precision, and `placeFromCoords` then
 * attributing those events to Italy.
 *
 * A country rendered as a precise city in the wrong country is the exact
 * overclaim this module's band work exists to remove, so it is pinned here.
 */
import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { geocodePlaced, geocode, precisionForCoords } from "@/lib/geocoding";
import { resolvePointPrecision } from "@/lib/data/fetch-events";

/** Every needle in the three band literals, read from the source itself. */
function allNeedles(): string[] {
  // Resolved from THIS file, not `process.cwd()`: vitest run from a non-root
  // directory would otherwise resolve to `…/src/src/lib/geocoding.ts` and
  // throw ENOENT.
  const src = readFileSync(new URL("../geocoding.ts", import.meta.url), "utf8");
  return [...src.matchAll(/^\s*\["([^"]+)",\s*\[/gm)].map((m) => m[1]);
}

describe("needleMatches — word-boundary matching", () => {
  it("does not place Romania in Rome", () => {
    const placed = geocodePlaced("Romania");
    expect(placed).not.toBeNull();
    expect(placed!.coords).toEqual([45.94, 24.97]);
    expect(placed!.precision).toBe("country");
  });

  it("keeps Romanian cities absent from the dictionary in Romania", () => {
    // Neither Cluj nor Iași is a dictionary entry, so both fall to the
    // country band — the honest answer. Before the fix both drew a
    // city-precision dot on Rome.
    for (const profile of ["Cluj, Romania", "Iasi, Romania"]) {
      const placed = geocodePlaced(profile);
      expect(placed!.coords, profile).toEqual([45.94, 24.97]);
      expect(placed!.precision, profile).toBe("country");
    }
  });

  it("still resolves the city the short needle belongs to", () => {
    // The guard must not cost us the legitimate match.
    for (const profile of ["Rome, Italy", "Roma, Italy"]) {
      const placed = geocodePlaced(profile);
      expect(placed!.precision, profile).toBe("city");
      expect(placed!.coords[0], profile).toBeCloseTo(41.9, 1);
      expect(placed!.coords[1], profile).toBeCloseTo(12.5, 1);
    }
  });

  it("keeps a dictionary city winning over its country", () => {
    const placed = geocodePlaced("Berlin, Germany");
    expect(placed!.precision).toBe("city");
    expect(placed!.coords).toEqual([52.52, 13.405]);
  });

  it("still refuses the Nebraska false-positive it was written for", () => {
    // ", ne" inside ", news" — the 2026-04-20 HN ingest bug.
    expect(geocode("startups, news, fitness")).toBeNull();
  });

  it("treats a hyphen as a word boundary, both sides", () => {
    // A hyphen is not in [a-z0-9], so it ends a word for this matcher. Asserted
    // because it is a real consequence of the rule, in both directions.
    //
    // (An earlier version of this test used "Winston-Salem, NC" and claimed it
    // proved we do not resolve to Salem, Oregon. It proved nothing: "salem" is
    // not a dictionary needle, so that string resolved via ", nc" before the
    // fix too. Exactly the assert-what-nothing-checks pattern this file exists
    // to stop.)
    for (const profile of ["east-berlin", "berlin-mitte"]) {
      const placed = geocodePlaced(profile);
      expect(placed!.precision, profile).toBe("city");
      expect(placed!.coords, profile).toEqual([52.52, 13.405]);
    }
  });
});

/**
 * The band a placement was RESOLVED at is not always the band you get back by
 * re-grading its coordinates, so ingest must carry the first and never
 * recompute the second.
 *
 * New Jersey is the live collision: ZIP-3 prefixes 080-089 map to the same
 * point as the ", nj" state centroid, and the city-key set is consulted first,
 * so a region-precision placement was being written as `city` — a confident
 * city dot on a state centroid, the exact overclaim the band work removes.
 *
 * Asserted over the WHOLE dictionary rather than a handful of strings: the
 * previous test of this property named "no coordinate falls between bands" and
 * checked six hand-picked needles, so it stayed green while the property was
 * false.
 */
describe("resolved band vs coordinate re-grading", () => {
  it("grades a NJ placement as the region it resolved to", () => {
    const placed = geocodePlaced("Hoboken, NJ");
    expect(placed!.precision).toBe("region");
    // The re-derivation disagrees — which is precisely why ingest carries the
    // resolved band instead of recomputing from coordinates.
    expect(precisionForCoords(placed!.coords[0], placed!.coords[1])).toBe(
      "city",
    );
  });

  it("has no UNKNOWN disagreement between resolution and re-grading", () => {
    const needles = allNeedles();
    expect(needles.length).toBeGreaterThan(300);

    const disagreements: string[] = [];
    for (const n of needles) {
      const placed = geocodePlaced(n);
      if (!placed) {
        disagreements.push(`${n}: no longer resolves`);
        continue;
      }
      const regraded = precisionForCoords(placed.coords[0], placed.coords[1]);
      if (regraded !== placed.precision) {
        disagreements.push(`${n}: resolved ${placed.precision}, regrades ${regraded}`);
      }
    }

    // Every entry here is a coordinate shared by two bands. Ingest carries the
    // resolved band, so these no longer mislead — but a NEW one appearing is a
    // dictionary collision somebody should look at.
    expect(disagreements.sort()).toEqual([
      ", nj: resolved region, regrades city",
    ]);
  });
});

/**
 * The ingest write path chooses the band. Pinned here because it is the one
 * place a coordinate collision could outvote the geocoder, and because the
 * previous version of this fix had NO test — reverting it to
 * `precisionForCoords(lat, lng)` left the whole suite green while every New
 * Jersey placement silently returned to `city` on a state centroid.
 */
describe("resolvePointPrecision — the band a stored point is written with", () => {
  it("keeps the resolved region even where the coordinate re-grades to city", () => {
    const placed = geocodePlaced("Hoboken, NJ")!;
    expect(placed.precision).toBe("region");
    // The collision that made this necessary.
    expect(precisionForCoords(placed.coords[0], placed.coords[1])).toBe("city");

    expect(
      resolvePointPrecision(
        { coords: placed.coords, precision: placed.precision },
        placed.coords[0],
        placed.coords[1],
      ),
    ).toBe("region");
  });

  it("falls back to the coordinate grade only when no band was resolved", () => {
    // GitLab seeds arrive as bare coordinates and have no band to carry.
    expect(
      resolvePointPrecision({ coords: [51.17, 10.45] }, 51.17, 10.45),
    ).toBe("country");
  });

  it("returns undefined when neither a band nor a coordinate grade exists", () => {
    expect(resolvePointPrecision({ coords: [0, 0] }, 0, 0)).toBeUndefined();
  });
});
