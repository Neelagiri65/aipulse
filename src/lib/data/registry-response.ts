/**
 * The bodies the two public registry endpoints serve — `/api/v1/sources` and
 * `/api/registry`.
 *
 * They were byte-identical (38,451,538 bytes each, measured 2026-09-18)
 * because they duplicated the same "read everything, serialise everything"
 * logic. They share this module now, but they do NOT share a shape, and the
 * difference is load-bearing:
 *
 *   - `/api/v1/sources` (`buildRegistryBody`) PAGES — default 100, max 1000.
 *     It has no UI consumer. At 31,764 entries and +520/day, "everything in
 *     one response" had no ceiling; it took 25–30s and `jq` could not parse
 *     the result.
 *   - `/api/registry` (`buildRegistryFullBody`) returns EVERY entry and has
 *     no `page`. It used to be what `Dashboard.tsx` polled for the map's
 *     registry layer; the map now reads `/api/registry/points` (located
 *     entries, dot fields only — `registry-points.ts`). This shape is kept
 *     whole for any external caller, and it has no known consumer in the
 *     tree. Whether it should page is a separate decision.
 *
 * BOTH drop `configs[].sample` from entry lists — 58.6% of the corpus by
 * weight (23.8MB of 40.7MB across 45,756 configs), and nothing in
 * `src/components` reads it. The sample is not gone: `?repo=owner/name`
 * returns one entry complete with it, the trust contract ("this is WHY we
 * counted it") in the only context a reader can use it — one repo at a time.
 *
 * `degraded` keeps its meaning exactly: true means the registry could not be
 * READ, and the entries array carries no information. It never means "empty".
 */

import {
  clampPageLimit,
  countEntries,
  readAllEntriesDetailed,
  readEntriesPage,
  readEntryDetailed,
  readMeta,
  toListEntry,
  type ListedRegistryEntry,
  type RegistryEntry,
  type RegistryMeta,
} from "@/lib/data/repo-registry";

export type RegistryPageInfo = {
  /** Page size asked of Redis. Advisory: a page may hold fewer. */
  limit: number;
  /** The cursor this page was read from. `"0"` is the start. */
  cursor: string;
  /** Pass as `?cursor=` for the next page. `null` means the walk is done. */
  nextCursor: string | null;
  /**
   * Entries in the WHOLE registry (one HLEN), not in this response — and null
   * when the store could not be counted, never a 0 nobody measured.
   */
  total: number | null;
};

export type RegistryListBody = {
  ok: true;
  entries: ListedRegistryEntry[];
  page: RegistryPageInfo;
  meta: RegistryMeta | null;
  degraded: boolean;
  degradedReason: string | null;
  generatedAt: string;
};

export type RegistryDetailBody = {
  ok: true;
  /** The full entry, `configs[].sample` included. Null when not registered. */
  entry: RegistryEntry | null;
  repo: string;
  meta: RegistryMeta | null;
  degraded: boolean;
  degradedReason: string | null;
  generatedAt: string;
};

/**
 * The whole corpus, projected. `/api/registry` only — see `buildRegistryBody`.
 * No `page`, because there is no paging: this IS everything.
 */
export type RegistryFullBody = {
  ok: true;
  entries: ListedRegistryEntry[];
  meta: RegistryMeta | null;
  degraded: boolean;
  degradedReason: string | null;
  generatedAt: string;
};

export type RegistryBody =
  | RegistryListBody
  | RegistryDetailBody
  | RegistryFullBody;

/** Shared cache header. Unchanged from what both routes already sent. */
export const REGISTRY_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=30";

export function isDetailBody(body: RegistryBody): body is RegistryDetailBody {
  return "entry" in body;
}

export function isPagedBody(body: RegistryBody): body is RegistryListBody {
  return "page" in body;
}

/**
 * `/api/registry` — the WHOLE corpus, projected.
 *
 * It does not page. That was load-bearing while `Dashboard.tsx` polled it for
 * the map's registry layer (a page of 100 would have gutted the layer while
 * the map still looked like it worked). The map now reads
 * `/api/registry/points` — located entries, dot fields only — so this body
 * has no consumer in `src/components`. It is kept whole, minus the sample,
 * for external callers; nothing here decides whether it should page.
 *
 * It sheds `configs[].sample` (58.6% of the corpus by weight); `?repo=` still
 * returns one entry with it.
 */
export async function buildRegistryFullBody(
  url: URL,
): Promise<RegistryDetailBody | RegistryFullBody> {
  const generatedAt = new Date().toISOString();
  const repo = url.searchParams.get("repo");
  if (repo && repo.trim() !== "") {
    const detail = await buildRegistryBody(url);
    return detail as RegistryDetailBody;
  }
  const [read, meta] = await Promise.all([readAllEntriesDetailed(), readMeta()]);
  return {
    ok: true,
    entries: read.ok ? read.entries.map(toListEntry) : [],
    meta,
    degraded: !read.ok,
    degradedReason: read.ok ? null : read.reason,
    generatedAt,
  };
}

/**
 * Build the response body for a registry request.
 *
 * `?repo=owner/name` → one full entry. Anything else → a page of listed
 * entries.
 *
 * `entry: null` is only an answer when `degraded` is false: we looked, and
 * this repo is not in the registry. With `degraded: true` the same null means
 * we could not look, and a consumer must not turn it into "gawk.dev has not
 * verified this repo".
 */
export async function buildRegistryBody(url: URL): Promise<RegistryBody> {
  const generatedAt = new Date().toISOString();
  const repo = url.searchParams.get("repo");

  if (repo && repo.trim() !== "") {
    const [read, meta] = await Promise.all([
      readEntryDetailed(repo.trim()),
      readMeta(),
    ]);
    // `entry: null` means one of two opposite things and the caller must be
    // able to tell them apart: we looked and this repo is not registered
    // (a measurement), or we could not look (`degraded`). Collapsing them is
    // how a consumer ends up publishing "not verified" about a repo nobody
    // checked.
    return {
      ok: true,
      entry: read.ok ? read.entry : null,
      repo: repo.trim(),
      meta,
      degraded: !read.ok,
      degradedReason: read.ok ? null : read.reason,
      generatedAt,
    };
  }

  const limit = clampPageLimit(url.searchParams.get("limit"));
  // A Redis cursor is always a decimal integer. Anything else is a client
  // typo, and passing it through makes Redis throw — which would surface as
  // `degraded: true` (a store outage) and get CDN-cached under that URL for
  // five minutes. A bad cursor restarts the walk and says so by echoing "0".
  const rawCursor = url.searchParams.get("cursor")?.trim() ?? "";
  const cursor = /^\d+$/.test(rawCursor) ? rawCursor : "0";
  const [read, meta, total] = await Promise.all([
    readEntriesPage({ cursor, limit }),
    readMeta(),
    countEntries(),
  ]);

  return {
    ok: true,
    entries: read.ok ? read.entries.map(toListEntry) : [],
    page: {
      limit,
      cursor,
      nextCursor: read.ok ? read.nextCursor : null,
      // HLEN on a missing key is 0, not an error — so on the `absent` path
      // `countEntries` would hand back a perfectly confident zero for a
      // registry that was evicted. That is the 2026-06-05 number exactly.
      // A count is only a count when the read behind it succeeded.
      total: read.ok ? total : null,
    },
    meta,
    degraded: !read.ok,
    degradedReason: read.ok ? null : read.reason,
    generatedAt,
  };
}

/** Items in THIS response — what `x-gawk-source-count` reports. */
export function responseCount(body: RegistryBody): number {
  return isDetailBody(body) ? (body.entry ? 1 : 0) : body.entries.length;
}
