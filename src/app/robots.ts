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

const DISALLOW = ["/admin", "/api/", "/subscribe/confirm", "/privacy/preferences"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: DISALLOW,
      })),
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
