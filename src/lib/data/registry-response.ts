/**
 * The body both public registry endpoints serve — `/api/v1/sources` and
 * `/api/registry`.
 *
 * They were byte-identical (38,451,538 bytes each, measured 2026-09-18) because
 * they duplicated the same "read everything, serialise everything" logic. One
 * builder now, so a fix to one is a fix to both: that duplication is exactly
 * how `/api/registry` would have kept serving 38MB after `/api/v1/sources` was
 * paged.
 *
 * WHAT CHANGED, and why it is worth the break:
 *   - The list is a PAGE (default 100, max 1000), not the whole corpus. At
 *     31,764 entries and +520/day, "everything in one response" had no
 *     ceiling; it already took 25–30s and `jq` could not parse the result.
 *   - List rows carry configs WITHOUT `configs[].sample` — 58.6% of the
 *     corpus by weight (23.8MB of 40.7MB across 45,756 configs).
 *   - The sample is not gone. `?repo=owner/name` returns one entry complete
 *     with it — the trust contract ("this is WHY we counted it") in the only
 *     context a reader can use it: one repo at a time.
 *
 * `degraded` keeps its meaning exactly: true means the registry could not be
 * READ, and the entries array carries no information. It never means "empty".
 */

import {
  clampPageLimit,
  countEntries,
  readEntriesPage,
  readEntry,
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

export type RegistryBody = RegistryListBody | RegistryDetailBody;

/** Shared cache header. Unchanged from what both routes already sent. */
export const REGISTRY_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=30";

export function isDetailBody(body: RegistryBody): body is RegistryDetailBody {
  return "entry" in body;
}

/**
 * Build the response body for a registry request.
 *
 * `?repo=owner/name` → one full entry. Anything else → a page of listed
 * entries. A repo that is absent from the registry is `entry: null` with
 * `degraded: false`: we looked, it is not there. That is a measurement, unlike
 * a read failure, which sets `degraded`.
 */
export async function buildRegistryBody(url: URL): Promise<RegistryBody> {
  const generatedAt = new Date().toISOString();
  const repo = url.searchParams.get("repo");

  if (repo && repo.trim() !== "") {
    const [entry, meta] = await Promise.all([
      readEntry(repo.trim()),
      readMeta(),
    ]);
    return {
      ok: true,
      entry,
      repo: repo.trim(),
      meta,
      degraded: false,
      degradedReason: null,
      generatedAt,
    };
  }

  const limit = clampPageLimit(url.searchParams.get("limit"));
  const cursor = url.searchParams.get("cursor") ?? "0";
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
      cursor: cursor.trim() === "" ? "0" : cursor,
      nextCursor: read.ok ? read.nextCursor : null,
      total,
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
