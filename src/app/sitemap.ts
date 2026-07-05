import type { MetadataRoute } from "next";

import { listDigestDates } from "@/lib/digest/archive";
import { listReportSlugs } from "@/lib/reports/registry";

/**
 * sitemap.xml — served at /sitemap.xml by Next.
 *
 * Exposes the homepage + the stable content routes that are the site's real
 * ranking / AI-citation substrate: the methodology + sources pages, every
 * Genesis Report, and every archived daily digest. Lab pages are intentionally
 * omitted — `/lab/[slug]` is activity-gated and 404s for labs not currently in
 * the live top set, and a sitemap must never list URLs that can 404.
 *
 * Cached for 6h (`revalidate`) so crawler hits don't SCAN Redis on every fetch.
 */

// .trim() guards against a stray newline/space in the env var — without it the
// origin concatenates into malformed URLs ("https://gawk.dev\n/sources").
const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_ORIGIN?.trim().replace(/\/$/, "") ??
  "https://gawk.dev";

export const revalidate = 21600;

type Freq = MetadataRoute.Sitemap[number]["changeFrequency"];

const STATIC_ROUTES: { path: string; priority: number; freq: Freq }[] = [
  { path: "/", priority: 1.0, freq: "hourly" },
  { path: "/sources", priority: 0.8, freq: "daily" },
  { path: "/methodology", priority: 0.7, freq: "monthly" },
  { path: "/audit", priority: 0.7, freq: "weekly" },
  { path: "/docs/api", priority: 0.5, freq: "monthly" },
  { path: "/newsletter", priority: 0.7, freq: "monthly" },
  { path: "/subscribe", priority: 0.5, freq: "monthly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_ORIGIN}${r.path}`,
    lastModified: now,
    changeFrequency: r.freq,
    priority: r.priority,
  }));

  for (const slug of listReportSlugs()) {
    entries.push({
      url: `${SITE_ORIGIN}/reports/${slug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  // Digest enrichment must never 500 the sitemap. listDigestDates is fail-soft
  // (returns [] on Redis error) and only yields YYYY-MM-DD dates, but we also
  // guard the Date here and wrap the whole block: a sitemap that throws takes
  // down crawl discovery entirely, so degrade to static+reports instead.
  try {
    for (const date of await listDigestDates()) {
      const lastModified = new Date(`${date}T00:00:00Z`);
      if (Number.isNaN(lastModified.getTime())) continue;
      entries.push({
        url: `${SITE_ORIGIN}/digest/${date}`,
        lastModified,
        changeFrequency: "yearly", // a past day's digest is immutable
        priority: 0.5,
      });
    }
  } catch {
    // keep the static + report entries; skip digests this generation
  }

  return entries;
}
