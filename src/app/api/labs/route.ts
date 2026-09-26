/**
 * Public read endpoint for the AI Labs layer.
 *
 * Data source: fetchLabActivity() pulls the last 7 days of public events
 * for every tracked repo in data/ai-labs.json, buckets by lab, and
 * returns a LabsPayload. All live GH calls go through the Next.js Data
 * Cache (revalidate=21600, i.e. 6h) so ordinary page-views never amplify
 * upstream rate-limit pressure — the 6-hourly GH Actions cron refreshes
 * the cache on schedule.
 *
 * CDN caching: s-maxage=1800 (30 min) keeps the client-side poll light
 * while still letting a freshly-warmed Data Cache propagate within half
 * an hour of cron completion. stale-while-revalidate=21600 covers the
 * gap if a cron slot is ever dropped.
 */

import { fetchLabActivity } from "@/lib/data/fetch-labs";
import { describeLabs } from "@/lib/data/lab-repo-descriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Each lab's active repos in their owners' words — the same text its Feed card quotes.
    const payload = await describeLabs(await fetchLabActivity(), process.env.GH_TOKEN);
    return Response.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=21600",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      {
        labs: [],
        generatedAt: new Date().toISOString(),
        failures: [{ step: "api-labs", message }],
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
