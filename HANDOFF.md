# HANDOFF — AI Pulse

## Current state (2026-04-19)

### Session 9.3 — flat-map click cards restored (one-commit hotfix)

User blocker: clicks on markers and clusters on THE MAP tab did
nothing visible. Diagnosed as z-index (card rendered under Leaflet's
800-cap pane stack) + Leaflet's default zoom-to-bounds hijacking
cluster clicks. Both fixed in `bfc5320`.

**Shipped:**

- `bfc5320 fix(map): EventCard z-index + cluster-click handler on flat map`
  - `src/components/globe/event-detail.tsx`: removed Tailwind `z-30`
    from the floating card; set inline `zIndex: 1200`. Sits above
    every Leaflet pane (tiles 200, overlays 400, markers 600,
    popups 700, controls 800) and is safe on the globe too — no
    competing positioned siblings there. Short WHY comment left
    in-place so the next editor doesn't regress it.
  - `src/components/map/FlatMap.tsx`:
    - `zoomToBoundsOnClick: false` on the MarkerClusterGroup —
      clusters no longer auto-zoom on click; user zooms via wheel
      or the `+`/`−` controls. Trade-off flagged `AUDITOR-REVIEW:
      PENDING` in the commit, but matches the globe UX (click
      reveals region events, not a forced camera move).
    - New `clusterclick` listener: pulls `getAllChildMarkers()`,
      extracts each marker's stashed `eventPoint`, feeds them to
      `clusterFromPoints()`, opens EventCard at the click anchor.
    - New `clusterFromPoints(points)` helper: computes dominant
      event type (frequency tally), centroid lat/lng, aiCount,
      and sorts events newest-first — output shape identical to
      what `clusterPoints()` emits on the globe so the shared
      EventCard works byte-for-byte on both views.
  - Singleton marker click handler (line 186) was already wired;
    it just never rendered visibly because of the same z-index
    issue. Unblocked automatically by the event-detail fix.

**Trust contract check:**

- Aggregator reads `p.meta` directly — no fabricated fields, no
  inferred values. Same event-type dominant-colour rule as
  `clusterIcon()` so the badge user clicks matches the card that
  opens.
- EventCard component itself unchanged apart from z-index; globe
  behaviour byte-identical.

**Verification (code-level):**

- `next build` clean: 1.95s compile, 1.38s TypeScript, 5/5 pages.
- No new deps, no API changes.

**Verification (visual, user to confirm on Vercel rebuild):**

- THE MAP tab: click a numbered cluster → card opens with its
  aggregated events. Click a singleton marker → card opens with
  one event. Escape + outside-click dismiss. Wheel + zoom controls
  still zoom. Mobile: pinch-zoom unaffected.
- THE GLOBE tab: click a dot → card opens as before (regression
  check since we touched event-detail.tsx).

**Next actions (session 10 opening move):**

1. User verifies flat-map click behaviour on
   https://aipulse-pi.vercel.app once Vercel rebuilds `bfc5320`.
2. **Registry foundation (Phase B) — higher priority than new tabs.**
   Upstash schema `aipulse:repo-registry`, discovery cron (6h,
   date-sliced GitHub Search), content verification (first 500
   bytes, config-shape markers). Target 2k high-quality repos.
   Deferred from 9.2; still the right next step before any new
   data-domain tab ships.
3. **Models tab (deferred, expansion scope).** User-approved source
   menu: HuggingFace `/api/models` (top 20 by 30-day downloads,
   text-generation + code), with Open LLM Leaderboard + Chatbot
   Arena as secondary sources. Floating panel like Tools, toggled
   from LeftNav. `SOON` → active with count badge. One panel at a
   time — Models first, then Agents (GitHub Search for AGENTS.md
   + langchain/crewai framework repos), then Research (ArXiv +
   Semantic Scholar + Papers With Code). Do NOT build all three
   at once.

Commits: `bfc5320`.

### Session 9.2 — flat-map tab (default) · 3D globe polish · shared event-card

Two commits, both green builds. The 3D globe's grainy-at-zoom texture
and oversized dots were the presenting complaints; the Leaflet flat
map makes those symptoms disappear by swapping to progressive-
resolution tiles. The globe polish lands alongside it as an interim
fix for users who open the secondary view.

**Shipped:**

- `728e015 fix(globe): cap dot radius at zoom, widen card margin to clear cluster badge`
  - `pointRadius` capped at 0.22° with a lower multiplier (0.09 vs
    0.18) — dots read as data points at every zoom instead of
    balloon-scaling with camera distance.
  - `CARD_MARGIN` 12px → 48px so the floating EventCard never sits
    on top of a numeric cluster badge (badges reach ~30px at high
    zoom).

- `428aee6 feat(map): 2D Leaflet flat map tab, now the default view`
  - `src/components/map/FlatMap.tsx` (NEW). CartoDB Dark Matter
    raster tiles (free, no API key). MarkerClusterGroup with a
    custom `iconCreateFunction` that picks the cluster colour from
    the dominant event type of its children and glows amber when
    any child has AI config. Leaflet is `await import`ed inside the
    mount effect and the whole component is pulled in via
    `next/dynamic({ ssr: false })` so SSR never touches `window`.
  - Shared event-card extracted: `src/components/globe/event-detail.tsx`
    exports `EVENT_TYPE_COLOR`, `colorForType`, `hexA`, `Cluster`,
    `EventMeta`, `EventCard`, `shortEventType`, `formatRelative`.
    Globe.tsx trimmed to import from it; FlatMap consumes the same
    card via a singleton-cluster wrapper so clicking a single
    marker feels identical to clicking a globe dot.
  - `TopBar.tsx`: `ViewTabId` = `map | wire | globe`. Tabs re-
    ordered "The Map · The Wire · The Globe"; map is the default.
  - `Dashboard.tsx`: three-branch stage render. FilterPanel +
    floating Wire/Tools panels render on both geospatial views
    (map + globe). Wire view is its own full-screen surface.
  - `globals.css`: Leaflet dark-theme overrides — transparent
    divIcon bg (else Leaflet paints white), dark attribution + zoom
    controls matching HUD chrome.
  - Deps: `leaflet` 1.9, `leaflet.markercluster` 1.5, types.

**Trust contract:**

- FlatMap reads the same `/api/globe-events` pipeline. Every marker
  is one real event — no map-specific synthesis, no fabricated
  coordinates. AI-config detection is still file-presence-only.
  CoverageBadge hovers over the map too, so the honest denominator
  (eventsReceived / placeable / window size) stays visible.

**Deferred to session 10 (registry foundation — Phase B):**

- Upstash schema `aipulse:repo-registry` for persistent AI-config
  repos. Discovery cron (every 6h, date-sliced GitHub Search API),
  content verification (fetch first 500 bytes, check for config-
  shaped markers — lines starting with #, instruction verbs, known
  headers). Target: 2,000 high-quality repos in week 1, not 10,000
  noisy ones.
- `/archives` page reading weekly snapshots: "Week of April 7:
  3,200 repos tracked, 420 new configs, 89 deleted, top growing
  tool: Claude Code (+180)".
- Signal decay: full-brightness ≤24h → progressively dimmer at 7d,
  30d, 90d. Hover card says "Last activity: 43 days ago" — no
  fabricated presence.
- Decision logged: agreed with user to fetch-and-verify rather
  than trust filename alone. Quality over speed.

**Next actions (session 10 opening move):**

1. Open https://aipulse-pi.vercel.app after Vercel rebuilds. Verify
   (a) THE MAP tab loads by default with CartoDB dark tiles and
   numbered clusters; (b) clicking a marker opens the shared
   EventCard; (c) filter panel toggles change visible markers
   live; (d) THE GLOBE tab still works and dots now stay small at
   zoom; (e) THE WIRE tab unchanged.
2. Draft a short PRD for the repo registry: data model (hash +
   per-repo snapshots), discovery cron cadence, Upstash budget
   (5k reads/day + 1k writes/day well under 10k free tier), and
   the content-verification heuristic.
3. Seed the registry with a first discovery batch (manual dispatch
   via `gh workflow run`) before the first cron cycle so the map
   has immediate registry data to fall back on when event window
   is quiet.

Commits: `728e015`, `428aee6`.

### Session 9.1 — visual bug fixes · colour coding + metrics visibility + density

User flagged three blocking issues post-deploy: globe is monochrome,
metric cards hidden behind ticker, density still sparse.

**Fixes shipped:**

- `f7e36ea fix(globe,metrics): event-type colour coding + surface metrics row`
  - Globe dots now encode event type via colour (matches FilterPanel
    legend). Push=teal, PR=blue, Issue=purple, Release=amber,
    Fork=green, Star=yellow. AI-config signal moves to a bright
    halo ring — thicker border + outer glow on count badges, and a
    standalone 14px ring on singleton AI-config dots.
  - `src/components/globe/Globe.tsx`: new `EVENT_TYPE_COLOR` map +
    `colorForType()` helper. `clusterPoints()` tallies event-type
    frequencies per bucket and picks the dominant for colour;
    `isAi` signal now reads `meta.hasAiConfig` directly instead of
    inferring from `p.color` (which no longer encodes AI status).
  - `clusterLabelElement()` rewritten to render two shapes: numeric
    badge (count>1) vs ring-only halo (count==1 && aiCount>0).
    `hexA()` helper for rgba conversion with opacity.
  - `GlobeLegend` updated to show six event-type swatches plus a
    note that "bright ring = repo has AI config".
  - MetricsRow was sitting behind the MetricTicker (ticker is ~84px
    tall; row was at bottom-56 with z-30 under ticker's z-40).
    Moved to bottom-96 z-50. Globe stage `paddingBottom` bumped
    from 56 to 168 so CoverageBadge doesn't collide with the cards.

- `0f64c06 fix(ingest): widen window + larger per-poll page count for density`
  - Root cause of sparseness: GH Actions cron is best-effort, skips
    slots on free tier (observed 30–40m gaps between runs, not 5m).
  - `WINDOW_MINUTES` 120 → 240 — events linger twice as long.
  - `EVENTS_API_PAGES` 5 → 8 — ~500–800 raw events per successful
    run instead of ~300–500. 96 req/hr auth budget used at the
    advertised cadence (trivial vs 5000/hr limit).
  - `data-sources.ts` sanity range widened to 100–800. Mirrored to
    `public/data-sources.md` — never let the registry drift.
  - Expected sustained density with 14% geocoder coverage: 500–1000
    placeable points (vs ~95 observed at session start).

**Verification — backfill 24633423728 completed at 16:12 UTC:**

```
source: redis
points: 775
coverage: {
  eventsReceived: 448762,     // archive + live-API combined
  eventsWithLocation: 321,
  locationCoveragePct: 16,    // up from 14 last run
  windowSize: 775,            // up from 95 at session start (+715%)
  windowAiConfig: 187,        // 24% of placeable have AI config
  windowMinutes: 240
}
```

Target was 300+. We hit 775 on a single backfill run. The widened
window + 8-page poll + gharchive backfill compound correctly. Globe
should now read dense across every populated continent rather than
a handful of teal dots.

Geocoder coverage still the ceiling at 16% — next lever if density
regresses (richer city/country lookup table, or fall back to repo
owner org location when user location is absent).

**Known, not-yet-fixed:**

- MetricsRow hint strings still fall back to "120m" when coverage
  is missing. Purely cosmetic (only shows on cold start) but would
  be worth patching to 240m on the next touch.
- GH Actions cron intermittency is structural to the free tier.
  Moving to Vercel Cron would be more reliable but requires a new
  function entry point; out of scope for this hotfix.

Commits: `f7e36ea`, `0f64c06`.

### Session 9 — full UI rebuild · two-tab HUD · filters · metric cards · seven commits

User brief: "Build. Seven commits. Ship." Kimi prototype at
`~/aipulse/wmsample/app/` as visual reference only — no fake data
copied across. Data pipeline untouched; presentation layer swapped.

**Shipped (all on `main`, all builds green):**

- `e9f5644 style(css): add icon-nav, panel-surface, grid-overlay, view-tabs tokens`
  - Design tokens in `src/app/globals.css`: `.ap-stage-grid`,
    `.ap-panel-surface`, `.ap-icon-nav` + `__item` + `__soon`,
    `.ap-tabs` + `__item`. Every downstream chrome component reads
    from these tokens — no inline colour literals in components.

- `721e981 feat(left-nav): left-edge icon rail with expand/collapse + soon badge`
  - `src/components/chrome/LeftNav.tsx` — 44px rail (176px expanded).
    Items: Wire, Tools, Models, Agents, Research, Audit. Models /
    Agents / Research render as disabled with a "soon" pill —
    roadmap signalled, no empty panels. Wire + Tools carry live
    counts sourced from `events.coverage.windowSize` and
    `Object.keys(status.data).length`.

- `bf7a347 feat(top-bar): centre tab switcher (THE GLOBE / THE WIRE) + full-width layout`
  - `src/components/chrome/TopBar.tsx` — fixed 48px, full-width (no
    max-w container so the left rail can pin to the viewport edge).
    Layout: brand · absolute-centre tab switcher · right-side
    {FreshnessPill, SeveritySummary, SourcesCount, /audit link, UTC
    clock}. Tab switcher emits `ViewTabId = "globe" | "wire"`. Flat
    2D MAP deferred per user direction (two tabs, not three).

- `679f6bf feat(dashboard): full-viewport HUD layout + tabs + left-edge nav`
  - `src/components/dashboard/Dashboard.tsx` — globe rendered
    `fixed inset-0` behind floating chrome (48px top, 56px bottom).
    `activeTab` state swaps globe stage for wire stage. Floating
    Wins (Wire feed, Tool health) only render on the globe view.
    `src/app/page.tsx` collapsed to `<Dashboard />` — SiteFooter and
    flex wrapper removed (full-viewport HUD covers them).

- `1c11aed feat(filter-panel): right-edge filters actually filter the globe`
  - `src/components/chrome/FilterPanel.tsx` (NEW). Categories:
    Event types (Push / PR / Issue / Release / Fork / Star) + Signal
    (AI-config only). `DEFAULT_FILTERS` + `eventTypeToFilterId()`
    exported for Dashboard. Filter is a view concern — applied to
    `rawPoints` before passing to the globe, but the CoverageBadge
    continues to read unfiltered `events.data.coverage` so the
    transparency contract can't be masked by filter UI.

- `215142a feat(metrics-row): 4 headline cards pinned above ticker`
  - `src/components/dashboard/MetricsRow.tsx` (NEW). Four cards:
    AI-cfg events · AI-cfg share · Events/window · Tools ops. Every
    number comes from `/api/globe-events` or `/api/status` —
    "loading…" shown on cold start rather than a zero that looks
    like real data. Tools ops fold matches TopBar semantics:
    operational + zero active incidents → counted OK. MetricsRow
    complements the existing MetricTicker (glance vs strip).

- `e9b47e0 feat(wire): full-viewport chronological feed replaces placeholder`
  - `src/components/dashboard/WirePage.tsx` (NEW). THE WIRE tab
    swaps the globe stage for a 960px-wide chronological feed.
    Grid: 70px timestamp / 90px ai-cfg pill / 90px type / repo
    link / auto actor + archive badge. Same extraction pattern as
    LiveFeed (`events.data.points[].meta`) — no new data source.
    Empty states explain why (loading / error / empty-window).

**Research (parallel, approved, not yet built):**

- GDELT as a globe data source. Conclusion: useful but risky — GKG
  coordinates mark *places mentioned in articles*, not verifiable
  event locations. User approved as a **separate layer with distinct
  visual treatment, after UI rebuild ships**. Not in this session.
  Will need its own `data-sources.ts` entry and a clear on-globe
  distinction between "action happened here" (GitHub) vs "article
  mentions here" (GDELT). `AUDITOR-REVIEW: PENDING`.

**Files changed:**

- Created: `FilterPanel.tsx`, `MetricsRow.tsx`, `WirePage.tsx`
- Rewritten: `LeftNav.tsx`, `TopBar.tsx`, `Dashboard.tsx`, `page.tsx`
- Modified: `globals.css`

**Trust contract check:**

- Every metric on MetricsRow cites a pipeline source (coverage or
  status). No invented trust scores, no fake sparklines.
- CoverageBadge reads unfiltered coverage — filter UI can't hide
  the real denominator.
- No data copied from Kimi mockup. Visual cues only.

**Next actions for session 10:**

- Open the deployed build in a browser and walk both tabs. Confirm
  the filter panel actually changes point count live, and the
  WirePage renders the same underlying events as LiveFeed.
- If density feels right, start the GDELT separate-layer work as a
  fresh feature branch. Lead with the honesty caveat in the UI.
- MetricsRow sparklines when Redis has enough poll-sample history
  to back a 24-hour trend. Currently too cold to be honest.
- `/audit` page visual restyle to match new design tokens (carried
  from session 6, still pending).
- `AUDITOR-REVIEW: PENDING` on: two-tab view switch, filter layer
  semantics, GDELT separate-layer decision.

Commits: `e9f5644`, `721e981`, `bf7a347`, `679f6bf`, `1c11aed`,
`215142a`, `e9b47e0`.

### Session 8 — globe density pipeline + click-to-reveal event card · deployed

User brief: "Ship density first, tooltip second. Go." Two separate
commits on `main`, both green builds before push.

**Shipped:**

- `450446d feat(globe): density pipeline — GH Archive + 5-page Events API + Redis buffer`
  - Split `fetch-events.ts` into a read path (`fetchGlobeEvents`) and a
    write path (`runIngest`). Read path is cheap Redis `LRANGE` +
    JSON.parse and falls back to the in-process legacy pipeline when
    Upstash is empty or unconfigured, so misconfigured infra never
    blanks the globe.
  - `src/lib/data/globe-store.ts` (NEW) — Upstash-backed store of
    processed globe points. `aipulse:globe-events` list (LPUSH newest
    first, LTRIM 20k, 4h TTL), `aipulse:globe-ingest-meta` JSON string.
    Batched LPUSH keeps each ingest run to ~3 Redis commands — well
    under the 10k/day free-tier budget (~864 runs/day × ~3 ≈ 2.6k).
  - `src/lib/data/gharchive.ts` (NEW) — hourly archive fetcher for
    `https://data.gharchive.org/{YYYY-MM-DD-H}.json.gz`. zlib gunzip +
    JSONL parse + inline filter to the nine RELEVANT_TYPES.
    `recentArchiveHours()` skips the current hour (archive publishes
    ~30 min after the hour ends). Used only when `?backfill=1` is
    passed to `/api/ingest` (cold start, manual debug).
  - `src/lib/github.ts` — added `fetchRecentEventsPaged(pages)`. 5 pages
    × 100 events per poll. 422 on deep pages (beyond the firehose
    depth GitHub serves publicly) is handled as empty, not an error.
  - `src/app/api/ingest/route.ts` (NEW) — POST/GET endpoint. Requires
    `x-ingest-secret` header matching `INGEST_SECRET`. `?backfill=1`
    triggers 6-hour archive backfill; `?pages=N` overrides the default
    5-page Events API poll. `runtime="nodejs"`, `maxDuration=60`.
  - `.github/workflows/globe-ingest.yml` (NEW) — `*/5 * * * *` cron +
    manual dispatch with backfill toggle. Concurrency-guarded
    (`cancel-in-progress: false`) so overlapping runs queue rather
    than race.
  - Trust contract preserved: every dot is a real GitHub event (live
    API or archive dump) with a real `created_at`. No synthesis. Same-id
    events across sources dedupe with live-API precedence. Source of
    each point tracked internally as `sourceKind: "events-api" | "gharchive"`.
  - `src/lib/data-sources.ts` + `public/data-sources.md` — added
    `GHARCHIVE` source entry; updated `GITHUB_EVENTS` caveat and sanity
    range (50–500 events per multi-page poll) and expanded measures to
    list all nine accepted event types.

- `a52ff9c feat(globe): click-to-reveal event card with top-5 + overflow`
  - Dropped `pointsMerge` from react-globe.gl (merged-mesh optimisation
    disables per-point click). Cluster count is already capped upstream
    so the perf delta is not noticeable.
  - `clusterPoints` now carries the underlying `events: GlobePoint[]`
    through each bucket; sorted newest-first so the card leads with the
    freshest activity.
  - Floating `<EventCard>` anchored near cursor, clamped to container
    bounds (flips left of cursor if it would overflow right). 28px
    titlebar (teal dot + "N events · X w/ AI cfg" + close button), then
    up to 5 event rows with `ap-sev-pill` event-type tag, AI-CFG vs
    NO-CFG pill, repo link to github.com/{owner}/{repo}, actor handle,
    relative timestamp. Archive-sourced events wear an explicit
    "archive" tag. Overflow reads "and N more in this region".
  - Dismiss on Escape, outside-click (mousedown capture so the card
    closes before the next point-click fires), close button, or when
    the dataset rotates (stale eventIds wouldn't match what's on the
    globe).

**Infra wired (2026-04-19):**

- Vercel env vars (production + development):
  - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (set by user
    via `vercel env add` ~1h before this session)
  - `INGEST_SECRET` generated via `openssl rand -hex 32`, stored in
    macOS Keychain as `aipulse-ingest-secret`, piped into Vercel via
    stdin (value never printed).
  - Preview target: partial — `UPSTASH_REDIS_REST_URL` and
    `INGEST_SECRET` not added because the Vercel CLI's "all preview
    branches" non-interactive path has a bug (returns git_branch_required
    despite `--yes --value` matching its own suggested command).
    Preview deploys are a nice-to-have, not required for the cron.
- GitHub repo secrets:
  - `INGEST_URL = https://aipulse-pi.vercel.app/api/ingest`
  - `INGEST_SECRET` mirrored from Keychain via stdin pipe.
- Production redeploys: `dpl_4WHW9AnjGgP1KDWP3Ai6kcbXfPga` (initial),
  then two iterations for bug fixes below.
- Cron (`*/5 * * * *`) is live; first manual dispatch with
  `backfill=true` succeeded on the third try (two bugs en route).

**Bugs surfaced during cutover + fixed:**

- `4a8e79e fix(ingest): archive backfill 500 — cache opt-out + post-dedupe cap`
  - Run 24613522421 returned HTTP 500. Root cause #1:
    `fetch(gharchive, { next: { revalidate: 86400 } })` tried to push a
    ~100MB response into Next.js Data Cache, which enforces a 2MB
    per-entry limit — throws as 500. Fix: `cache: 'no-store'`.
  - Root cause #2: unbounded post-dedupe set. 3 archive hours produced
    440k raw events → too many unique actors to geocode in 60s. Added
    `POST_DEDUPE_CAP = 2000` (newest-first) before the geocoding phase.
    `eventsReceived` in meta still reflects the pre-cap volume for
    observability.
  - `ARCHIVE_BACKFILL_HOURS` 6 → 3 (with the cap, more hours just
    widens a reservoir that doesn't reach the globe anyway).

- `84351d3 fix(ingest): bounded concurrency on fetchUser + probeAIConfig`
  - Run 24630484250 succeeded but produced 961 "fetch failed" errors
    and only 18 placeable events from 2000 survivors. Uncapped
    `Promise.all` was firing ~1500 parallel fetchUser sockets,
    overwhelming the serverless HTTP agent pool. Fix: `runBounded()`
    helper capping parallelism at `MAX_CONCURRENT_REQUESTS = 20` for
    both user profile lookups and AI-config probes.
  - Added `userLocationCache` mirroring `aiConfigCache` — null-value
    entries mean "looked up, no geocodable location", so warm
    instances skip the bulk of the fetch on subsequent runs.

**Live verification (after three deploys + three `backfill=true` runs):**

`GET /api/globe-events`:
```
source: redis
points: 278
coverage: { eventsReceived: 439879, eventsWithLocation: 242, locationCoveragePct: 12, windowSize: 278, windowAiConfig: 43, windowMinutes: 120 }
failures: 0
by source: { gharchive: 192, events-api: 86 }
ai-cfg dots: 43
```

Up from ~15 pre-session. Trust contract intact: every dot is a real
GitHub event (live API or archive), sourceKind distinguishable, AI-cfg
detection deterministic (file-presence only), no fabricated data.

**Next:**

- Let the `*/5` cron accumulate on its own for 30-60 min to gauge
  sustained density (each light poll adds ~80-120 placeable points
  from the live API; WINDOW_MINUTES=120 gives ~1500-2500 sustained).
- If the globe still reads sparse after the cron has cycled, widen
  `WINDOW_MINUTES` to 180 or bump `EVENTS_API_PAGES` to 8 (rate
  budget: 8 × 12 polls/hr = 96 req/hr, well under 5000/hr auth limit).
- Optional: finish the Preview env vars by hand in the Vercel web UI
  so PR-preview deploys also exercise the Redis path.
- Coverage metric naming in `IngestMeta` is now slightly misleading
  (eventsReceived is pre-cap, coverage% is post-cap). Worth clarifying
  in a future pass if it confuses operators.
- Click-card keyboard nav (↑↓ between rows, Enter to open repo) —
  deferred, no user request yet.

Commits: `450446d`, `a52ff9c`, `cf884fc`, `4a8e79e`, `84351d3`.

### Session 7 — tool expansion · 7d sparkline · denser globe · cluster labels · deployed

User brief: ship five items in order, one commit each, no asking. Delivered
four commits (tasks 1 and 3 from the brief collapsed into one — the OpenAI
incidents work and the Codex card wire up the same endpoint).

**Shipped:**

- `ac23f72 feat(tools): add Cursor (no-data), Windsurf, OpenAI Codex cards`
  - Tool count: 3 → 6. Claude Code, Copilot, OpenAI API still tracked;
    added Codex (worst-of `Codex Web` + `Codex API` components on the
    OpenAI status page), Windsurf (new `windsurf-status` source, full
    Statuspage v2 at status.windsurf.com — codeium.com 302s to it), Cursor
    (explicit no-data card: zero public repos on `getcursor` org, no
    public issue tracker, no status JSON — shown so the gap is visible,
    not hidden).
  - OpenAI incidents gap closed. `summary.json` still omits the incidents
    array, but sibling endpoint `/api/v2/incidents.json` exposes it. New
    `openai-incidents` source in `data-sources.ts`; `fetchIncidents()`
    pulls it and attaches active ones to OpenAI API + Codex cards. The
    `incidents · n/a` footnote disappears on those cards.
  - **Factual correction versus user brief:** user said the April 12
    "Elevated 401 errors" incident was live. Verified 2026-04-18: that
    incident resolved at 2026-04-12T20:40 UTC. Currently zero active
    incidents on the OpenAI status page. Mechanism wired; no active
    incidents fabricated to match the briefing.
  - `public/data-sources.md` mirrored. TopBar badge: "3 tools" → "5
    tracked · 1 gap".

- `49db56f feat(history): 7-day uptime sparkline + incident history per tool`
  - `src/lib/data/status-history.ts` — new module. Fetches historical
    incidents from each tool's `/api/v2/incidents.json` (50-deep, filtered
    to 7d and, where sensible, filtered by affected component:
    Anthropic→"Claude Code", GitHub→"Copilot", OpenAI full list, Codex
    subset matching /codex/i). Merges them with Redis poll samples (if
    available) into a 7-bucket daily DayBucket[].
  - Upstash Redis is optional. When `UPSTASH_REDIS_REST_URL` /
    `UPSTASH_REDIS_REST_TOKEN` are set, each `fetchAllStatus()` call
    pushes a sample per tool (LPUSH + LTRIM 2100 + 8d TTL). When absent,
    `recordSample`/`readSamples` are silent no-ops.
  - `<UptimeSparkline />` component: 7 daily bars with hover tooltip
    listing incidents that overlapped that day. Honest colour rule — days
    with no incident AND no sample render grey "unknown", not green. An
    explicit footnote calls out "incident-derived, poll samples
    unavailable" whenever Redis isn't configured.
  - Verified 7d incident counts (2026-04-18):
    - Anthropic: 7 (incl. Apr 13 critical "Claude.ai down", Apr 15
      critical "Elevated errors on Claude.ai, API, Claude Code")
    - GitHub: 5 (incl. Codespaces major, Pages major)
    - OpenAI: ~8 resolved, 0 active
    - Windsurf: 0

- `c4f4f84 feat(globe): densify with ForkEvent + WatchEvent`
  - `RELEVANT_TYPES` 4 → 6. `ForkEvent` and `WatchEvent` (GitHub's name
    for star events) join PushEvent/PR/Issue/Release. Lower coding-signal
    but high volume — AI-config probe still gates colour, so non-AI repos
    get white dots. Spec line 434's "filter for PushEvents" shorthand is
    an MVP-density decision, not a scope change.

- `e559e22 feat(globe): numeric count labels on multi-event clusters`
  - Uses react-globe.gl's `htmlElementsData` to overlay a small pill on
    any cluster with count > 1. Singletons stay clean. Pill is teal when
    the bucket has any AI-config events (matches dot rule), slate
    otherwise; size scales with log10(count); display caps at "99+";
    `htmlAltitude=0.02` so labels float just above dots and hide behind
    the globe on the back side.

### Session 6.1 — post-launch trust audit fixes (commit `103f3ce`)

**Audit prompted:** user ran a live cross-check after pass-2 deploy and found
three real trust gaps:
1. Tagline ("real-time observatory for the global AI ecosystem") overclaimed
   vs delivery (3 status pages + 1 globe = 10% of the implied scope).
2. Cold-start UX showed `—` everywhere on a fresh serverless instance and a
   static `LIVE` badge — looked broken / dishonest about freshness.
3. OpenAI had an active `monitoring` incident (Apr 12, "Elevated 401 errors")
   that the dashboard didn't surface because the code only read per-component
   status, not the incidents array.

**Done:**
- **Tagline narrowed.** "Live status & activity monitor · AI coding tools" in
  brand subtitle; `mvp · 3 tools` chip on the brand wordmark; layout metadata
  matches. Will earn the bigger tagline by shipping the bigger product, not
  the other way round.
- **Active incident surfacing.** New `ToolIncident` type. `fetch-status.ts`
  extracts incidents in `{investigating, identified, monitoring}` and attaches
  to each `ToolHealthData`. `ToolHealthCard` renders an amber-bordered list
  ("N active incidents" + first 3 names with status + age + link to status
  page). `TopBar` severity summary now folds tools-with-active-incidents into
  `degraded` rather than counting as `operational`. Same fold in the ticker's
  "Tools operational" cell. A green component with an open monitoring incident
  is no longer reported as fully operational.
- **OpenAI honesty boundary.** Discovered `status.openai.com` is a custom
  Next.js page (not Statuspage.io). Its `summary.json` exposes
  `{page, status, components}` only — no `incidents` array. Added
  `incidentsApiAvailable: false` flag on the OpenAI tool config, and a
  per-card "incidents · n/a · check the public status page" footnote so a
  green pill there explicitly does NOT claim "no incidents". Anthropic and
  GitHub both expose incidents via standard Statuspage v2 and surface
  correctly.
- **Cold-start UX no longer lies.**
  - Ticker: `—` split into `loading…` (poll in flight, italic muted),
    `no data` (poll succeeded but value genuinely absent), or the real value.
  - TopBar: new `FreshnessPill`. `connecting…` (pending pill) during initial
    poll; `live · 3s` (op pill) when fresh; `stale · 18m` (degrade pill) when
    older than 2× the poll interval; `offline` (outage pill) on poll error.
    Replaces the static `LIVE` lie that showed even on cold instances.
- `.gitignore`: added `/.claude` (local Claude Code session state).

**Honesty audit:** still no synthetic data. Active incidents come straight
from the upstream Statuspage payload. Cold-start states make actual freshness
explicit instead of papering over it. Trust contract intact.

**Live verification (commit `103f3ce` deployed):**
- Top bar shows `MVP · 3 TOOLS` badge + `LIVE · {age}` green pill.
- Ticker populates real values (`9,675 issues · 9 events · 2 ai-cfg · 22% · 3/3 ops · 11% coverage`).
- All three tool cards show OPERATIONAL (correctly — Anthropic/GitHub
  `incidents` arrays are empty right now per their JSON).
- OpenAI card carries the "incidents · n/a" footnote so a green pill there
  isn't read as "definitely no incidents".

### Session 6 — wmsample design system port · pass 1 + 2

**User request going in (`/session-start`):**
> Implement the AI Pulse design system from `~/aipulse/wmsample/` over the
> existing dashboard. Floating draggable panels, clustered globe dots,
> severity-coded badges, fractal background + cursor-tracking glow, softer
> typography, World Monitor layout. Do NOT rebuild — upgrade the existing
> components. Data layer (status API, globe events, /audit) is correct, only
> change the visual layer. Deploy after each major change.

**Done this session — Pass 1 (commit `6499ca7`):**
- **Fonts.** Inter/Geist → DM Sans (sans) + JetBrains Mono (mono) via
  `next/font/google`. Wired into `--font-dm-sans` / `--font-jetbrains-mono`,
  consumed by `--font-sans` / `--font-mono` tokens.
- **Stage background.** New `.ap-stage-bg` (cool `#06080a` base + warm radial
  vignettes + SVG fractalNoise data-uri at opacity 0.30 mix-blend-mode
  overlay). Fixed inset, z-index 0. Lives behind every page.
- **Cursor-tracking glow.** New `<CursorGlow />` client component sets
  `--ap-mx`/`--ap-my` on `<html>` from mousemove; CSS `.ap-cursor-glow` paints
  a 720×720 warm-orange radial gradient at the cursor with `mix-blend-mode:
  screen`. Sits at z-index 1, above stage, below content.
- **Floating window chrome.** New `<Win />` component — draggable + resizable +
  min/max/close, z-order tracking, restores prev pos on max → restore. CSS
  `.ap-win`, `.ap-win__titlebar`, `.ap-win__buttons`, `.ap-win__resize`.
- **Top bar.** New `<TopBar />` — brand (teal pulsing dot + wordmark + tagline),
  nav tabs (Live / Audit / Sources), severity summary derived from real
  `/api/status` data (falls back to `—` if status not loaded — never fakes
  zeros), source count, UTC clock via `useUtcClock()`.
- **Left nav.** New `<LeftNav />` overlay bottom-left with category list (wire,
  tools, audit) + count badges. CSS `.ap-leftnav`, `.ap-leftnav__item`,
  `.ap-leftnav__count`.
- **Dashboard refactor.** Removed the static 320/1fr/360 grid. Globe now
  full-bleed in an absolute-positioned section; LiveFeed and HealthCardGrid
  live inside floating Win panels (initial pos: wire 24/76, tools right-edge);
  LeftNav overlay bottom-left; MetricTicker at bottom.
- **Component re-fit.** LiveFeed lost its fixed-height aside wrapper (now
  `flex h-full min-h-0 flex-col p-3`). HealthCardGrid lost `sm:grid-cols-2`
  (single column inside narrow floating panel).
- **Build hygiene.** `tsconfig.json` excludes `wmsample/`; `.gitignore`
  ignores `wmsample/` (the Vite handoff bundle is reference, not part of the
  build).
- Live deploy: https://aipulse-pi.vercel.app at commit `6499ca7`.

**Done this session — Pass 2 (commit `57e909a`):**
- **Globe clustering.** New `clusterPoints()` in `Globe.tsx`. 4° lat/lng grid
  collapses overlapping events into weighted clusters; size scales with
  `log2(1 + count)` (cap 1.6×). Bucket colour is TEAL if any event in the
  bucket has AI config, else SLATE. Visual aggregation only — underlying point
  count, classification, and metadata unchanged.
- **Globe status overlay.** Now reads `Live · {clusters} cluster · {events} evt
  · {timestamp}` so density at a glance reflects both physical clusters on the
  globe and the raw window count.
- **Severity pills.** Single source of truth — `.ap-sev-pill--{op|degrade|
  regress|outage|info|pending}` already lived in globals.css. This pass wires
  every status surface to it:
  - `ToolHealthCard` — `<StatusDot />` → `<SeverityPill />`. `partial_outage`
    → `regress`, `major_outage` → `outage`, `degraded` → `degrade`,
    `operational` → `op`, awaiting → `degrade`, no source → `pending`.
  - `LiveFeed` rows — coloured dot → `ap-sev-pill--info` (ai-cfg) /
    `ap-sev-pill--pending` (no-cfg). Timestamps + event types use
    `ap-label-sm`.
- **Card padding pass.** ToolHealthCard now `py-3` outer + `px-3` inner — fits
  the narrow floating panel without horizontal scroll.
- Build: `next build` clean (1.7s compile, 1.3s typecheck, 5/5 pages).
- Live deploy: pushed to `main` at commit `57e909a`. Verify at
  https://aipulse-pi.vercel.app once Vercel finishes building.

**Honesty audit (both passes):**
- TopBar severity counts derived from real `/api/status`, never fabricated.
  Falls back to `—` if status not loaded.
- Globe clustering is visual aggregation only — no events invented, no
  classification altered, coverage % unchanged in the API.
- LeftNav `count` and `hot` badges are wired to real `events.coverage.windowSize`
  and real status data; nothing hardcoded.
- No fake ticker rows, no synthetic globe seeds, no LLM-inferred status.

## Auditor checkpoints

| # | Checkpoint | Status | Notes |
|---|------------|--------|-------|
| 1 | data-sources.ts + Globe stub + health cards committed | REACHED (session 1) | |
| 2 | Globe renders with real data + health cards show live status | REACHED (session 2) | |
| 2.1 | OpenAI fix · rolling window · 6-metric ticker · lean cards | REACHED (session 3) | |
| 2.2 | Geocoder expansion + `/audit` page | REACHED (session 4) | |
| 2.3 | 60m window · permanent config cache · calmer visuals | REACHED (session 5) | |
| 2.4 | wmsample design system port — fonts, fractal bg, floating panels, globe clustering, severity pills | REACHED (session 6) | Visual layer only; data pipeline untouched |
| 2.5 | Trust fixes — narrowed tagline · active incident surfacing · honest cold-start | REACHED (session 6.1) | Closes 3 audit findings; OpenAI incidents gap documented as data-source limit |
| 2.6 | Tool expansion · 7d sparkline · denser globe · cluster labels | **REACHED (session 7) — awaiting user review** | 4 commits, AUDITOR-REVIEW: PENDING on new sources + history bucketing |
| 3 | Pre-launch review | NOT STARTED | |

## Open items — for review or next session

0. ~~**OpenAI incidents data-source gap (from session 6.1 audit).**~~
   **CLOSED session 7.** `/api/v2/incidents.json` (sibling endpoint of
   `summary.json`) does expose incidents; it's now wired as
   `openai-incidents` in data-sources.ts and its active entries attach to
   OpenAI API + Codex cards.
0a. ~~**No incident history.**~~ **CLOSED session 7.** 7-day daily
    sparkline per tool, hover shows historical incidents. Redis-optional
    poll samples augment when available; incidents feed is always on.
0b. ~~**Only 3 tools tracked.**~~ **PARTIALLY CLOSED session 7.** Now 5
    tracked (Claude Code, Copilot, OpenAI API, Codex, Windsurf) + 1 gap
    (Cursor). Still missing: Codex CLI (separate component from Codex Web
    + API, already on OpenAI page), Aider (open-source; GH-issue source
    would work), Continue (open-source; same). Discrete add later.
0c. **Upstash Redis not configured.** Sparkline currently incident-only
    because `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` aren't
    set locally or (likely) on Vercel. Code is graceful — falls back and
    explicitly says "poll samples unavailable". Next step: provision
    Upstash free tier, add creds to Vercel env (Production + Preview +
    Development), add to `~/.secrets/populate-env.sh` for local parity.
    Once creds land, per-day uptime turns green for days with no incident
    instead of grey "unknown".
1. **Visual review of pass 2.** Confirm: (a) clusters read as denser without
   feeling fake, (b) severity pills are legible at the small font size on the
   tools panel, (c) no dot grouping lies (e.g. trans-Atlantic clusters merging
   USA + Europe — at 4° they shouldn't, but verify on a wide window).
2. **Cluster click-through / hover.** Current globe shows `pointsMerge` so the
   clusters lose individual hover targets. If we want click-to-see-events-in-
   region, drop `pointsMerge` and add `onPointClick` that opens a side panel
   listing the bucket's underlying events. Discrete PR.
3. **Window persistence.** Floating panel positions reset every page load. If
   the user values their layout, persist `panels` + `zorder` + `initialPos` to
   `localStorage`. Discrete PR.
4. **MetricTicker styling.** Pass 2 left it on the original tone classes
   (`text-emerald-400` etc.). Could swap to `.ap-sev-pill` for the value chip
   and tighten spacing. Cosmetic, not blocking.
5. **/audit page** still uses pre-redesign chrome — the new TopBar + stage bg
   are visible (since they're in `layout.tsx`), but `/audit` itself wasn't
   restyled this session. Worth a third pass before launch.
6. **Self-host globe texture** (carryover from session 5).
7. **Coverage still ~11–15%** (carryover from session 5). Geocoder ISO-code +
   alias expansion is still a discrete win.
8. **`~/.secrets/populate-env.sh` doesn't know about `aipulse`** (carryover).
9. **Preview env still missing `GH_TOKEN`** (carryover).

## Decisions made without Auditor sign-off — flag for review

- **4° lat/lng clustering bucket size.** Smaller (2°) keeps more clusters
  separate but loses density signal; bigger (8°) merges across countries which
  could read as misleading. 4° feels like the sweet spot but is a judgment
  call.
- **Cluster colour = `aiDominant ? TEAL : SLATE`** (pure-AI logic). A bucket
  with 1 AI + 99 non-AI shows teal — could over-claim AI saturation. Counter:
  any teal in a region IS a real AI-config signal in that region. Counter-
  counter: a "weighted average" colour (lerp by AI ratio) would be more honest.
  Flagged for review; one-line change to swap.
- **Severity pill colour mapping.** `partial_outage` → `regress` (yellow) and
  `major_outage` → `outage` (red) — chosen because the design system only
  defines six pill variants. Statuspage.io has two distinct outage tiers; we
  collapse the visual but keep the label. Acceptable.

## Environment notes
- Prod URL: **https://aipulse-pi.vercel.app**
- Deploy: push to `main` via connected GitHub integration.
- `GH_TOKEN` on Vercel: Production + Development.
- `UPSTASH_REDIS_REST_URL` / `_TOKEN`: **NOT configured.** Sparkline code is
  graceful; provision Upstash free tier and add to Vercel env to unlock
  poll-sample uptime.
- Latest commits on main:
  - `e559e22 feat(globe): numeric count labels on multi-event clusters`
  - `c4f4f84 feat(globe): densify with ForkEvent + WatchEvent`
  - `49db56f feat(history): 7-day uptime sparkline + incident history per tool`
  - `ac23f72 feat(tools): add Cursor (no-data), Windsurf, OpenAI Codex cards`
  - `e272096 docs: HANDOFF session 6.1 — three trust fixes + OpenAI gap documented`
  - `103f3ce fix(trust): narrow scope claim, surface active incidents, honest cold-start`

## Next action (on resume)
1. Open https://aipulse-pi.vercel.app and visually verify session 7:
   (a) six tool cards render — Claude Code, Copilot, OpenAI API, OpenAI
   Codex, Windsurf, Cursor — with Cursor showing the explicit no-data
   body, not a green pill; (b) sparklines render on the five tracked
   cards with 7 daily bars; hover shows historical incidents (Anthropic
   should have the most, including the Apr 13 critical and Apr 15
   critical); (c) sparkline footnote says "Incident-derived · poll-sample
   history unavailable" (confirms Redis is off); (d) globe looks denser
   with fork/watch events; (e) multi-event clusters have numeric badges.
2. Provision Upstash Redis (free tier, 10k cmd/day). Add creds to Vercel
   env (Production + Preview + Development) + `~/.secrets/` + populate
   script. Within one poll interval the sparkline's "unknown" days turn
   green. Consider adding a GitHub Action cron poll so samples collect
   even on idle days.
3. Restore `/audit` page styling to match the pass-2 design system
   (carryover from session 6 open item #5).
4. Filter Anthropic historical incidents to the `Claude Code` component
   already — but verify it holds up (some incidents list many components;
   shared-plane incidents are correctly on the Claude Code card, but
   Claude.ai-only ones should not be). If false positives appear, tighten
   the filter.
5. Phase 1 closeout: self-host globe texture; geocoder ISO-code expansion;
   pre-launch review (Checkpoint 3).

## Files changed this session (session 7)
Created (2):
- `src/lib/data/status-history.ts` — Redis-optional poll-sample store;
  historical incidents fetcher; 7-day daily bucketing.
- `src/components/health/UptimeSparkline.tsx` — 7-bar sparkline with
  per-day hover tooltip.

Modified (8):
- `src/lib/data-sources.ts` — added `OPENAI_INCIDENTS`, `WINDSURF_STATUS`;
  expanded `OPENAI_STATUS` measure + caveat; removed the Cursor "dropped"
  stub comment.
- `public/data-sources.md` — mirrored new sources; promoted Cursor from
  "dropped" to "tracked gap".
- `src/components/health/tools.ts` — `ToolId` union extended to
  `claude-code | copilot | openai-api | codex | windsurf | cursor`; added
  `noPublicSource` + `publicPageUrl` + `noSourceReason`; added `history`
  + `historyHasSamples` on `ToolHealthData`.
- `src/components/health/ToolHealthCard.tsx` — new `no-data` mode with
  `NoDataBody`; mounts `UptimeSparkline`.
- `src/components/chrome/TopBar.tsx` — MVP badge "3 tools" → "5 tracked ·
  1 gap".
- `src/lib/data/fetch-status.ts` — parallel fetch of four `/incidents.json`
  feeds + five Redis sample reads; per-tool history bucketing; Codex
  worst-of mapping; Windsurf card; fire-and-forget sample writes.
- `src/lib/data/fetch-events.ts` — `RELEVANT_TYPES` + ForkEvent +
  WatchEvent.
- `src/components/globe/Globe.tsx` — `labeledClusters` memo,
  `clusterLabelElement()` HTML factory, `htmlElementsData` wiring on
  react-globe.gl.

Commits: `ac23f72`, `49db56f`, `c4f4f84`, `e559e22`.

## Files changed in session 6
Created (4):
- `src/components/chrome/CursorGlow.tsx`
- `src/components/chrome/TopBar.tsx`
- `src/components/chrome/Win.tsx`
- `src/components/chrome/LeftNav.tsx`

Modified (8):
- `src/app/globals.css` — design system tokens, stage bg, cursor glow,
  severity pills, window chrome, left nav, typography utilities.
- `src/app/layout.tsx` — DM Sans + JetBrains Mono, stage bg + cursor glow
  wrappers.
- `src/app/page.tsx` — removed SiteHeader (TopBar lives in Dashboard now).
- `src/components/dashboard/Dashboard.tsx` — full refactor to floating-panel
  stage with TopBar, LeftNav, MetricTicker.
- `src/components/dashboard/LiveFeed.tsx` — root chrome dropped (now lives
  inside Win); rows use `ap-sev-pill`.
- `src/components/health/HealthCardGrid.tsx` — single column for narrow panel.
- `src/components/health/ToolHealthCard.tsx` — `SeverityPill`, tightened
  padding.
- `src/components/globe/Globe.tsx` — 4° clustering, log-scaled cluster size,
  cluster + event count in status overlay.
- `tsconfig.json` — exclude `wmsample/`.
- `.gitignore` — ignore `/wmsample`.

Commits: `6499ca7` (pass 1), `57e909a` (pass 2).
