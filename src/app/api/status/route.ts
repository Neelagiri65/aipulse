import { fetchAllStatus } from "@/lib/data/fetch-status";

// Edge runtime: keeps latency low, fits Vercel Hobby free tier, reads the
// cached fetch responses without a Node runtime cold start.
export const runtime = "edge";
// Allow the route to be dynamic — we want to serve per-client responses
// reading from the shared Data Cache rather than generating a single
// static response at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await fetchAllStatus();
  return Response.json(result, {
    headers: {
      // Let downstream (browser / shared CDN) also cache briefly so a user
      // refreshing the page doesn't re-hit the edge function every time.
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    },
  });
}
