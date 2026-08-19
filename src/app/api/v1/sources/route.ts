import { readAllEntriesDetailed, readMeta } from "@/lib/data/repo-registry";
import { handleV1Request } from "@/lib/api/v1-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleV1Request(request, async () => {
    // `degraded` distinguishes "no repos" from "could not read". Without
    // it an API consumer counts `entries` and republishes a zero we never
    // measured. See /api/registry for the full rationale.
    const [read, meta] = await Promise.all([
      readAllEntriesDetailed(),
      readMeta(),
    ]);
    const entries = read.ok ? read.entries : [];
    const generatedAt = new Date().toISOString();
    return {
      body: {
        ok: true,
        entries,
        meta,
        degraded: !read.ok,
        degradedReason: read.ok ? null : read.reason,
        generatedAt,
      },
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
