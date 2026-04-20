import { describe, expect, it } from "vitest";
import labsData from "../../../../data/ai-labs.json";
import {
  validateLabsRegistry,
  type LabEntry,
} from "@/lib/data/labs-registry";

const base: LabEntry = {
  id: "test-lab",
  displayName: "Test Lab",
  kind: "industry",
  city: "Testville",
  country: "US",
  lat: 37.77,
  lng: -122.42,
  hqSourceUrl: "https://example.com/about",
  orgs: ["test-org"],
  repos: [
    {
      owner: "test-org",
      repo: "flagship",
      sourceUrl: "https://github.com/test-org/flagship",
    },
  ],
};

describe("validateLabsRegistry", () => {
  it("accepts the real data/ai-labs.json", () => {
    const result = validateLabsRegistry(labsData as unknown);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.length).toBeGreaterThanOrEqual(30);
    expect(result.entries.length).toBeLessThanOrEqual(40);
  });

  it("rejects a non-array input", () => {
    const r = validateLabsRegistry({ labs: [] });
    expect(r.ok).toBe(false);
  });

  it("rejects a missing required field", () => {
    const bad = [{ ...base, displayName: undefined } as unknown];
    const r = validateLabsRegistry(bad);
    expect(r.ok).toBe(false);
  });

  it("rejects lat out of [-90, 90]", () => {
    const r = validateLabsRegistry([{ ...base, lat: 91 }]);
    expect(r.ok).toBe(false);
  });

  it("rejects lng out of [-180, 180]", () => {
    const r = validateLabsRegistry([{ ...base, lng: -181 }]);
    expect(r.ok).toBe(false);
  });

  it("rejects a country code that isn't 2 uppercase letters", () => {
    const r1 = validateLabsRegistry([{ ...base, country: "USA" }]);
    const r2 = validateLabsRegistry([{ ...base, country: "us" }]);
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
  });

  it("rejects a duplicate id", () => {
    const r = validateLabsRegistry([base, { ...base, displayName: "Other" }]);
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown kind", () => {
    const r = validateLabsRegistry([
      { ...base, kind: "unicorn" as unknown as LabEntry["kind"] },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects an empty repos array", () => {
    const r = validateLabsRegistry([{ ...base, repos: [] }]);
    expect(r.ok).toBe(false);
  });

  it("rejects a repo missing owner/repo", () => {
    const r = validateLabsRegistry([
      {
        ...base,
        repos: [
          { owner: "", repo: "x", sourceUrl: "https://github.com/x/x" },
        ],
      },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects a non-https hqSourceUrl", () => {
    const r = validateLabsRegistry([
      { ...base, hqSourceUrl: "ftp://example.com/about" },
    ]);
    expect(r.ok).toBe(false);
  });
});

describe("data/ai-labs.json — registry invariants", () => {
  const parsed = validateLabsRegistry(labsData as unknown);
  if (!parsed.ok) {
    it("data file must parse", () => {
      expect(parsed.ok).toBe(true);
    });
    return;
  }
  const entries = parsed.entries;

  it("covers ≥9 countries", () => {
    const countries = new Set(entries.map((e) => e.country));
    expect(countries.size).toBeGreaterThanOrEqual(9);
  });

  it("every repo URL starts with https://github.com/", () => {
    for (const e of entries) {
      for (const r of e.repos) {
        expect(r.sourceUrl.startsWith("https://github.com/")).toBe(true);
      }
    }
  });

  it("no duplicate repo owner/name pairs across the registry", () => {
    const seen = new Map<string, string>();
    for (const e of entries) {
      for (const r of e.repos) {
        const key = `${r.owner}/${r.repo}`.toLowerCase();
        if (seen.has(key)) {
          throw new Error(
            `duplicate repo ${key} on labs ${seen.get(key)} and ${e.id}`,
          );
        }
        seen.set(key, e.id);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it("has representation in US, Europe, Asia, and at least one Middle East lab", () => {
    const countries = new Set(entries.map((e) => e.country));
    expect(countries.has("US")).toBe(true);
    expect(countries.has("CN") || countries.has("JP") || countries.has("KR")).toBe(true);
    expect(
      countries.has("GB") ||
        countries.has("FR") ||
        countries.has("DE") ||
        countries.has("CH"),
    ).toBe(true);
    expect(countries.has("IL")).toBe(true);
  });
});
