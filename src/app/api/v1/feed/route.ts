import { loadFeedResponse } from "@/lib/feed/load";
import { handleV1Request } from "@/lib/api/v1-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleV1Request(request, async () => {
    const now = Date.now();
    const response = await loadFeedResponse(now);
    return {
      body: response,
      cacheControl: "public, s-maxage=60, stale-while-revalidate=300",
      meta: {
        sourceCount: response.cards?.length ?? 0,
        generatedAt: new Date(now).toISOString(),
        cacheMaxAge: 60,
      },
    };
  });
}

export async function OPTIONS(request: Request) {
  return handleV1Request(request, async () => ({
    body: null,
    meta: { generatedAt: new Date().toISOString() },
  }));
}
