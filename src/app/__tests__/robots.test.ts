import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import robots, { CRAWLABLE_API } from "@/app/robots";

/**
 * There was no test here, which is how a blanket `Disallow: /api/` survived
 * long enough to make the homepage's indexable content read "connecting… /
 * awaiting first poll": Googlebot rendered the shell, tried the polls the
 * dashboard makes on mount, and was refused by our own robots.txt.
 *
 * The first version of this file then asserted that exactly FOUR endpoints
 * were allowed — pinning a partial fix as if it were the whole one. The
 * dashboard polls roughly twenty, so models, benchmarks, labs, HN, RSS,
 * registry, research and cron-health kept indexing as placeholders, and any
 * attempt to add them would have failed this suite and read like a regression.
 * That is the project's documented failure mode: fix the cited items, leave
 * the class open.
 *
 * So the load-bearing test here is no longer a list. It walks `src/app/api/**`
 * and requires every route to be classified — either crawlable, or explicitly
 * named below as non-public. A new endpoint fails this suite until somebody
 * decides which it is. The rule it encodes: a crawler may FETCH the read-only
 * JSON the page needs to render, and nothing else under /api/. Not being
 * indexed as a page is the other half, and lives as `X-Robots-Tag: noindex` in
 * next.config — robots.txt cannot say it.
 */

/**
 * Routes deliberately NOT crawlable, with the reason. Adding a route here is a
 * decision, which is the point — the test above makes it an explicit one.
 */
const NOT_CRAWLABLE = new Set([
  // Operator + diagnostics.
  "/api/admin/cli-usage",
  "/api/debug/email-health",
  "/api/integrity",
  "/api/trust-audit",
  "/api/history",
  // Write paths: crons, ingest, snapshots, containment.
  "/api/benchmarks/ingest",
  "/api/containment/cycle",
  "/api/cron-health/record",
  "/api/cron/openrouter-rankings",
  "/api/cron/video-watchdog",
  "/api/ingest",
  "/api/ingest/agents",
  "/api/ingest/globe-events-snapshot",
  "/api/registry/backfill-events",
  "/api/registry/discover",
  "/api/registry/topics",
  "/api/snapshot/record",
  "/api/wire/ingest-hn",
  "/api/wire/ingest-reddit",
  "/api/wire/ingest-rss",
  // Per-visitor state and delivery — never page content.
  "/api/consent",
  "/api/consent/delete",
  "/api/digest/send",
  "/api/notify/tool-alerts",
  "/api/push/send",
  "/api/push/subscribe",
  "/api/subscribe",
  "/api/subscribe/confirm",
  "/api/subscribe/unsubscribe",
  // Fetched server-side or on demand, not needed to render a page.
  "/api/registry/deps",
  "/api/pkg/brew",
  "/api/pkg/crates",
  "/api/pkg/docker",
  "/api/pkg/npm",
  "/api/pkg/pypi",
  "/api/pkg/vscode",
  // The documented public API. Callable directly by humans and machines; no
  // page renders from it, so a crawler has no render-time reason to fetch it.
  "/api/v1/agents",
  "/api/v1/feed",
  "/api/v1/labs",
  "/api/v1/models",
  "/api/v1/sdk",
  "/api/v1/sources",
  "/api/v1/status",
]);

/** Every `route.ts` under src/app/api, as a URL path. */
function discoverApiRoutes(dir: string, prefix = "/api"): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      found.push(...discoverApiRoutes(join(dir, entry.name), `${prefix}/${entry.name}`));
    } else if (entry.name === "route.ts" || entry.name === "route.tsx") {
      found.push(prefix);
    }
  }
  return found;
}

/** The allow paths as route patterns: `$` anchor stripped. */
const crawlable = new Set(CRAWLABLE_API.map((p) => p.replace(/\$$/, "")));

// Turns a route's dynamic segments into wildcards, so
// "/api/reports/[slug]/chart/[blockId]" matches the allow pattern that uses
// "*" in those two positions.
const asPattern = (route: string) => route.replace(/\[[^\]]+\]/g, "*");

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
      expect(asList(rule.allow)).toEqual(["/", ...CRAWLABLE_API]);
      expect(asList(rule.disallow)).toContain("/api/");
    }
  });

  it("classifies every /api/ route as crawlable or explicitly not", () => {
    const routes = discoverApiRoutes(join(process.cwd(), "src/app/api"));
    expect(routes.length).toBeGreaterThan(40);

    const unclassified = routes.filter(
      (r) =>
        !crawlable.has(asPattern(r)) &&
        !crawlable.has(r) &&
        !NOT_CRAWLABLE.has(r),
    );
    expect(
      unclassified,
      `Unclassified API route(s). Add each to CRAWLABLE_API in robots.ts if a ` +
        `page needs it to render, or to NOT_CRAWLABLE here with the reason.`,
    ).toEqual([]);
  });

  it("names only routes that exist — no allow for a deleted endpoint", () => {
    const routes = new Set(discoverApiRoutes(join(process.cwd(), "src/app/api")));
    const patterns = new Set([...routes].map(asPattern));
    for (const path of crawlable) {
      expect(
        routes.has(path) || patterns.has(path),
        `${path} is allowed but has no route.ts`,
      ).toBe(true);
    }
  });

  it("anchors every /api/ allow so it cannot open a private sub-route", () => {
    // A robots path is a PREFIX match. Unanchored, "/api/registry" would also
    // allow "/api/registry/discover", and "/api/benchmarks" would allow
    // "/api/benchmarks/ingest" — both write paths.
    for (const rule of rules) {
      const apiAllows = asList(rule.allow).filter((p) => p.startsWith("/api/"));
      expect(apiAllows.length).toBeGreaterThan(0);
      for (const path of apiAllows) {
        // `$` for a fixed route; `*` only for the two dynamic chart routes,
        // whose prefixes were checked to contain no private sibling.
        expect(
          path.endsWith("$") || path.endsWith("*"),
          `${path} is neither anchored nor a checked dynamic pattern`,
        ).toBe(true);
      }
    }
  });

  it("allows nothing under /api/ that is classified as non-public", () => {
    for (const path of crawlable) {
      expect(NOT_CRAWLABLE.has(path), `${path} is both allowed and denied`).toBe(
        false,
      );
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
    for (const path of CRAWLABLE_API) {
      expect(path.length).toBeGreaterThan("/api/".length);
    }
  });

  it("points at the sitemap and declares the canonical host", () => {
    const r = robots();
    expect(r.sitemap).toBe("https://gawk.dev/sitemap.xml");
    expect(r.host).toBe("https://gawk.dev");
  });
});
