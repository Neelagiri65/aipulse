/**
 * Registry read endpoint — public, cheap. Returns a PAGE of the registry plus
 * meta so the frontend (future archives page, decay-coded globe layer) can
 * consume it without pulling the whole corpus.
 *
 * Response shape:
 *   {
 *     ok: true,
 *     entries: ListedRegistryEntry[], // EVERY entry, configs WITHOUT `sample`
 *     meta: RegistryMeta | null,      // last run stats; null if never run
 *     degraded: boolean,              // true = unreadable, NOT "empty"
 *     degradedReason: string|null,    // absent | error | unconfigured | corrupt
 *     generatedAt: string             // ISO of this response
 *   }
 *
 * `?repo=owner/name` returns one entry instead, complete with
 * `configs[].sample` — the verbatim quote that made the repo qualify.
 *
 * It used to return every entry with every sample: 38,451,538 bytes, identical
 * to /api/v1/sources because both duplicated the same read.
 *
 * It still returns EVERY entry, because `Dashboard.tsx` polls this on an
 * interval and draws one map dot per located entry — a page would gut that
 * layer. What it sheds is the sample, 58.6% of the weight, which no consumer
 * in `src/components` reads. /api/v1/sources, which has no UI consumer, is the
 * one that pages.
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

import {
  REGISTRY_CACHE_CONTROL,
  buildRegistryFullBody,
} from "@/lib/data/registry-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const body = await buildRegistryFullBody(new URL(request.url));
  return NextResponse.json(body, {
    headers: {
      // Public, CDN-cacheable for 5 min with 30s stale-while-revalidate
      // so fresh-on-a-poll semantics stay snappy.
      "Cache-Control": REGISTRY_CACHE_CONTROL,
    },
  });
}
