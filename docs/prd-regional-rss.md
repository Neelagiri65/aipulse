# PRD — Regional RSS Feeds for THE WIRE

Status: DRAFT · Session 21 · 2026-04-20
AUDITOR-REVIEW: PENDING (every section below; checkpoints enumerated in §9)

## Problem Statement

THE WIRE is currently HN-only. HN is English-dominant and Silicon-Valley-centric — its author-location map skews heavily to SF Bay, NYC, and London. AI Pulse's premise is *the global AI ecosystem*, so a WIRE that shows only what a US/UK developer crowd upvotes is an under-representation, not a neutral aggregation. Regional publisher RSS feeds are the cheapest honest fix: each one adds a verified non-SV voice, with zero LLM inference and zero synthesis.

## User Story

As a visitor to aipulse-pi.vercel.app, I want to see AI stories from non-US publishers in THE WIRE alongside HN, each labelled with the publisher's country, so I can read what the AI ecosystem sounds like outside the Twitter/HN bubble.

## Acceptance Criteria

1. **Five publisher feeds ingested** on a 30-minute cron, writing to Redis with a separate keyspace from HN:
   - The Register AI — London, UK
   - Heise.de AI — Hanover, DE
   - Synced Review — Beijing, CN
   - Analytics India Magazine — Mumbai, IN (HQ per user brief — Auditor to verify before merge)
   - MIT Technology Review AI — Cambridge MA, US
2. **Each publisher is a row in `data-sources.ts`** with `hqSourceUrl` (citation for HQ city), `rssUrl` (the actual feed we poll), `countryCode` (ISO-2), `lang` (BCP-47 short, e.g. `en`/`de`), `hqLat`, `hqLng`, plus a sanity-range for items-per-24h. Both `data-sources.ts` AND `public/data-sources.md` updated in the same commit (CLAUDE.md drift rule).
3. **Deterministic ingest**: RSS → parse → normalise → write to Redis. No AI-keyword filter (trust publisher's AI-topic scope); no LLM translation; no summarisation. If a feed is malformed, that one feed is skipped and others continue — never fabricate.
4. **WIRE row rendering**: each RSS row shows `[COUNTRY-PILL] Source Name · title · relative-timestamp`. Country pill is a neutral slate pill (not per-country coloured), ISO-2 text. German source additionally shows a small `DE` language tag. Click opens the article URL in a new tab, same behaviour as HN rows.
5. **Map rendering**: one violet-distinct dot per source at HQ coords, sized by 24h item count (log-linear, same curve as labs). Dim (`INACTIVE_OPACITY = 0.35`) when 24h items = 0. Click opens a `SourceCard` listing the last 7 items with click-through.
6. **Colour**: new palette slot `#f97316` (amber-500) for RSS dots — distinct from teal (live GH), violet (labs), orange (HN — `#ff6600`). Amber is close enough to HN orange to read as "news" semantically but separable enough that cluster majority-wins doesn't ambiguate. Auditor to sanity-check the amber-vs-orange contrast at map zoom levels.
7. **Graceful degradation**: per-feed status in Redis (`rss:source:{id}`) with `lastFetchOkTs` + `lastError`. If a feed has been stale > 24h, render a grey card on the source dot and the source row in WIRE carries a `STALE` badge. Never fabricate.
8. **Source registry**: 5 new entries in `SOURCES` (numbered `RSS_*`); registry count 18 → 23. Each entry documents: feed URL, HQ coord with citation, publisher language, publisher transparency caveats (e.g. "Synced Review: editorial team in Beijing, English-language publication — covers Chinese AI labs but from a translation-and-curation layer, not native Chinese-language primary sources").
9. **Rate-limit safe**: 5 feeds × 48 polls/day = 240 HTTP requests/day. Each feed is typically 20-50KB. Total egress <15MB/day. Redis commands: 5 feeds × 48 polls × ~25 cmds/poll = ~6k/day. Well within free tiers.
10. **LabsPanel-equivalent SourcesPanel**: new panel "Regional Wire" in LeftNav (9th button), lists the 5 sources sorted by 24h activity desc, with source citation footer.
11. **Unit tests**: ≥15 new tests covering RSS parser (Atom + RSS 2.0 both), feed-to-wire mapper, stale detection, dedupe-by-url, per-feed failure isolation, country-pill rendering.
12. **Playwright visual smoke** (new `tests/visual/07-regional-wire.spec.ts`, 3 assertions): (a) ≥1 amber map dot visible, (b) Regional Wire nav button opens panel, (c) WIRE panel contains at least one row with a country pill other than "US".

## Technical Approach

### Files created

- `src/lib/data/rss-sources.ts` — typed registry of the 5 sources with HQ coords + `rssUrl` + `hqSourceUrl`, plus `validateRssSources()` schema check (same pattern as `labs-registry.ts`).
- `src/lib/data/wire-rss.ts` — pure-logic + fetcher + `runRssIngest`. Mirrors `wire-hn.ts` shape. Includes RSS 2.0 + Atom parsers (no LLM, no translation).
- `src/lib/data/rss-store.ts` — Redis keyspace `rss:item:{sourceId}:{guid}`, `rss:source:{id}` (status), `rss:wire` ZSET scored by published timestamp, `rss:meta`.
- `src/app/api/wire/ingest-rss/route.ts` — secret-gated POST, called by cron. Same `INGEST_SECRET` pattern as HN.
- `src/app/api/rss/route.ts` — public GET, returns `RssWireResult` (items + source statuses + meta) via Next Data Cache (60s revalidate).
- `src/components/wire/SourceCard.tsx` — the per-source card rendered on dot click.
- `src/components/wire/RegionalWirePanel.tsx` — 9th LeftNav panel.
- `src/components/wire/country-pill.tsx` — shared `CountryPill` + `LangTag` components.
- `.github/workflows/rss-ingest.yml` — 30-min cron on `*/30 * * * *` minute 25/55 (avoid existing cron minute collisions).
- `tests/visual/07-regional-wire.spec.ts` — 3 smokes.
- `src/lib/data/__tests__/rss-sources.test.ts`, `src/lib/data/__tests__/wire-rss.test.ts` — unit specs.

### Files modified

- `src/lib/data-sources.ts` — 5 new `RSS_*` entries (verified) or 1 grouped `REGIONAL_RSS` entry + 5 subsources.
- `public/data-sources.md` — mirror prose, with transparency notes per publisher.
- `src/components/dashboard/WirePage.tsx` — merge HN + RSS items client-side, sort by `firstSeenTs` desc, cap at 50 rows visible.
- `src/components/dashboard/Dashboard.tsx` — 9th panel wired, 10-min client poll on `/api/rss`.
- `src/components/chrome/LeftNav.tsx` — "Regional Wire" row + globe SVG icon.
- `src/components/chrome/FilterPanel.tsx` — new `regional-rss` layer toggle, default ON.
- `src/components/globe/Globe.tsx`, `src/components/map/FlatMap.tsx` — amber dot rendering; `MapLegend`/`GlobeLegend` gains "Regional Wire · Publisher HQ · 24h items" row.
- `src/components/globe/event-detail.tsx` — SourceCard delegation for RSS-only clusters.
- `HANDOFF.md` — session 21 entry.

### Data flow

```
GH Actions cron (every 30m)
   ↓ POST /api/wire/ingest-rss (x-ingest-secret)
     ↓ for each source in RSS_SOURCES:
       ↓ fetch rssUrl, parse (RSS 2.0 or Atom)
       ↓ for each item: check rss:item:{id} → skip if exists
       ↓ else: SET rss:item:{id} (EX 7d), ZADD rss:wire score=pubTs
       ↓ SET rss:source:{id} { lastFetchOkTs, itemCount24h, lastError: null }
     ↓ catch per-source → SET rss:source:{id} { lastError, lastFetchOkTs preserved }
   ↓ prune rss:wire older than 7d
GET /api/rss (from browser)
   ↓ ZRANGE rss:wire 0 -1 REV WITHSCORES
   ↓ MGET item keys
   ↓ MGET source statuses
   ↓ return { items, sources, meta }
WirePage
   ↓ merge(hn.items, rss.items), sort by firstSeenTs desc
   ↓ render rows with kind-specific pill
```

## Architectural Constraint Test

Non-negotiables from project `CLAUDE.md`:

- **"Every displayed number has a verifiable public source."** — HQ coords cite a publisher About page; article titles and URLs come verbatim from the RSS feed. ✓
- **"AI Pulse aggregates, it does not score."** — No ranking, no trust score. Sort = published-time desc only. ✓
- **"No synthetic or simulated data on the globe."** — Amber dots are publisher HQs, a verifiable public fact per source. No article-level geo-inference. ✓
- **"Graceful degradation is mandatory."** — Per-source Redis status → grey card + last-known + timestamp when stale. ✓
- **"Deterministic AI config detection only."** — No LLM anywhere in the RSS pipeline. No translation. ✓
- **"No per-audit LLM calls by default."** — Ingest is pure parse + filter + store. ✓
- **"Sanity checks are pre-committed."** — Each source has a declared items-per-24h range in `rss-sources.ts`. Falling outside triggers a log line (not a hide). ✓

Separately: the "curation is sourcing not scoring" line we established in session 20 applies here too — we pick the 5 feeds deliberately, but once picked, we don't rank them. The publisher's own editorial decides what ships.

## Out of Scope

- **Translation of non-English content.** Heise German stays German; Synced is already English-language; no translation layer, ever, in this feature.
- **Per-article geolocation.** Dot is always at publisher HQ. A Heise article about a Munich startup → Hanover dot, not Munich.
- **Semantic dedupe.** URL-equality dedupe only. If MIT TR and HN link to the same Anthropic blog post, second-arriver loses; no title-similarity logic.
- **Adding more than 5 feeds.** Scope is exactly 5; session 22+ can add more.
- **AI-keyword filter on top of AI-topic feeds.** These feeds are publisher-scoped to AI; filtering further is redundant and creates false negatives.
- **Full-text article caching.** Store title + url + summary (if the feed provides one) + pubDate. Never fetch the article body.
- **Merging HN + RSS into a single ZSET server-side.** Client-side merge keeps HN pipeline untouched.

## Dependencies

- Existing HN ingest pipeline patterns (`wire-hn.ts`, `hn-store.ts`, `/api/wire/ingest-hn`, `.github/workflows/wire-ingest-hn.yml`).
- Existing labs patterns for coord-carrying source registry (`labs-registry.ts`, `validateLabsRegistry()`).
- `INGEST_SECRET` env var (already configured on Vercel + GH Actions).
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (already configured).
- No new deps expected; parse RSS with a small hand-rolled parser or `fast-xml-parser` if one is already in `package.json` (verify in RSS-01).

## Estimated Complexity

**M** (medium). The pattern is well-worn (wire-hn for ingest, labs for coord-carrying registry). The new-to-us pieces are (a) RSS/Atom parsing for 5 different feed flavours, and (b) client-side merge in WirePage. No architectural inventions. 5 issues × 1-2 hour sessions each → 1 working day of Builder time. Auditor review at 3 checkpoints (see §9).

## §9 — Auditor Checkpoints (PENDING)

1. **Before merging `rss-sources.ts`**: each of the 5 entries has a verifiable `hqSourceUrl`, the city matches what the publisher's About page says (not what Google/Wikipedia says — primary source), and the `rssUrl` returns a valid RSS/Atom doc.
2. **Before merging the amber colour choice**: visual check that amber dots don't mush into HN orange clusters on the map. If they do, pick a different hue.
3. **Before merging the Analytics India HQ coord**: user brief said Mumbai; Auditor double-checks against the publisher's own About page and corrects if the source says Bangalore (or elsewhere).
4. **Before merging the Synced Review entry**: transparency caveat — "English-language publication covering Chinese AI, not native-Chinese primary source" — must be in the source registry prose so users know what the dot represents.
5. **Before the phase gate (PR merge)**: (a) all 5 feeds returning valid items in staging, (b) at least one non-US country pill visible in a live WIRE row screenshot, (c) map shows ≥1 amber dot at world zoom.

## Decomposition Preview (for session 22 or continue-on-approval)

RSS-01 · `rss-sources.ts` + validator + unit tests (registry + schema).
RSS-02 · RSS/Atom parser + `wire-rss.ts` + `rss-store.ts` + ingest route (pure-logic + fetcher, fully TDD).
RSS-03 · `/api/rss` read route + `RegionalWirePanel` + `SourceCard`.
RSS-04 · Map/Globe amber dot layer + legend + filter toggle + country pill in WIRE rows.
RSS-05 · Cron workflow + 5 new source registry entries + visual smoke test.

## Notes

- Country pill text uses ISO-2 codes; `UK` rather than `GB` for the lay reader (British citizens say UK, not GB; EU users expect UK). Auditor: is this the right call, or should we be pedantic with `GB`?
- Language tag only rendered when `lang !== "en"`. English sources don't need a tag.
- RSS feed URLs must be verified working at PRD-approval time; they change. RSS-01 commit message should include a `curl --head` check per feed.
