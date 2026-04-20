# Issues — Regional RSS Feeds for THE WIRE

**Parent PRD:** `docs/prd-regional-rss.md` (approved 2026-04-20, session 21)
**Feature branch:** `feature/regional-rss`
**Discipline:** one issue = one or more TDD commits. Never commit broken code. `AUDITOR-REVIEW: PENDING` tag on every commit per CLAUDE.md dual-model build protocol.

---

## Issue RSS-01 — Sources registry + schema validator

**Goal:** typed registry of the 5 publisher feeds with verifiable HQ coords and RSS URLs, plus a deterministic schema validator. Zero UI. Foundation for everything downstream.

**Files:**
- create `src/lib/data/rss-sources.ts` (types, `RSS_SOURCES` constant, `validateRssSources()`)
- create `src/lib/data/__tests__/rss-sources.test.ts`

**Entries (5):**
1. `the-register-ai` — The Register AI · London, UK · `en` · `https://www.theregister.com/software/ai_ml/headlines.atom` · hqSourceUrl: The Register "About Us" page citing London HQ.
2. `heise-ai` — Heise.de KI · Hanover, DE · `de` · `https://www.heise.de/thema/Kuenstliche-Intelligenz?mode=rss` · hqSourceUrl: Heise Medien Impressum (legal requirement in Germany — authoritative HQ source).
3. `synced-review` — Synced Review · Beijing, CN · `en` · `https://syncedreview.com/feed/` · hqSourceUrl: Synced Review "About" page.
4. `analytics-india-magazine` — Analytics India Magazine · Mumbai, IN · `en` · `https://analyticsindiamag.com/category/ai-news-updates/feed/` · hqSourceUrl: AIM "Contact Us" page. **AUDITOR-PENDING**: verify Mumbai vs Bangalore from primary source.
5. `mit-tech-review-ai` — MIT Technology Review AI · Cambridge MA, US · `en` · `https://www.technologyreview.com/topic/artificial-intelligence/feed/` · hqSourceUrl: MIT TR "About" page.

**Acceptance:**
- `validateRssSources(RSS_SOURCES)` returns `{ ok: true, entries }` for the real registry.
- Validator rejects: missing field, `lat` OOB, `lng` OOB, `countryCode` not `^[A-Z]{2}$`, `rssUrl` not `https://`, `hqSourceUrl` not `https://`, `lang` empty, duplicate `id`, empty registry.
- All 5 `rssUrl` values return HTTP 200 with `content-type` matching `xml|rss|atom` at commit time (verified with `curl --head`; output captured in the commit message body).
- Test suite ≥10 cases covering each rejection branch + happy path + duplicate-id.
- `npm run build` clean. `npm test` all green (baseline 118 → 128+).

**Commit message:**
```
feat(rss): regional source registry + schema validator

5 curated non-HN publisher feeds with verified HQ coords: The Register (UK),
Heise (DE), Synced Review (CN), Analytics India Magazine (IN), MIT TR (US).

AUDITOR-REVIEW: PENDING
  - AIM HQ city (Mumbai per user brief; Auditor to verify against publisher
    Contact page primary source before merge)
  - All 5 rssUrl values verified 200 OK via `curl --head` at commit time
    (output pasted in PR body)
  - Synced Review transparency caveat (English-language publication about
    Chinese AI, not native Chinese-language primary source)
  - UK vs GB ISO-2 choice (using UK per lay-reader convention)
```

---

## Issue RSS-02 — Parser + wire-rss + rss-store + ingest route

**Goal:** RSS 2.0 + Atom parser, orchestration that fetches all 5 feeds with per-feed failure isolation, Redis keyspace `rss:*` separate from `hn:*`, secret-gated ingest endpoint. Mirrors `wire-hn.ts` shape exactly.

**Files:**
- create `src/lib/data/wire-rss.ts` (pure-logic: `parseRss20`, `parseAtom`, `parseFeed`, `normaliseItem`, `runRssIngest`)
- create `src/lib/data/rss-store.ts` (Redis store for `rss:item:*`, `rss:source:*`, `rss:wire` ZSET, `rss:meta`)
- create `src/app/api/wire/ingest-rss/route.ts`
- create `src/lib/data/__tests__/wire-rss.test.ts`

**Key decisions:**
- **XML parser choice:** check `package.json` first. If `fast-xml-parser` is already present, use it. Otherwise hand-roll a minimal parser with `DOMParser` equivalent for Node — RSS 2.0 and Atom have a small well-known surface. **Prefer hand-roll** to avoid a new dep; the parser only needs to extract `<item>` / `<entry>` nodes and a handful of child text values.
- **Dedupe key:** RSS 2.0 uses `<guid>` (sometimes missing); Atom uses `<id>` (always present); fall back to URL. Compute a canonical `itemId = sha1(sourceId + "·" + guidOrUrl).slice(0,16)` at ingest time.
- **Timestamp:** RSS uses `<pubDate>` (RFC 822); Atom uses `<published>` or `<updated>` (RFC 3339). Normalise to `Date.parse()` → seconds, store as ZSET score.
- **Per-feed failure isolation:** one fetch error logs to `rss:source:{id}.lastError`; other sources keep running. No single failure aborts the batch.
- **Item TTL:** 7 days (matches wire freshness budget; publishers rarely delete items faster than that).
- **Redis cmd budget per run:** 5 sources × (GET source + fetch + parse + 10 GET item + 10 SET item + 10 ZADD) + 1 prune = ~160 cmds. 48 runs/day = ~7.7k/day. Safe.

**Acceptance:**
- Given a canned RSS 2.0 XML fixture, `parseFeed` returns ≥5 normalised items.
- Given a canned Atom XML fixture, `parseFeed` returns ≥5 normalised items.
- Malformed XML → empty array, no throw. Logged to `failures` array.
- `runRssIngest` with a fixture fetcher writes items to a mock Redis store and returns `{ ok, sources: [{ id, fetched, written, error }] }`.
- One source throwing does NOT prevent other sources from being written.
- Items duplicate on second run → no double-write (`writeItem` preserves `firstSeenTs`, mirroring HN pattern).
- Dedupe by `itemId` at ingest time; if an item reappears it keeps `firstSeenTs`.
- `/api/wire/ingest-rss` POST with wrong secret → 401; right secret → 200 with `{ ok, result }`.
- Tests mock `fetch`; no real network calls in unit suite.
- ≥15 new unit tests (baseline 128 → 143+).

**Commit message:**
```
feat(rss): RSS 2.0 + Atom parser + ingest pipeline + Redis store

wire-rss.ts: deterministic parser, per-feed failure isolation, dedupe-by-itemId.
rss-store.ts: rss:item:* (7d), rss:source:*, rss:wire ZSET, rss:meta.
/api/wire/ingest-rss: secret-gated POST mirroring /api/wire/ingest-hn.

AUDITOR-REVIEW: PENDING
  - Hand-rolled XML parser vs. fast-xml-parser tradeoff (picked hand-roll for
    zero-dep; review fragility on exotic feeds)
  - Redis cmd budget estimate (~7.7k/day, confirmed under free tier)
  - 7d item TTL (matches wire freshness budget)
```

---

## Issue RSS-03 — /api/rss read route + RegionalWirePanel + SourceCard

**Goal:** public read endpoint assembled in ≤4 Redis commands, 9th LeftNav panel listing sources by 24h activity desc, SourceCard on dot click.

**Files:**
- create `src/app/api/rss/route.ts` (public GET, Next Data Cache 60s revalidate, CDN `s-maxage=30, stale-while-revalidate=300`)
- create `src/components/wire/RegionalWirePanel.tsx`
- create `src/components/wire/SourceCard.tsx`
- create `src/components/wire/country-pill.tsx` (exports `CountryPill`, `LangTag`)

**Acceptance:**
- `GET /api/rss` returns `{ ok, sources: SourceStatus[], items: RssWireItem[], meta }` where `sources` carries per-source 24h count + stale flag + `lastFetchOkTs`.
- Redis assembly: 1 ZRANGE + 1 MGET items + 1 MGET sources + 1 GET meta. Exactly 4 cmds per origin hit (matching HN pattern in `hn-store.ts:308-410`).
- Graceful: Redis unavailable → returns `source: "unavailable"` with empty arrays and a friendly message. Never throws.
- `RegionalWirePanel` renders 5 rows, each: `[COUNTRY-PILL] [LANG-TAG?] Source Name · 24h count · stale badge?`. Sort: count desc, then name asc for ties.
- `SourceCard` (380px width, `forwardRef` like `LabCard`): header pill for country + language, source name, city/country, last 7 items as click-through rows with title + relative-time + pubDate tooltip, HQ source link, STALE banner when `staleHours > 24`.
- `CountryPill`: neutral slate bg (`#1e293b`), slate-200 text, 11px, uppercase, ISO-2 only, 4px rounded corners, 2px horizontal padding. Same dimensions as HN orange pill.
- `LangTag`: rendered only when `lang !== "en"`, inline after CountryPill, tiny uppercase slate-400 text, no border.

**Commit message:**
```
feat(rss): /api/rss read route + RegionalWirePanel + SourceCard

4-cmd Redis assembly. 9th LeftNav panel sorted by 24h activity.
SourceCard with last-7-items click-through + STALE banner.
CountryPill (neutral slate) + LangTag (non-en only).

AUDITOR-REVIEW: PENDING
  - Panel sort order (24h count desc, ties by name asc)
  - SourceCard "last 7 items" scope vs. "all 7d items"
  - LangTag only-when-non-en rule (prevents DE/EN decoration asymmetry)
```

---

## Issue RSS-04 — Map layer + WirePage merge + filter toggle

**Goal:** amber #f97316 dots on globe + flat-map, GlobeLegend/MapLegend update, FilterPanel layer toggle, HN+RSS merged in WirePage.

**Files:**
- create `src/components/wire/rss-to-points.ts` (pure: `RSS_AMBER = "#f97316"`, `RSS_MIN_SIZE = 0.3`, `RSS_MAX_SIZE = 1.1`, `RSS_INACTIVE_OPACITY = 0.35`, `rssToGlobePoints(sourceStatuses, rssSources) → GlobePoint[]`)
- create `src/components/wire/__tests__/rss-to-points.test.ts`
- modify `src/components/globe/Globe.tsx` (new `rss`/`activeRss`/`maxRssSize` bucket in `clusterPoints`, new color branch, sort rank: live=0 / hn=1 / rss=2 / lab=3 / registry=4)
- modify `src/components/map/FlatMap.tsx` (mirror)
- modify `src/components/globe/event-detail.tsx` (delegate to SourceCard for rss-only clusters)
- modify `src/components/chrome/FilterPanel.tsx` (add `regional-rss` filter id, default ON)
- modify `src/components/dashboard/WirePage.tsx` (merge HN + RSS, sort by `firstSeenTs` desc, render CountryPill/LangTag for rss rows)
- modify `src/components/dashboard/Dashboard.tsx` (fetch `/api/rss`, 10-min poll, pass through to Globe/FlatMap/WirePage)

**Acceptance:**
- `rssToGlobePoints` is pure + deterministic with p95-clamped log-linear sizing (same shape as `labs-to-points.ts`).
- Unit tests: size clamping, zero-activity dim, kind=rss meta marker, stale dot renders grey not amber.
- Globe cluster containing mixed live + rss paints rss amber only when rss is majority; otherwise live teal wins (precedence: live > rss > hn > lab > registry).
- WirePage merged row list: HN + RSS interleaved by `firstSeenTs` desc, capped at 50 visible. Each RSS row shows CountryPill, optional LangTag for `de`, source name, title, relative-time. Click opens article URL in new tab.
- Filter toggle OFF → no amber dots visible, no RSS rows in WIRE panel.
- Build clean. Typecheck clean. All unit tests green (baseline 143 → 150+).

**Commit message:**
```
feat(rss): amber map layer + country pill + HN/RSS wire merge

Amber #f97316 layer with p95-clamped log-linear sizing.
Cluster precedence: live > rss > hn > lab > registry.
WirePage merges HN + RSS client-side, sort by firstSeenTs desc.

AUDITOR-REVIEW: PENDING
  - Amber vs HN orange contrast at world zoom (visual verification before merge)
  - Cluster precedence ordering (rss ahead of hn because dot-is-publisher is a
    stronger locational signal than dot-is-author-optional-profile)
  - 50-row WIRE cap (same as existing HN behaviour)
```

---

## Issue RSS-05 — Cron + data-sources registry + Playwright + merge

**Goal:** close the feature. GitHub Actions cron every 30 min. 5 new entries in `data-sources.ts` + `public/data-sources.md` committed together. 3 Playwright smokes. HANDOFF.md updated.

**Files:**
- create `.github/workflows/rss-ingest.yml` (cron `25,55 * * * *`)
- modify `src/lib/data-sources.ts` (add 5 `DataSource` entries: `RSS_THE_REGISTER_AI`, `RSS_HEISE_AI`, `RSS_SYNCED_REVIEW`, `RSS_AIM`, `RSS_MIT_TR_AI`; category `"community-sentiment"` or new `"press-rss"` — decision in §ADR below)
- modify `public/data-sources.md` (5 mirror entries with transparency caveats per publisher)
- create `tests/visual/07-regional-wire.spec.ts`
- modify `tests/visual/04-chrome.spec.ts` (LeftNav button list widened from 8 → 9)
- modify `HANDOFF.md` (session 21 entry)

**ADR — new category `"press-rss"` vs. reuse `"community-sentiment"`:**
- `"community-sentiment"` is currently HN-only (upvote-driven crowd signal).
- RSS feeds are editor-curated, not community-voted — fundamentally different provenance.
- **Decision:** add `"press-rss"` category. Keeps the taxonomy honest; prevents Auditor confusion about whether a number is "what crowd voted" vs "what editor picked".

**Acceptance:**
- Cron runs every 30 min on minutes 25/55 (confirmed no collision with existing crons: HN ingest on `5,20,35,50`, labs cron on `0 */6`, etc.).
- Each of the 5 `DataSource` entries has: `verifiedAt: "2026-04-20"`, pre-committed `sanityCheck` (items-per-24h range), publisher-specific `caveat`, `powersFeature: ["regional-wire", "map", "wire-panel"]`.
- `public/data-sources.md` mirror prose includes Synced Review transparency caveat verbatim.
- Source registry count: 18 → 23 (confirmed by the audit page link).
- Playwright smoke `07-regional-wire.spec.ts`: (a) panel opens via 9th nav button, (b) ≥1 amber map dot visible at world zoom OR at least one non-US CountryPill visible in WIRE panel (relaxed floor — globe cluster-majority may hide amber at world zoom, same pattern as labs layer), (c) SourceCard opens on dot click.
- `04-chrome.spec.ts` LeftNav assertion widened from 8 → 9 buttons to include "Regional Wire".
- 23/23 pre-existing + 3/3 new = 26/26 smoke tests green against feature branch.

**Commit message:**
```
feat(rss): cron + data-sources registry + visual smoke

5 RSS_* DataSource entries (press-rss category, new slot).
rss-ingest cron 25,55 * * * * (no existing-cron collisions).
tests/visual/07-regional-wire.spec.ts (3 smokes).
LeftNav widened 8 → 9 in 04-chrome smoke.

AUDITOR-REVIEW: PENDING
  - "press-rss" category vs reuse "community-sentiment" (picked new slot)
  - sanityCheck items-per-24h ranges per publisher (conservative estimates
    from a 3-day observed-baseline dry-run before cron enablement)
  - Cron minute choice 25,55 (avoids HN 5/20/35/50 + labs 0)
```

---

## Integration + PR (CLAUDE.md Phase 2 Step 5)

Before merging `feature/regional-rss` → `main`:

1. `npm run build` clean.
2. `npm test` all green (baseline 118 → ~150+ after RSS-01..04).
3. `npm run test:visual:local` against dev server → 23 pre-existing + 3 new = 26 green.
4. Confirm rate-limit math: 5 feeds × 48 polls/day = 240 HTTP/day; Redis ~7.7k cmd/day. Both safe.
5. Confirm `/audit` score is not worsened by the new `data-sources.ts` entries.
6. Manual trigger of `rss-ingest` workflow on the PR branch → verify all 5 sources write items.
7. Visual sanity check: amber vs HN orange at world zoom → if mushy, swap hue now before merge.
8. Open PR, Auditor review sweep, merge, Vercel auto-deploy, `npm run test:visual` against prod, HANDOFF.md update, commit, push.

---

## AUDITOR-REVIEW cumulative (pending before PR merge)

From RSS-01:
1. AIM HQ city primary-source verification.
2. All 5 `rssUrl` values returning 200 at commit time.
3. Synced Review transparency caveat wording.
4. UK vs GB ISO-2 choice.

From RSS-02:
5. Hand-rolled XML parser vs fast-xml-parser tradeoff.
6. 7d item TTL.
7. Redis cmd budget estimate.

From RSS-03:
8. SourceCard "last 7 items" vs "all 7d items" scope.
9. LangTag only-when-non-en rule.

From RSS-04:
10. Amber vs HN orange contrast at world zoom.
11. Cluster precedence ordering (rss ahead of hn).
12. 50-row WIRE cap.

From RSS-05:
13. `press-rss` category vs reuse `community-sentiment`.
14. sanityCheck items-per-24h ranges per publisher.
15. Cron minute choice 25,55.
