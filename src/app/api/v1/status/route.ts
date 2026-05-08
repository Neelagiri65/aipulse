import { fetchAllStatus, type StatusResult } from "@/lib/data/fetch-status";
import { withLastKnown } from "@/lib/feed/last-known";
import { handleV1Request } from "@/lib/api/v1-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleV1Request(request, async () => {
    const wrapped = await withLastKnown<StatusResult>(
      "status",
      () => fetchAllStatus(),
      { data: {}, polledAt: new Date().toISOString(), failures: [] },
    );
    const result: StatusResult = wrapped.staleAsOf
      ? { ...wrapped.data, staleAsOf: wrapped.staleAsOf }
      : wrapped.data;

    return {
      body: result,
      cacheControl: "public, s-maxage=60, stale-while-revalidate=120",
      meta: {
        sourceCount: Object.keys(result.data).length,
        generatedAt: result.polledAt ?? new Date().toISOString(),
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
