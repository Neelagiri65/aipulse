import { fetchTopModels } from "@/lib/data/fetch-models";

// Node runtime keeps us consistent with the other aggregation endpoints
// (status, registry). The 15-min Next.js Data Cache inside fetchTopModels
// fronts HuggingFace; a short CDN cache on top lets repeat-loads inside
// a tab share the same response without server round-trips.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await fetchTopModels();
  return Response.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
    },
  });
}
