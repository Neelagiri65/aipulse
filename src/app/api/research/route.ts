import { fetchRecentPapers } from "@/lib/data/fetch-research";

// Node runtime for consistency with /api/models + /api/registry. ArXiv
// accepts ~1 req/3s per IP as courtesy; our 30-min Next.js Data Cache
// keeps us two orders of magnitude under. CDN layer on top collapses
// concurrent tab loads to one upstream call per 15 min per region.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await fetchRecentPapers();
  return Response.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
    },
  });
}
