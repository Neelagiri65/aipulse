import { loadFeedResponse } from "@/lib/feed/load";
import { handleV1Request } from "@/lib/api/v1-middleware";
import { FEED_TRIGGERS } from "@/lib/feed/thresholds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleV1Request(request, async () => {
    const now = Date.now();
    const response = await loadFeedResponse(now);
    return {
      // `triggers` is the same frozen object `/methodology` renders and the
      // derivers gate on — served, not restated, so a second client cannot
      // drift from it. Without this a consumer that explains WHY a card
      // surfaced has to hard-code 3 / 10 / 100 / 6 / 12 / 3 / 48 / 5 and
      // silently disagree with the page the first time a threshold moves.
      body: { ...response, triggers: FEED_TRIGGERS },
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
