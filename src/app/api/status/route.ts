import { fetchAllStatus, type StatusResult } from "@/lib/data/fetch-status";
import { withLastKnown } from "@/lib/feed/last-known";

// Node runtime: matches globe-events for consistency. An earlier edge-runtime
// deploy returned `unknown` for OpenAI while local curl to the same endpoint
// succeeded — likely an edge-fetch quirk with status.openai.com. Node avoids
// the divergence; the 5-min Data Cache keeps the cost trivial.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // fetchAllStatus is fail-tolerant per-source (collects per-tool failures
  // but never throws), so withLastKnown's catch path only triggers on a
  // hard error in the orchestrator itself. The cache layer is here so a
  // total fetch_failed (e.g. Vercel egress glitch) still serves the last
  // good snapshot rather than every tool flipping to "unknown".
  const wrapped = await withLastKnown<StatusResult>(
    "status",
    () => fetchAllStatus(),
    { data: {}, polledAt: new Date().toISOString(), failures: [] },
  );
  const result: StatusResult = wrapped.staleAsOf
    ? { ...wrapped.data, staleAsOf: wrapped.staleAsOf }
    : wrapped.data;
  return Response.json(result, {
    headers: {
      // Let downstream (browser / shared CDN) also cache briefly so a user
      // refreshing the page doesn't re-hit the edge function every time.
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    },
  });
}
