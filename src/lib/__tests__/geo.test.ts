import { describe, expect, it } from "vitest";
import {
  EEA_NON_EU,
  EU_27,
  isCoveredJurisdiction,
  parseGeo,
} from "@/lib/geo";

function headers(bag: Record<string, string>) {
  return {
    get(name: string): string | null {
      return bag[name.toLowerCase()] ?? null;
    },
  };
}

describe("EU_27 constant", () => {
  it("contains exactly 27 member states", () => {
    expect(EU_27.length).toBe(27);
  });

  it("includes core members and excludes GB (post-Brexit)", () => {
    expect(EU_27).toContain("DE");
    expect(EU_27).toContain("FR");
    expect(EU_27).toContain("IE");
    expect(EU_27).not.toContain("GB");
  });
});

describe("EEA_NON_EU constant", () => {
  it("is Iceland, Liechtenstein, Norway only", () => {
    expect([...EEA_NON_EU].sort()).toEqual(["IS", "LI", "NO"]);
  });
});

describe("isCoveredJurisdiction", () => {
  it("covers every EU27 country regardless of region", () => {
    for (const country of EU_27) {
      expect(isCoveredJurisdiction(country, null)).toBe(true);
    }
  });

  it("covers EEA non-EU (IS / LI / NO)", () => {
    expect(isCoveredJurisdiction("IS", null)).toBe(true);
    expect(isCoveredJurisdiction("LI", null)).toBe(true);
    expect(isCoveredJurisdiction("NO", null)).toBe(true);
  });

  it("covers UK (GB)", () => {
    expect(isCoveredJurisdiction("GB", null)).toBe(true);
  });

  it("covers US with region=CA", () => {
    expect(isCoveredJurisdiction("US", "CA")).toBe(true);
  });

  it("does not cover US outside California", () => {
    expect(isCoveredJurisdiction("US", "NY")).toBe(false);
    expect(isCoveredJurisdiction("US", "TX")).toBe(false);
    expect(isCoveredJurisdiction("US", null)).toBe(false);
  });

  it("does not cover non-covered countries", () => {
    expect(isCoveredJurisdiction("JP", null)).toBe(false);
    expect(isCoveredJurisdiction("IN", null)).toBe(false);
    expect(isCoveredJurisdiction("BR", null)).toBe(false);
    expect(isCoveredJurisdiction("CA", null)).toBe(false);
    expect(isCoveredJurisdiction("AU", null)).toBe(false);
  });

  it("treats null country as non-covered", () => {
    expect(isCoveredJurisdiction(null, null)).toBe(false);
    expect(isCoveredJurisdiction(null, "CA")).toBe(false);
  });

  it("matches Canada-CA (country=CA) as non-covered, not US-CA", () => {
    expect(isCoveredJurisdiction("CA", null)).toBe(false);
    expect(isCoveredJurisdiction("CA", "ON")).toBe(false);
  });
});

describe("parseGeo", () => {
  it("reads country + region from Vercel headers", () => {
    const h = headers({
      "x-vercel-ip-country": "DE",
      "x-vercel-ip-country-region": "BE",
    });
    expect(parseGeo(h)).toEqual({ country: "DE", region: "BE", covered: true });
  });

  it("uppercases and trims country headers", () => {
    const h = headers({
      "x-vercel-ip-country": "  de  ",
      "x-vercel-ip-country-region": " bw ",
    });
    expect(parseGeo(h)).toEqual({ country: "DE", region: "BW", covered: true });
  });

  it("returns nulls on missing headers", () => {
    const h = headers({});
    expect(parseGeo(h)).toEqual({ country: null, region: null, covered: false });
  });

  it("treats empty string country as null", () => {
    const h = headers({
      "x-vercel-ip-country": "",
      "x-vercel-ip-country-region": "CA",
    });
    expect(parseGeo(h).country).toBeNull();
    expect(parseGeo(h).covered).toBe(false);
  });

  it("covers US when region is CA", () => {
    const h = headers({
      "x-vercel-ip-country": "US",
      "x-vercel-ip-country-region": "CA",
    });
    expect(parseGeo(h).covered).toBe(true);
  });

  it("does not cover US when region is missing", () => {
    const h = headers({ "x-vercel-ip-country": "US" });
    expect(parseGeo(h).covered).toBe(false);
  });

  it("covers GB regardless of region header", () => {
    const h = headers({
      "x-vercel-ip-country": "gb",
      "x-vercel-ip-country-region": "ENG",
    });
    expect(parseGeo(h).covered).toBe(true);
  });
});
