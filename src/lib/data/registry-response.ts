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
 * It does not page, and that is deliberate. `Dashboard.tsx:256` polls this
 * endpoint on an interval and turns every entry carrying a location into a dot
 * on the map's registry layer (`registryPoints`, line 320). A page of 100
 * would quietly gut that layer — the map would still render, just with almost
 * nothing on it, which is the worst kind of break.
 *
 * What it CAN shed is the sample: the only consumer reads `configs[].kind`,
 * `location`, `lastActivity`, `stars`, `language` and `fullName`, and nothing
 * anywhere in `src/components` reads `configs[].sample`. Dropping it takes
 * 58.6% off the payload every polling client was downloading, with no shape
 * change for the code that consumes it.
 *
 * The real fix is a point-shaped endpoint serving only located entries and
 * only the fields a dot needs — a separate PR, because it changes what the map
 * renders from and deserves its own verification.
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
