import { readAllEntries, readMeta } from "@/lib/data/repo-registry";
import { handleV1Request } from "@/lib/api/v1-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleV1Request(request, async () => {
    const [entries, meta] = await Promise.all([readAllEntries(), readMeta()]);
    const generatedAt = new Date().toISOString();
    return {
      body: { ok: true, entries, meta, generatedAt },
      cacheControl: "public, max-age=60, s-maxage=300, stale-while-revalidate=30",
      meta: {
        sourceCount: entries.length,
        generatedAt,
        cacheMaxAge: 300,
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
