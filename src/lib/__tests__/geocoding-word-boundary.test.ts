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

import { geocodePlaced, geocode } from "@/lib/geocoding";

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

  it("does not read a hyphenated city as its shorter tail", () => {
    // "Winston-Salem, NC" must not resolve to Salem, Oregon.
    const placed = geocodePlaced("Winston-Salem, NC");
    expect(placed!.coords).toEqual([35.7596, -79.0193]);
  });
});
