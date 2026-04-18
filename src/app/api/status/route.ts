import { fetchAllStatus } from "@/lib/data/fetch-status";

// Node runtime: matches globe-events for consistency. An earlier edge-runtime
// deploy returned `unknown` for OpenAI while local curl to the same endpoint
// succeeded — likely an edge-fetch quirk with status.openai.com. Node avoids
// the divergence; the 5-min Data Cache keeps the cost trivial.
export const runtime = "nodejs";
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
