import { fetchGlobeEvents } from "@/lib/data/fetch-events";

// Node runtime. Read path is cheap (Redis LRANGE + JSON parse) when the
// ingest cron is healthy; falls back to an in-process poll when Redis is
// empty or unconfigured, which may fan out to GitHub so we stay on Node.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const result = await fetchGlobeEvents();
  return Response.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
    },
  });
}
