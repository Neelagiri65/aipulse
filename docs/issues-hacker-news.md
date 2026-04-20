# Issues — Hacker News integration

Decomposition of `docs/prd-hacker-news.md` into 5 dependency-ordered
issues. Each is ≤5 files changed, independently implementable on its
own feature-branch commit, testable against clear pass/fail criteria.
TDD per global CLAUDE.md STEP 4 for any issue containing branching
logic.

Order is strict — HN-02 cannot start until HN-01 merges to
`feature/hn-wire`, etc. All work lands on `feature/hn-wire`; a single
PR from that branch to `main` closes the set.

---

## HN-01 — library, types, filter, sanity ranges (TDD)

**Goal:** deliver the pure-logic layer with zero HTTP dependencies.
Everything in this issue is deterministic and testable offline.

**Prerequisite:** install Vitest as a devDependency. The project has
no test framework today, and the keyword filter is branching logic
per project CLAUDE.md build discipline. Add:

- `vitest` + `@vitest/ui` devDependencies
- `test` and `test:watch` npm scripts
- `vitest.config.ts` at project root
- First test file: `src/lib/data/__tests__/wire-hn.test.ts`

**Files added:**

```
vitest.config.ts
src/lib/data/wire-hn.ts                         # filter + types
src/lib/data/hn-store.ts                        # Redis read/write helpers
src/lib/data/__tests__/wire-hn.test.ts          # Vitest
```

**Files modified:**

```
package.json                                    # devDependencies + scripts
src/lib/data-sources.ts                         # +HN_AI_STORIES entry
```

**Tests (written FIRST, must fail before implementation):**

1. `isAiRelevant("Show HN: I built X with Claude Code", "example.com")` → true (keyword match)
2. `isAiRelevant("How I refactored my monorepo", "example.com")` → false (no match)
3. `isAiRelevant("New paper on transformers", "arxiv.org")` → true (domain match even if keyword absent)
4. `isAiRelevant("The Crypto LLM Pump", "x.com")` → false (blacklist wins over keyword)
5. `isAiRelevant("AI Girlfriend 2.0", "x.com")` → false (blacklist)
6. `isAiRelevant("", "")` → false (defensive)
7. Case-insensitive: `isAiRelevant("CLAUDE released", "X.COM")` → true
8. Domain suffix match: `isAiRelevant("random title", "beta.huggingface.co")` → true

**Implementation scope:**

- Type definitions:
  ```ts
  export type HnStoryRaw = {
    objectID: string;
    title: string;
    url: string | null;
    author: string;
    points: number;
    num_comments: number;
    created_at_i: number;
    created_at: string;
  };
  export type HnItem = {
    id: string;
    title: string;
    url: string | null;
    author: string;
    points: number;
    numComments: number;
    createdAtI: number;
    firstSeenTs: string;
    lastRefreshTs: string;
  };
  export type HnAuthor = {
    username: string;
    rawLocation: string | null;
    lat: number | null;
    lng: number | null;
    resolvedAtTs: string;
    resolveStatus: "ok" | "no_location" | "geocode_failed";
  };
  export type HnWireItem = HnItem & {
    kind: "hn";
    lat: number | null;
    lng: number | null;
    locationLabel: string | null;
  };
  ```
- `isAiRelevant(title, urlHost)` — pure function, exported.
- `hostFromUrl(url)` — extract lowercase host suffix; return empty string on null/invalid.
- `extractLocation(aboutField)` — strip HTML tags, take first line, trim.
- `KEYWORD_ALLOWLIST` and `DOMAIN_ALLOWLIST` and `SOFT_BLACKLIST`
  exported as `readonly` arrays for test visibility.

- `hn-store.ts` skeleton exports:
  - `isHnStoreAvailable()`
  - `writeItem(item: HnItem)` — `SET hn:item:{id}` EX 86400
  - `writeItems(items: HnItem[])` — `MSET` where available, else loop
  - `writeAuthor(a: HnAuthor)` — `SET hn:author:{username}` EX 604800
  - `writeAuthors(authors: HnAuthor[])`
  - `zaddWire(id, score)` — ZADD hn:wire
  - `zpruneWire(cutoffSecs)` — ZREMRANGEBYSCORE hn:wire -inf cutoff
  - `readWireIds()` — ZRANGE hn:wire 0 -1 WITHSCORES descending
  - `readItems(ids)` — MGET hn:item:{ids}
  - `readAuthors(usernames)` — MGET hn:author:{usernames}
  - `writeMeta(meta)` / `readMeta()` — JSON SET/GET hn:meta

- `data-sources.ts`: `HN_AI_STORIES` entry with:
  - `id: "hn-ai-stories"`
  - `status: "verified"`
  - `provenanceClass: "community-discussion"` (new class — see HN-03
    for registry-md alignment)
  - `endpoints: ["hn.algolia.com/api/v1/search_by_date", "hacker-news.firebaseio.com/v0/user/{id}.json"]`
  - `sanity.storiesPerPoll: { min: 0, max: 20 }`
  - `sanity.geocodeResolutionPct: { min: 15, max: 35 }`
  - `caveats:` brief note on unmetered but no published rate limit.

**Acceptance:**

- `npm test` runs Vitest, all 8 tests pass.
- `npm run build` clean.
- No HTTP in this issue. No route. No cron. No UI.

**Commits (strict TDD):**

1. `chore: add vitest test framework`
2. `test(hn): failing tests for isAiRelevant filter`
3. `feat(hn): wire-hn filter + types + hn-store skeleton`
4. `feat(hn): register HN_AI_STORIES source with sanity ranges`

---

## HN-02 — ingest endpoint + cron + manual smoke

**Goal:** end-to-end pipeline writes real HN stories to Redis. No UI
yet. Verify via smoke + Redis inspection.

**Files added:**

```
src/app/api/wire/ingest-hn/route.ts
.github/workflows/wire-ingest-hn.yml
```

**Files modified:**

```
src/lib/data/wire-hn.ts                         # +fetchAlgolia, +fetchHnUser, +runIngest
```

**Implementation scope:**

- `fetchAlgolia(limit=20)`: GET
  `https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=20`.
  Returns `HnStoryRaw[]`. No query filter server-side — we fetch the
  top 20 most-recent stories regardless, then apply
  `isAiRelevant` client-side. This gives us honest sanity-range
  signal (filter pass rate) and stays robust to Algolia's keyword
  syntax limits.
  - *Revision from PRD §Technical Approach:* the PRD described a
    server-side query string. Moving the filter to our code is
    cleaner and gives us pre-filter counts for the sanity range.
    `hitsPerPage` set to 100 actually, so we have headroom — after
    filter we keep up to 20.
- `fetchHnUser(username)`: GET
  `https://hacker-news.firebaseio.com/v0/user/{username}.json`.
  Returns `{ about: string | null }`. Non-HTML; Firebase returns
  plain JSON.
- `runIngest({ cap, source })`:
  1. Fetch Algolia raw → keep hits that pass `isAiRelevant`.
  2. Cap at 20.
  3. For each passing story, check `hn:author:{username}`. Miss →
     fetch Firebase user, `extractLocation(about)`, `geocode()`,
     write `hn:author:*`.
  4. For each story, `writeItem` (overwrites score/comments,
     preserves `firstSeenTs` via read-merge).
  5. `zaddWire` each id with `created_at_i`.
  6. `zpruneWire(now - 86400)`.
  7. Reconcile: read ZSET ids, diff against the fresh 20 IDs — any
     cached id not returned by this Algolia call AND older than 2h
     is assumed moderated → `ZREM` + delete item. (2h grace covers
     Algolia pagination cases where a story simply rolled off the
     first page.)
  8. Write `hn:meta` with `lastFetchOkTs`, `lastFilterPassCount`,
     `geocodeResolutionPct` over 24h window.
  Returns `{ ok, fetched, passed, written, geocoded, droppedModerated, failures }`.

- Route matches the `/api/registry/backfill-events` pattern exactly:
  - `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 120`.
  - POST validates `x-ingest-secret` header.
  - Query params: `cap` (1–20, default 20), `source` (string,
    default `"cron"`).
  - GET delegates to POST.

- GitHub Actions workflow:
  - Cron: `'5,20,35,50 * * * *'`.
  - Steps: `curl -fsSL -X POST -H "x-ingest-secret: ${{ secrets.INGEST_SECRET }}" "${{ secrets.PROD_BASE_URL }}/api/wire/ingest-hn?source=cron"`.
  - `workflow_dispatch` for manual runs.

**Acceptance:**

- `npm run build` clean.
- Manual smoke via `curl` against a locally-forwarded Vercel Preview
  (or `npm run dev` + `UPSTASH_*` env from Keychain): 200 response
  with `fetched >= 1`, `passed >= 0`, `written >= 0`.
- `hn:wire` ZSET has entries. `hn:item:*` keys exist and parse.
- `hn:meta` populated.
- Sanity-range values recorded: if `passed > 20` or
  `geocodeResolutionPct < 15` on first run, flag in the commit
  message (not auto-blocking since first run is noisy).

**Commits:**

1. `feat(hn): ingest library — fetchAlgolia + fetchHnUser + runIngest`
2. `feat(hn): /api/wire/ingest-hn route`
3. `feat(hn): GitHub Actions cron — wire-ingest-hn every 15min`

---

## HN-03 — public read endpoint + `data-sources.md` diff

**Goal:** expose the ingested data on a polled public endpoint with
CDN caching. Document the source for transparency.

**Files added:**

```
src/app/api/hn/route.ts
```

**Files modified:**

```
public/data-sources.md                          # +HN_AI_STORIES section
src/lib/data/hn-store.ts                        # +readWire (assembles HnWireResult)
```

**Implementation scope:**

- `readWire()` in `hn-store.ts`:
  1. `ZRANGE hn:wire 0 -1 WITHSCORES` (DESC).
  2. `MGET hn:item:{ids}` in a single call.
  3. Collect unique usernames → `MGET hn:author:{usernames}` in a
     single call.
  4. Assemble `HnWireItem[]` (merge location from author cache).
  5. Return `{ items, meta, polledAt, coverage: { itemsTotal, itemsWithLocation, geocodeResolutionPct } }`.

- Route `/api/hn`:
  - Public GET, no auth.
  - `runtime = "nodejs"`, `revalidate = 60` (static cache hint).
  - Response headers: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.
  - Shape:
    ```ts
    type HnResult = {
      ok: boolean;
      items: HnWireItem[];
      points: GlobePoint[];              // map-ready
      polledAt: string;
      coverage: { itemsTotal: number;
                  itemsWithLocation: number;
                  geocodeResolutionPct: number };
      meta: { lastFetchOkTs: string | null; staleMinutes: number | null };
      source: "redis" | "unavailable";
    };
    ```

- `data-sources.md` diff:
  - New section under existing category structure.
  - Must match every field in `data-sources.ts::HN_AI_STORIES`
    (CLAUDE.md non-negotiable: registry + md never drift).
  - Includes: two endpoints, cadence, sanity ranges, caveats
    (indexing lag, unmetered but no published limit, 7-day author
    cache, geocoder reuse), and the privacy note (only username +
    raw location + coords stored).

**Acceptance:**

- `npm run build` clean.
- `curl https://<preview-url>/api/hn` returns 200 with non-empty
  `items` after HN-02's smoke has run once.
- `items.length <= 20`, each item has `kind: "hn"` and valid
  `createdAtI`.
- `coverage.geocodeResolutionPct` within `[15, 35]` sanity range
  (or flagged in commit).
- `public/data-sources.md` matches `data-sources.ts` — verified by
  a diff grep of endpoint URLs and sanity range values.

**Commits:**

1. `feat(hn): /api/hn public read route`
2. `docs(sources): register HN_AI_STORIES in public/data-sources.md`

---

## HN-04 — Dashboard wire-up + WirePage HN row + staleness

**Goal:** HN stories appear in THE WIRE alongside GitHub commits,
badged and chronologically interleaved. Staleness indicator lights
up when HN ingest lags.

**Files modified:**

```
src/components/dashboard/Dashboard.tsx          # +useHnPoll, pre-merge wireRows
src/components/dashboard/WirePage.tsx           # +discriminated rows, +staleness
```

**Implementation scope:**

- Dashboard:
  - New polled endpoint `const hn = usePolledEndpoint<HnResult>("/api/hn", HN_POLL_MS)`.
  - `HN_POLL_MS = 60_000` (1 min — above the 60s CDN TTL so every
    poll flips to a fresh upstream when available).
  - Build a discriminated `WireItem` list:
    ```ts
    type WireItem =
      | { kind: "gh"; eventId: string; createdAt: string;
          type: string; actor: string; repo: string;
          hasAiConfig: boolean; sourceKind?: "events-api" | "gharchive" }
      | { kind: "hn"; id: string; createdAt: string;
          title: string; author: string; points: number;
          numComments: number; hnUrl: string;
          locationLabel: string | null };
    ```
  - `wireRows` computed via `useMemo` from `events.data.points`
    (mapped to `gh` variant) + `hn.data.items` (mapped to `hn`
    variant), sorted by `createdAt` DESC.
  - Pass `wireRows`, `eventsCoverage`, `hnMeta` to `WirePage` as
    new props; remove the old `events: GlobeEventsResult` prop.
  - (Map / globe wire-up stays as-is for this issue — HN-05 adds
    HN dots.)

- WirePage:
  - New props: `wireRows: WireItem[]`, `ghCoverage?: …`,
    `hnMeta?: { lastFetchOkTs: string | null; staleMinutes: number | null }`,
    plus existing loading/error.
  - Rendering branches on `row.kind`:
    - `"gh"` variant: existing grid unchanged.
    - `"hn"` variant:
      ```
      [time-ago] [HN · points]  title-truncated                @author
      ```
      - Orange pill for HN: background `#ff6600`-ish, white text,
        font-mono, same size as existing `ap-sev-pill`.
      - Title: truncated with `truncate` className, no link on the
        title separately — whole row is a single `<a>` to HN
        comments.
      - Click target: whole row → `https://news.ycombinator.com/item?id={id}` in new tab.
      - No geotag glyph per Q2 decision.
  - Staleness indicator inside the existing header (`"The Wire"`):
    below the chronological-feed line add a muted line
    `HN: last fetched Nm ago` when `hnMeta.staleMinutes > 30`. Hidden
    otherwise.

**Acceptance:**

- `npm run build` clean.
- `npm run dev` + local Redis-forwarded session: THE WIRE shows
  interleaved GH + HN rows. Clicking an HN row opens the correct
  comments page in a new tab.
- When Algolia is simulated-down (stop the cron, wait >30 min, or
  manually set `hn:meta.lastFetchOkTs` to an old value), staleness
  indicator appears.
- When Redis has no HN items (fresh env), WIRE renders GH-only
  without errors.

**Commits:**

1. `feat(hn): Dashboard pre-merges GH + HN into wireRows`
2. `feat(hn): WirePage renders HN row variant + staleness indicator`

---

## HN-05 — FlatMap + Globe HN dots

**Goal:** HN stories with resolved author locations appear as orange
dots on both the 2D flat map and the 3D globe. Hover card matches
the PRD spec.

**Files modified:**

```
src/components/dashboard/Dashboard.tsx          # pass HN points to map + globe
src/components/map/FlatMap.tsx                  # +HN marker layer
src/components/globe/Globe.tsx                  # +HN dot rendering
src/components/globe/event-detail.tsx           # +HN hover card variant
```

**Implementation scope:**

- Dashboard:
  - Map `hn.data.points` (already GlobePoint-shaped from
    `/api/hn`) into the combined points list:
    `const points = [...livePoints, ...dedupedRegistry, ...hnPoints]`.
  - HN points carry `meta.kind = "hn"` so FlatMap and Globe can
    route rendering.

- FlatMap:
  - New marker layer for `kind === "hn"`.
  - Orange divIcon (`#ff6600`), same geometry class as registry
    dots but distinct colour.
  - Singleton click handler opens `news.ycombinator.com/item?id={id}`
    in a new tab.
  - Hover card (new variant in `event-detail.tsx`): title,
    `HN · points pts · N comments`, `@author`, resolved
    `locationLabel`, HN → YC badge.
  - Z-layer: above registry dots (z-index parity with live event
    pulses is fine).

- Globe:
  - Pass HN points through the existing `points` prop. Distinguish
    colour at render (check `meta.kind === "hn"` → orange).
  - No new geometry; reuse the existing dot layer.

- event-detail.tsx:
  - Add `HnCard({ meta })` component matching the existing
    `EventCard` / `RegistryCard` style. Same z-index as the other
    cards (1200) so it lands above Leaflet panes.

**Acceptance:**

- `npm run build` clean.
- `npm run dev`: flat map shows orange HN dots wherever a story's
  author has a resolvable location. Hover and click both work.
- 3D globe shows the same orange dots.
- Dots stay under 24h Redis TTL → no stale HN dots past a day.
- Visual check: on a sample poll, HN dot count is *at most* the WIRE
  HN row count. (Dots are the subset with resolved location.)

**Commits:**

1. `feat(hn): FlatMap renders HN markers with hover card`
2. `feat(hn): Globe renders HN dots`

---

## Final — merge + HANDOFF + push (not an issue; closes the set)

- Run full `npm run build`.
- Run the test suite (Vitest) — confirm all HN-01 tests still pass.
- Merge `feature/hn-wire` → `main`.
- Update `HANDOFF.md` with session summary: sources now = 10
  (HN_AI_STORIES joins the 9 verified), crons now = 5 (wire-ingest-hn
  joins the 4), Auditor-pending flags lifted from PRD into the
  queued section.
- Push `main`.
- Leave a note that the spec edit (cross-cutting geotag principle
  → `docs/AI_PULSE_V3_SPEC.md` Part 0) is a SEPARATE commit in a
  separate session per user decision.

---

## Out-of-band decisions captured in the PRD grill

Locked so that later issue work doesn't re-derive them:

1. Strict chronological order in WIRE — no weighting by points.
2. Score refresh on every poll (not snapshot-once).
3. Moderation drop on reconciliation (2h grace window).
4. Geocode failure → row stays, no dot, never approximated.
5. Firebase `/item/{id}.json` is **never** called — Algolia is
   authoritative for story fields.
6. `HN_AI_STORIES` is **one** source registry entry (two endpoints
   documented underneath), not two.
7. Redis schema = ZSET (`hn:wire`) + per-item keys + per-author
   keys + meta. No migration of existing GH LIST.
8. Dashboard pre-merges (option b); `WirePage` takes
   `wireRows: WireItem[]`, not raw events.
9. No dedicated HN panel.
10. No mobile responsive work.
11. No spec Part 0 edit inside this PR — separate commit.
