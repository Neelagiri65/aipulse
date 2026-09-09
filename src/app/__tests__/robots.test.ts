import { describe, it, expect } from "vitest";
import robots from "@/app/robots";

/**
 * There was no test here, which is how a blanket `Disallow: /api/` survived
 * long enough to make the homepage's indexable content read "connecting… /
 * awaiting first poll": Googlebot rendered the shell, tried the four polls the
 * dashboard makes on mount, and was refused by our own robots.txt.
 *
 * The rule these tests encode: a crawler may FETCH the read-only JSON the page
 * needs to render, and may fetch nothing else under /api/. Not being indexed
 * as pages is the other half, and lives as `X-Robots-Tag: noindex` in
 * next.config — robots.txt cannot say it.
 */
const CRAWLABLE = [
  "/api/status",
  "/api/globe-events",
  "/api/feed",
  "/api/panels",
];

describe("robots.txt", () => {
  const rules = robots().rules as Array<{
    userAgent: string;
    allow?: string | string[];
    disallow?: string | string[];
  }>;

  const asList = (v: string | string[] | undefined) =>
    v === undefined ? [] : Array.isArray(v) ? v : [v];

  it("applies the same rule set to every declared agent", () => {
    expect(rules.length).toBeGreaterThan(1);
    for (const rule of rules) {
      expect(asList(rule.allow)).toEqual(["/", ...CRAWLABLE]);
      expect(asList(rule.disallow)).toContain("/api/");
    }
  });

  it("allows exactly the four read-only endpoints under /api/ and nothing more", () => {
    for (const rule of rules) {
      const apiAllows = asList(rule.allow).filter((p) => p.startsWith("/api/"));
      expect(apiAllows.sort()).toEqual([...CRAWLABLE].sort());
    }
  });

  it("keeps the operator and consent surfaces closed", () => {
    for (const rule of rules) {
      const disallow = asList(rule.disallow);
      expect(disallow).toContain("/admin");
      expect(disallow).toContain("/subscribe/confirm");
      expect(disallow).toContain("/privacy/preferences");
    }
  });

  it("every allowed /api/ path is longer than the /api/ disallow it overrides", () => {
    // Google resolves a conflict by the most specific (longest) matching path.
    // If an allow were ever shortened to "/api" it would silently stop winning.
    for (const path of CRAWLABLE) {
      expect(path.length).toBeGreaterThan("/api/".length);
    }
  });

  it("points at the sitemap and declares the canonical host", () => {
    const r = robots();
    expect(r.sitemap).toBe("https://gawk.dev/sitemap.xml");
    expect(r.host).toBe("https://gawk.dev");
  });
});
