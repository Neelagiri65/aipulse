import { describe, expect, it } from "vitest";
import { geocode } from "@/lib/geocoding";

describe("geocode — happy paths", () => {
  it("resolves a plain city", () => {
    expect(geocode("London")).toEqual([51.5074, -0.1278]);
  });

  it("resolves a City, State suffix", () => {
    const c = geocode("Cambridge, MA");
    expect(c).toEqual([42.3736, -71.1097]);
  });

  it("resolves a City, State ZIP format (state suffix followed by space+digits)", () => {
    const c = geocode("San Francisco, CA 94103");
    expect(c).toEqual([37.7749, -122.4194]);
  });

  it("resolves a bare country", () => {
    expect(geocode("Germany")).toEqual([51.17, 10.45]);
  });

  it("resolves a bare US ZIP via ZIP-3 fallback", () => {
    expect(geocode("94103")).toEqual([37.7749, -122.4194]);
  });
});

describe("geocode — stoplist", () => {
  it.each([
    "location",
    "remote",
    "worldwide",
    "earth",
    "internet",
    "everywhere",
    "anywhere",
    "home",
    "here",
    "there",
    "the world",
    "planet earth",
    "nomad",
    "digital nomad",
    "global",
    "distributed",
  ])("returns null for generic bio string %s", (s) => {
    expect(geocode(s)).toBeNull();
  });

  it("stoplist is case-insensitive and trimmed", () => {
    expect(geocode("  Remote  ")).toBeNull();
    expect(geocode("WORLDWIDE")).toBeNull();
  });

  it("does not reject real locations whose name happens to contain a stopword substring", () => {
    // sanity: "home" is stoplisted, but any city containing "home" is
    // still fine (none currently, but guard the contract anyway).
    expect(geocode("London")).not.toBeNull();
  });
});

describe("geocode — state-suffix substring false-positive guard", () => {
  it("does NOT match ', ne' inside ', news,' (the Nebraska HN regression)", () => {
    const bio =
      "interests in family, development, JavaScript, startups, news, location, fitness";
    expect(geocode(bio)).toBeNull();
  });

  it("does NOT match ', ca' inside ', candidates,'", () => {
    const bio = "software engineer, candidates, remote work";
    // 'remote work' isn't stoplisted (stoplist is exact-match), and
    // the haystack should NOT false-resolve to California.
    expect(geocode(bio)).toBeNull();
  });

  it("still matches ', ne' when it actually terminates the string (Omaha, NE)", () => {
    expect(geocode("Omaha, NE")).toEqual([41.4925, -99.9018]);
  });

  it("still matches ', ca' when followed by a ZIP", () => {
    expect(geocode("Palo Alto, CA 94301")).toEqual([37.4419, -122.143]);
  });
});
