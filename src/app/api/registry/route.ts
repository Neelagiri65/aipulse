/**
 * Registry read endpoint — public, cheap. Returns the full registry plus
 * meta so the frontend (future archives page, decay-coded globe layer)
 * can consume it with one poll.
 *
 * Response shape:
 *   {
 *     ok: true,
 *     entries: RegistryEntry[],    // every verified repo
 *     meta: RegistryMeta | null,   // last run stats; null if never run
 *     degraded: boolean,           // true = unreadable, NOT "empty"
 *     degradedReason: string|null, // absent | error | unconfigured | corrupt
 *     generatedAt: string          // ISO of this response
 *   }
 *
 * `degraded` exists because `entries: []` on its own is ambiguous: it
 * reads as "we looked and there are no repos" when it can equally mean
 * "we could not look". A consumer counting the array gets a fabricated
 * zero. When `degraded` is true the array carries no information —
 * render "unavailable", never a count.
 *
 * Cache: CDN-friendly 5-minute stale-while-revalidate so the registry
 * read path doesn't hammer Upstash on every UI poll.
 */

import { NextResponse } from "next/server";
import { readAllEntriesDetailed, readMeta } from "@/lib/data/repo-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [read, meta] = await Promise.all([
    readAllEntriesDetailed(),
    readMeta(),
  ]);
  const entries = read.ok ? read.entries : [];
  const generatedAt = new Date().toISOString();
  return NextResponse.json(
    {
      ok: true,
      entries,
      meta,
      degraded: !read.ok,
      degradedReason: read.ok ? null : read.reason,
      generatedAt,
    },
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
