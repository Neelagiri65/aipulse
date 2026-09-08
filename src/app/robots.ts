import type { MetadataRoute } from "next";

/**
 * robots.txt — served at /robots.txt by Next.
 *
 * Allows general crawling (admin + raw API endpoints excluded) and points to
 * the sitemap. AI answer-engine crawlers are listed explicitly: the site's
 * whole value is publicly-sourced, citable data, so we WANT to be cited by AI
 * search. Listing them documents intent and survives any future default change.
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
 * The read-only JSON endpoints the client fetches on mount.
 *
 * The homepage is a static shell: the real numbers arrive on the first client
 * poll. Blanket-disallowing `/api/` meant Googlebot rendered the page, tried
 * those fetches, was refused by our own robots.txt, and indexed
 * "connecting… / awaiting first poll" as the content of the site. These four
 * are public, cacheable GETs — the same data the dashboard shows and the
 * `/docs/api` page documents — so a crawler is allowed to read them.
 *
 * They are NOT meant to be indexed as pages: every `/api/` response carries
 * `X-Robots-Tag: noindex` (see next.config), which is the honest pairing —
 * crawl it to render the page, do not list the JSON as a result.
 */
const CRAWLABLE_API = [
  "/api/status",
  "/api/globe-events",
  "/api/feed",
  "/api/panels",
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
