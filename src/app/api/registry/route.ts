/**
 * Registry read endpoint — public, cheap. Returns the full registry plus
 * meta so the frontend (future archives page, decay-coded globe layer)
 * can consume it with one poll.
 *
 * Response shape:
 *   {
 *     ok: true,
 *     entries: RegistryEntry[],   // every verified repo
 *     meta: RegistryMeta | null,  // last run stats; null if never run
 *     generatedAt: string         // ISO of this response
 *   }
 *
 * Cache: CDN-friendly 5-minute stale-while-revalidate so the registry
 * read path doesn't hammer Upstash on every UI poll.
 */

import { NextResponse } from "next/server";
import { readAllEntries, readMeta } from "@/lib/data/repo-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [entries, meta] = await Promise.all([readAllEntries(), readMeta()]);
  const generatedAt = new Date().toISOString();
  return NextResponse.json(
    { ok: true, entries, meta, generatedAt },
    {
      headers: {
        // Public, CDN-cacheable for 5 min with 30s stale-while-revalidate
        // so fresh-on-a-poll semantics stay snappy.
        "Cache-Control":
          "public, max-age=60, s-maxage=300, stale-while-revalidate=30",
      },
    },
  );
}
