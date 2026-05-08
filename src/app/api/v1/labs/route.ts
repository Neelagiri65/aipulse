import { fetchLabActivity } from "@/lib/data/fetch-labs";
import { handleV1Request } from "@/lib/api/v1-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleV1Request(request, async () => {
    try {
      const payload = await fetchLabActivity();
      return {
        body: payload,
        cacheControl: "public, s-maxage=1800, stale-while-revalidate=21600",
        meta: {
          sourceCount: payload.labs?.length ?? 0,
          generatedAt: payload.generatedAt ?? new Date().toISOString(),
          cacheMaxAge: 1800,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        body: {
          labs: [],
          generatedAt: new Date().toISOString(),
          failures: [{ step: "api-v1-labs", message }],
        },
        status: 500,
        cacheControl: "no-store",
        meta: {
          sourceCount: 0,
          generatedAt: new Date().toISOString(),
        },
      };
    }
  });
}

export async function OPTIONS(request: Request) {
  return handleV1Request(request, async () => ({
    body: null,
    meta: { generatedAt: new Date().toISOString() },
  }));
}
