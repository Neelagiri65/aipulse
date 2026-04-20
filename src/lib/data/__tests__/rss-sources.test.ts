import { describe, expect, it } from "vitest";
import {
  RSS_SOURCES,
  validateRssSources,
  type RssSource,
} from "@/lib/data/rss-sources";

function makeValid(overrides: Partial<RssSource> = {}): RssSource {
  return {
    id: "test-source",
    displayName: "Test Source",
    city: "London",
    country: "UK",
    lat: 51.5074,
    lng: -0.1278,
    lang: "en",
    rssUrl: "https://example.com/feed.xml",
    hqSourceUrl: "https://example.com/about",
    feedFormat: "rss",
    keywordFilterScope: "all",
    ...overrides,
  };
}

describe("RSS_SOURCES constant", () => {
  it("contains exactly 5 entries", () => {
    expect(RSS_SOURCES).toHaveLength(5);
  });

  it("passes its own validator", () => {
    const res = validateRssSources(RSS_SOURCES);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.entries).toHaveLength(5);
  });

  it("covers five distinct countries", () => {
    const countries = new Set(RSS_SOURCES.map((s) => s.country));
    expect(countries.size).toBe(5);
  });

  it("includes the five confirmed sources by id", () => {
    const ids = RSS_SOURCES.map((s) => s.id).sort();
    expect(ids).toEqual(
      [
        "the-register-ai",
        "heise-ai",
        "synced-review",
        "marktechpost",
        "mit-tech-review-ai",
      ].sort(),
    );
  });

  it("has no duplicate ids", () => {
    const ids = RSS_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every source has https:// URLs", () => {
    for (const s of RSS_SOURCES) {
      expect(s.rssUrl.startsWith("https://")).toBe(true);
      expect(s.hqSourceUrl.startsWith("https://")).toBe(true);
    }
  });

  it("heise is flagged ai-only because its feed is publication-wide", () => {
    const heise = RSS_SOURCES.find((s) => s.id === "heise-ai");
    expect(heise).toBeDefined();
    expect(heise?.keywordFilterScope).toBe("ai-only");
  });

  it("ai-topic-scoped feeds are flagged 'all' (no extra filter)", () => {
    const scoped = RSS_SOURCES.filter((s) => s.id !== "heise-ai");
    for (const s of scoped) {
      expect(s.keywordFilterScope).toBe("all");
    }
  });
});

describe("validateRssSources — happy path", () => {
  it("accepts a well-formed registry", () => {
    const res = validateRssSources([makeValid()]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.entries[0].id).toBe("test-source");
  });

  it("accepts an optional caveat", () => {
    const res = validateRssSources([makeValid({ caveat: "note" })]);
    expect(res.ok).toBe(true);
  });
});

describe("validateRssSources — schema rejections", () => {
  it("rejects non-array input", () => {
    const res = validateRssSources({} as unknown);
    expect(res.ok).toBe(false);
  });

  it("rejects empty registry", () => {
    const res = validateRssSources([]);
    expect(res.ok).toBe(false);
  });

  it("rejects missing id", () => {
    const bad = { ...makeValid(), id: "" };
    const res = validateRssSources([bad]);
    expect(res.ok).toBe(false);
  });

  it("rejects missing displayName", () => {
    const bad = { ...makeValid(), displayName: "" };
    const res = validateRssSources([bad]);
    expect(res.ok).toBe(false);
  });

  it("rejects missing city", () => {
    const bad = { ...makeValid(), city: "" };
    const res = validateRssSources([bad]);
    expect(res.ok).toBe(false);
  });

  it("rejects 3-letter country code", () => {
    const bad = { ...makeValid(), country: "GBR" };
    const res = validateRssSources([bad]);
    expect(res.ok).toBe(false);
  });

  it("rejects lowercase country code", () => {
    const bad = { ...makeValid(), country: "uk" };
    const res = validateRssSources([bad]);
    expect(res.ok).toBe(false);
  });

  it("rejects lat > 90", () => {
    const bad = { ...makeValid(), lat: 91 };
    const res = validateRssSources([bad]);
    expect(res.ok).toBe(false);
  });

  it("rejects lat < -90", () => {
    const bad = { ...makeValid(), lat: -91 };
    const res = validateRssSources([bad]);
    expect(res.ok).toBe(false);
  });

  it("rejects lng > 180", () => {
    const bad = { ...makeValid(), lng: 181 };
    const res = validateRssSources([bad]);
    expect(res.ok).toBe(false);
  });

  it("rejects lng < -180", () => {
    const bad = { ...makeValid(), lng: -181 };
    const res = validateRssSources([bad]);
    expect(res.ok).toBe(false);
  });

  it("rejects rssUrl without https", () => {
    const bad = { ...makeValid(), rssUrl: "http://example.com/feed" };
    const res = validateRssSources([bad]);
    expect(res.ok).toBe(false);
  });

  it("rejects hqSourceUrl without https", () => {
    const bad = { ...makeValid(), hqSourceUrl: "http://example.com/about" };
    const res = validateRssSources([bad]);
    expect(res.ok).toBe(false);
  });

  it("rejects empty lang", () => {
    const bad = { ...makeValid(), lang: "" };
    const res = validateRssSources([bad]);
    expect(res.ok).toBe(false);
  });

  it("rejects invalid feedFormat", () => {
    const bad = { ...makeValid(), feedFormat: "xml" as unknown as "rss" };
    const res = validateRssSources([bad]);
    expect(res.ok).toBe(false);
  });

  it("rejects invalid keywordFilterScope", () => {
    const bad = {
      ...makeValid(),
      keywordFilterScope: "partial" as unknown as "all",
    };
    const res = validateRssSources([bad]);
    expect(res.ok).toBe(false);
  });

  it("rejects duplicate id across entries", () => {
    const a = makeValid({ id: "dup" });
    const b = makeValid({ id: "dup" });
    const res = validateRssSources([a, b]);
    expect(res.ok).toBe(false);
  });
});
