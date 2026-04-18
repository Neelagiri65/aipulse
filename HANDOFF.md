# HANDOFF — AI Pulse

## Current state (2026-04-18)

### Session 6 — wmsample design system port + trust fixes · awaiting user review

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
| 2.5 | Trust fixes — narrowed tagline · active incident surfacing · honest cold-start | **REACHED — awaiting user review** | Closes 3 audit findings; OpenAI incidents gap documented as data-source limit |
| 3 | Pre-launch review | NOT STARTED | |

## Open items — for review or next session

0. **OpenAI incidents data-source gap (from session 6.1 audit).** OpenAI moved
   off Statuspage to a custom Next.js status page that doesn't expose
   `incidents` in its JSON. Two options to actually surface their incidents:
   (a) scrape the public HTML — fragile, breaks on every redesign; (b) find an
   undocumented JSON endpoint (their Next.js page must read from one — worth
   inspecting network requests on status.openai.com). Until then, the OpenAI
   card carries an explicit "incidents · n/a · check the public status page"
   footnote so the trust contract holds.
0a. **No incident history.** Audit also flagged this. Statuspage v2 has
    `/incidents.json` (paginated) for resolved incidents. Even a 7-day window
    would let the dashboard say "Claude had 2 degraded periods this week"
    instead of just "operational right now". Phase 2 work.
0b. **Only 3 tools tracked.** Audit flagged that "AI coding tools" still
    elides Cursor, Windsurf, Codex CLI, Aider, Continue. Cursor explicitly
    has no public status page (already noted in `tools.ts`). The others need
    individual source verification before being added — Phase 1 close-out
    task.
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
- Latest commits on main:
  - `103f3ce fix(trust): narrow scope claim, surface active incidents, honest cold-start`
  - `f02d61b docs: HANDOFF session 6 — wmsample design system passes 1 & 2`
  - `57e909a feat(design): wmsample design system pass 2 — globe clustering + severity pills`
  - `6499ca7 feat(design): wmsample design system pass 1 — fonts, fractal bg, floating panels`

## Next action (on resume)
1. Open https://aipulse-pi.vercel.app and visually verify pass 2: clustering
   density, severity pill legibility, top bar / left nav fit, no scroll bugs
   inside floating panels.
2. If layout reads well, address open item #5 (`/audit` restyle) and item #4
   (MetricTicker pill styling) for visual consistency. Then Checkpoint 3.
3. If cluster colour rule reads as misleading (open item flagged), switch
   `aiDominant` to a weighted-average lerp.
4. Phase 1 closeout: items #6 (self-host texture), #7 (geocoder ISO codes), then
   pre-launch review (Checkpoint 3).

## Files changed this session (session 6)
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
