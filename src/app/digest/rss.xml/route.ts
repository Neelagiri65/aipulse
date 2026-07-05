/**
 * GET /digest/rss.xml — RSS 2.0 feed of the archived daily digests.
 *
 * Primary consumer: the Zapier "New Item in Feed" trigger that
 * cross-posts each day's digest to the LinkedIn company page (see the
 * distribution runbook in the vault). Also a plain RSS surface for
 * readers.
 *
 * Budget posture: Zapier polls every ~15 min. The CDN cache header
 * (s-maxage) absorbs those polls so the Redis archive is read at most
 * ~every 30 min, not per-request — the same Upstash-frugality rule as
 * the tool-health read path. Fail-soft like the sitemap: an archive
 * error yields a valid empty channel, never a 500.
 */

import { listDigestDates, readDigestBody } from "@/lib/digest/archive";
import { buildDigestRssXml, type DigestRssItem } from "@/lib/digest/rss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS = 7;
const SITE_ORIGIN = "https://gawk.dev";

export async function GET(): Promise<Response> {
  let items: DigestRssItem[] = [];
  try {
    const dates = (await listDigestDates()).slice(0, MAX_ITEMS);
    const bodies = await Promise.all(dates.map((d) => readDigestBody(d)));
    items = bodies
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .map((b) => ({
        date: b.date,
        subject: b.subject,
        tldr: b.tldr,
        generatedAt: b.generatedAt,
      }));
  } catch {
    // Fail-soft: empty channel below. A feed must never 500 — Zapier
    // treats repeated errors as a broken zap and pauses it.
  }

  return new Response(buildDigestRssXml(items, SITE_ORIGIN), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}
