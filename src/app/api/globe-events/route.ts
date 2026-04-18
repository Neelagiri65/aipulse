import { fetchGlobeEvents } from "@/lib/data/fetch-events";

// Node runtime (not edge) — fetchGlobeEvents does up to ~30 parallel GitHub
// calls on a cold cache; Node has a generous CPU/time budget on Vercel's
// serverless functions and the Data Cache is shared across runtimes.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await fetchGlobeEvents();
  return Response.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
    },
  });
}
