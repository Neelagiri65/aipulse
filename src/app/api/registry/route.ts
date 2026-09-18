/**
 * Registry read endpoint — public, cheap. Returns a PAGE of the registry plus
 * meta so the frontend (future archives page, decay-coded globe layer) can
 * consume it without pulling the whole corpus.
 *
 * Response shape:
 *   {
 *     ok: true,
 *     entries: ListedRegistryEntry[], // one page, configs WITHOUT `sample`
 *     page: { limit, cursor, nextCursor, total },
 *     meta: RegistryMeta | null,      // last run stats; null if never run
 *     degraded: boolean,              // true = unreadable, NOT "empty"
 *     degradedReason: string|null,    // absent | error | unconfigured | corrupt
 *     generatedAt: string             // ISO of this response
 *   }
 *
 * `?repo=owner/name` returns one entry instead, complete with
 * `configs[].sample` — the verbatim quote that made the repo qualify.
 *
 * It used to return every entry with every sample: 38,451,538 bytes,
 * identical to /api/v1/sources because both duplicated the same read. Both now
 * go through `buildRegistryBody`, so neither can drift back.
 *
 * `degraded` exists because `entries: []` on its own is ambiguous: it
 * reads as "we looked and there are no repos" when it can equally mean
 * "we could not look". A consumer counting the array gets a fabricated
 * zero. When `degraded` is true the array carries no information —
 * render "unavailable", never a count. Note that `page.total` is the corpus
 * size and `entries.length` is only this page: neither is the other.
 *
 * Cache: CDN-friendly 5-minute stale-while-revalidate so the registry
 * read path doesn't hammer Upstash on every UI poll.
 */

import { NextResponse } from "next/server";

import {
  REGISTRY_CACHE_CONTROL,
  buildRegistryBody,
} from "@/lib/data/registry-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const body = await buildRegistryBody(new URL(request.url));
  return NextResponse.json(body, {
    headers: {
      // Public, CDN-cacheable for 5 min with 30s stale-while-revalidate
      // so fresh-on-a-poll semantics stay snappy.
      "Cache-Control": REGISTRY_CACHE_CONTROL,
    },
  });
}
