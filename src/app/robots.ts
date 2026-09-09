import type { MetadataRoute } from "next";

/**
 * robots.txt — served at /robots.txt by Next.
 *
 * Allows general crawling (admin + non-public API endpoints excluded) and
 * points to the sitemap. AI answer-engine crawlers are listed explicitly: the
 * site's whole value is publicly-sourced, citable data, so we WANT to be cited
 * by AI search. Listing them documents intent and survives any future default
 * change.
 */

// .trim() guards against a stray newline/space in the env var.
const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_ORIGIN?.trim().replace(/\/$/, "") ??
  "https://gawk.dev";

const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
];

/**
 * The read-only JSON endpoints a crawler must fetch to render the dashboard.
 *
 * Blanket-disallowing `/api/` meant Googlebot rendered the page, tried the
 * polls the dashboard makes on mount, was refused by our own robots.txt, and
 * indexed "connecting… / awaiting first poll" as the content of the site.
 *
 * The first fix listed four endpoints. The dashboard polls roughly twenty, so
 * the numbers came back for status, events, feed and panels while models,
 * benchmarks, labs, HN, RSS, registry, research and cron-health still indexed
 * as placeholders — two thirds of the page, fixed for the cited symptom only.
 * This list is now the full render set, and `robots.test.ts` walks
 * `src/app/api/**` and fails on any route that is neither listed here nor
 * explicitly classified as non-public, so a new endpoint cannot silently
 * inherit the wrong answer.
 *
 * **Every entry is `$`-anchored, and that is load-bearing.** A robots path is a
 * PREFIX match: a bare `/api/registry` (14 chars) beats `Disallow: /api/` (5)
 * under longest-match and would also allow `/api/registry/discover` and
 * `/api/registry/backfill-events`; a bare `/api/benchmarks` would allow
 * `/api/benchmarks/ingest`. Those are write paths. Anchoring keeps each allow
 * to the one endpoint it names.
 *
 * `$` and `*` are both in RFC 9309 §2.2.2, which pairs them with longest-match
 * — so a conforming parser handles them. The residual risk, stated rather than
 * waved away: a parser that implements longest-match but treats `$` as a
 * literal character will match none of these allows, and the four endpoints
 * that were previously UNANCHORED (`/api/status`, `/api/globe-events`,
 * `/api/feed`, `/api/panels`) therefore go allowed → blocked for it. That is a
 * regression in reach for such a parser, not merely "today's behaviour". It is
 * accepted because the alternative — dropping the anchors — opens ingest and
 * discovery routes to every crawler, and because failing closed on a read
 * endpoint costs an indexed number while failing open costs a write path.
 *
 * These are NOT meant to be indexed as pages: every `/api/` response carries
 * `X-Robots-Tag: noindex` (see next.config), which is the honest pairing —
 * crawl it to render the page, do not list the JSON as a result. The public
 * `/api/v1/*` surface is deliberately absent: it is documented at `/docs/api`
 * for humans and machines to call directly, and no page needs it to render.
 */
export const CRAWLABLE_API = [
  "/api/status$",
  "/api/globe-events$",
  "/api/globe-events/regional-deltas$",
  "/api/registry$",
  "/api/models$",
  "/api/research$",
  "/api/hn$",
  "/api/benchmarks$",
  "/api/benchmarks/history$",
  "/api/labs$",
  "/api/rss$",
  "/api/cron-health$",
  "/api/feed$",
  "/api/community$",
  "/api/panels/agents$",
  "/api/panels/model-usage$",
  "/api/panels/producthunt$",
  "/api/panels/sdk-adoption$",
  // The one dynamic entry: `*`-terminated rather than `$`-anchored because the
  // route has a dynamic segment. Justified by a PUBLIC PAGE that embeds it —
  // the `/digest/{date}` archive renders these charts via DigestTileBoard, so
  // a crawler rendering that page needs to fetch them. (Not by the email: mail
  // clients never read robots.txt.) `/api/digest/send` is a write path but
  // sits outside the `chart/` prefix, so this cannot reach it.
  "/api/digest/chart/tool-health/*",
];

const DISALLOW = ["/admin", "/api/", "/subscribe/confirm", "/privacy/preferences"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: ["/", ...CRAWLABLE_API], disallow: DISALLOW },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: ["/", ...CRAWLABLE_API],
        disallow: DISALLOW,
      })),
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
