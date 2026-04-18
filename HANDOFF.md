# HANDOFF — AI Pulse

## Current state (2026-04-18)

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
