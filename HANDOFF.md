# HANDOFF — AI Pulse

## Current state (2026-04-21)

- **Main:** `af3fb05` (session 28). Prod deploy green. Visual smoke 25/25 against `aipulse-pi.vercel.app` in 49.3s.
- **Sources:** 23 · **Crons:** 8 · **Active panels:** 7 · **LeftNav buttons:** 9 (Audit + Agents soon-disabled) · **Unit tests:** 224/224 · **Visual smoke:** 25/25
- **First-load:** Map-only, no panels open. Every panel opens on demand via LeftNav.
- **Panel cap (FIX-01):** ≥1440px → 2 visible panels side-by-side; <1440px → 1 visible panel (opening evicts the oldest visible from zorder head).
- **Top-bar tabs:** The Map / The Wire (Globe tab hidden; ViewTabId="globe" still exists in code for future revival).
- **Panels:** Win chrome v2 live — accent colours (wire/models=teal, tools=green, benchmarks=amber, research/labs=violet, regional-wire=orange), per-panel stat bars, persistent FilterPanel rail (icon-only <1440px), keyboard shortcuts (Esc, 1-9). Right-anchored panels (tools, models) reserve the FilterPanel rail width so they no longer render behind it. Tool-health maximise is 80% × centred with a pinned 2-col grid (FIX-02).
- **Layers live on globe/map:** live pulse (GH events), AI Labs (32 labs, violet), Regional RSS (5 publishers, amber), Hacker News (HN orange), registry.

## Queued features (pending grill → PRD)

1. **Expand Tool Health** — add Vercel, Supabase, Cloudflare, Upstash status pages (current grid: OpenAI, Anthropic, GitHub, npm).
2. **Security incidents panel** — GitHub Security Advisories API, OWASP feeds, CVE/NVD. Needs source-trust review per non-negotiables.
3. **Free-tier infrastructure tracking** — status + limits for AI-era dev stack providers. Needs PRD on what "status" means vs Tool Health (likely a separate panel, not a merge).

---

### Session 28 — FIX-01 single-panel mode + FIX-02 tool-health maximise · SHIPPED

**Status:** Two commits direct on `main` through `af3fb05`. Prod smoke
**25/25 green in 49.3s** against `https://aipulse-pi.vercel.app` after
the Vercel deploy (`dpl_8D1ynC3RusepXdRghRQ7wqccf5jx`, created
13:35:43 BST — ~15s after the `af3fb05` commit).

Session brief (user, verbatim): *"A. Skip straight to FIX-01 + FIX-02.
The session 27 fixes are already shipped. Build both, ship to main."*
(Session started with a paste of the session-27 prompt by mistake; I
flagged the mismatch, user confirmed the pivot.)

**Shipped this session (2 commits, direct on main):**

| # | Commit    | Scope                                                       |
| - | --------- | ----------------------------------------------------------- |
| 1 | `c9d2dbb` | `feat(dashboard): FIX-01 single-panel mode — viewport cap`  |
| 2 | `af3fb05` | `feat(chrome): FIX-02 tool-health maximise — 80% centred`   |

1. **FIX-01 — viewport cap on visible panels** (`c9d2dbb`) —
   `Dashboard.toggle()` now enforces a cap: 2 visible panels at
   ≥1440px (the observatory posture, side-by-side reads fine), 1
   visible panel below 1440 (laptop / narrow desktop — a second open
   panel crowds the map out). Opening a new panel evicts the oldest
   visible from `zorder` head-first until the cap is met. Minimised
   panels don't count toward the cap (they're not occluding the map).
   Closing a visible panel via a second nav click stays a plain
   toggle with no cascade. Pure logic lives in
   `src/lib/panels/panel-cap.ts` (`togglePanelWithCap` +
   `capForViewportWidth`) so the branching (cap-1 vs cap-2, eviction
   order, minimised-as-non-visible, toggle-closed path) is
   unit-testable without mounting Dashboard. **+11 unit tests** in
   `src/lib/panels/__tests__/panel-cap.test.ts`; suite 213 → 224.

2. **FIX-02 — tool-health maximise cleanup** (`af3fb05`) — three
   coordinated changes behind a single feel:

   - **Win.tsx** gains `maximizedLayout?: "default" | "centered"`.
     The `"default"` path (innerW − 32 width, hugs edges) stays for
     tabular-wide panels like Benchmarks where every horizontal pixel
     pays off. `"centered"` renders the panel at 80% width × centred,
     giving the "window, not page" feel from design-spec-v2
     principle 1. `y` and `h` unchanged.
   - **HealthCardGrid.tsx** takes a `maximized?: boolean` flag. When
     true it pins to a 2-col grid (`md:grid-cols-2`) per the spec —
     the auto-fit rule landed at 3 cols at 80% of 1440, making each
     card body (incident list + sparkline stack) read too narrow.
     Restored-panel behaviour unchanged (auto-fit 300-min to 1fr).
   - **ToolHealthCard.LiveBody** re-introduces the "metrics pending"
     badge when a tool has no dedicated metric rows yet. 10px mono,
     `tracking-wider`, 0.5 opacity — matches the source-citation
     style. Replaces session-23's full-hide which caused layout
     shift when data eventually landed. This is the session-26 spec
     amendment.

   Dashboard wires Tools to `maximizedLayout="centered"` and passes
   `maximized={maxId === "tools"}` into `HealthCardGrid`. Other
   panels unchanged — their maximise geometry + stat-bar derivation
   stay on the default path.

**Files changed (session 28):**

- New (2): `src/lib/panels/panel-cap.ts`,
  `src/lib/panels/__tests__/panel-cap.test.ts`.
- Modified (4): `src/components/dashboard/Dashboard.tsx`,
  `src/components/chrome/Win.tsx`,
  `src/components/health/HealthCardGrid.tsx`,
  `src/components/health/ToolHealthCard.tsx`.
- Deleted (0). Touched outside project directory (0).

**Test + build state:**

- Unit tests: **224/224 ✓** (+11 from `panel-cap.test.ts`;
  baseline was 213).
- `npx tsc --noEmit`: clean (only the pre-existing
  `wire-rss.test.ts` StoreSpy + nullable errors flagged in session
  21 as out-of-scope remain).
- `npm run build`: ✓ 6 static pages, 17 dynamic routes intact.
- Visual smoke against prod: **25/25 green in 49.3s** at `af3fb05`
  vs `https://aipulse-pi.vercel.app`. No smoke added for FIX-01 /
  FIX-02 this session — FIX-01 is a no-op against the current suite
  (viewport 1440, cap=2, each test opens ≤1 panel) and FIX-02 only
  triggers on maximise which no smoke exercises. Playwright
  coverage for these is NEXT-candidate material.

**AUDITOR-REVIEW: PENDING (this session):**

- *FIX-01 boundary choice* — cap flips from 1 to 2 at exactly
  ≥1440px, matching the FilterPanel icon-rail breakpoint. If either
  threshold moves in a future fix (e.g. a search affordance widens
  the rail, pushing the panel-cap boundary up), they should move
  together. Consider factoring the boundary into a shared chrome
  constant.
- *FIX-01 1366 / 1280 / 1024 behaviour* — confirm the single-panel
  mode reads as "clean swap" when the user fans through nav items
  (each click closes the current + opens the new one). A rapid
  series of clicks on 1024 should feel like a tab switcher, not a
  stutter.
- *FIX-02 80% centred at 1920 / 1440 / 1280* — confirm the tool-
  health maximise reads as "observatory window" rather than awkward
  letterbox. 80% of 1280 = 1024; 80% of 1920 = 1536. Cards still
  read comfortably at both.
- *FIX-02 2-col pin with active incidents* — when a tool has an
  `ActiveIncidentList` stacked on top of the sparkline, 2-col at
  80% of 1280 is ~500px per card column. Confirm the incident body
  doesn't crowd the sparkline on viewports at the narrow end.
- *FIX-02 metrics-pending badge* across the 4 currently-live tools
  — auditor should eyeball that the 10px 0.5-opacity badge reads
  like a disclosure, not a broken state. If badge + incidents + no
  sparkline stack up on the same card, confirm it doesn't feel
  cluttered.

**NEXT (for session 29 — user to pick):**

1. *Playwright smoke for FIX-01 and FIX-02.* FIX-01: open Wire →
   open Tools at 1024×768 viewport → Wire should be closed,
   Tools visible. FIX-02: open Tools → click maximise → measure
   panel width ≈ 80% viewport, grid shows 2 cols. Small adds that
   would lock the spec into the suite.
2. *Grill one of the queued features.* Tool Health expansion
   (Vercel/Supabase/Cloudflare/Upstash status pages) is still the
   smallest unlock. Security incidents and Free-tier infra
   tracking need tighter grilling on source-trust + scope.
3. *P1 polish from `docs/design-spec-v2.md`:* FIX-05 / FIX-06 /
   FIX-07 (font-size standardisation, panel density sweep, wire
   timestamp precision). Session 24 covered some of this; cross-
   check current CSS before duplicating work.
4. *Audit the pending items above* when next in the codebase —
   all five are small visual/UX calls.
5. *Extend `maximizedLayout="centered"` to other panels?* The
   Tools panel is the only one using it today. If a future
   audit finds Models / Research / Labs also read better at 80%
   centred, it's a one-line flip per panel. Don't pre-empt —
   wait for the next pass with fresh eyes.

**Session 29 entry point:** `main` is clean at `af3fb05`. First
command: `git status && npx vitest run` to confirm the 224-unit
baseline. Only re-run the visual smoke if touching anything that
affects Win chrome, FilterPanel, LeftNav, panel z-order, or
Dashboard's toggle path.

---

### Session 27 — Context diet + 4 UI fixes · SHIPPED

**Status:** 7 commits direct on `main` through `65eaa3a`. Prod smoke
**25/25 green in 47s** against `https://aipulse-pi.vercel.app` after
the Vercel deploy completed.

Session brief (user, verbatim): *"Read HANDOFF.md. Four UI fixes first,
then queue the new features: 1) No panels open on page load — map only,
clean start. 2) Panels must not render behind the filter strip. 3) Hide
Audit from nav (grey with "SOON" or remove). 4) Hide THE GLOBE tab from
top nav. Do the 4 UI fixes first. Commit each separately. Ship to main."*
Also, before the fixes: trim sessions 20-24 to one-line summaries so the
active HANDOFF targets 15-20KB.

**Shipped this session (7 commits, direct on main):**

| # | Commit    | Scope                                                              |
| - | --------- | ------------------------------------------------------------------ |
| 0 | `67ad45c` | `chore(handoff): split sessions 6-19 into docs/handoff-archive.md` |
| 1 | `6cfb7c6` | `chore(handoff): trim sessions 20-24 to one-line summaries`        |
| 2 | `29d14f8` | `fix(dashboard): start with no panels open — map-only first load`  |
| 3 | `807b42a` | `fix(dashboard): right-anchored panels reserve FilterPanel rail`   |
| 4 | `40d156a` | `fix(chrome): park Audit from nav + TopBar — soon-disabled`        |
| 5 | `fc7b781` | `fix(chrome): hide The Globe tab from the TopBar switcher`         |
| 6 | `65eaa3a` | `test(visual): realign panel + Globe-tab smokes to session-27`     |

1. **Archive split** (`67ad45c`) — moves sessions 6-19 into
   `docs/handoff-archive.md` (2,264 lines of cold storage, never
   auto-loaded). Active HANDOFF drops 193KB → 57KB. Archive has its
   own header + pointer in active HANDOFF; grep or Read a specific
   section when historical context is genuinely needed.

2. **Handoff trim** (`6cfb7c6`) — compresses sessions 20-24 to
   one-line summaries (commit hash + shipped scope). Sessions 25
   and 26 keep full detail. Active HANDOFF now 20KB; hits the
   advisor's 15-20KB target. Adds "Queued features (pending grill →
   PRD)" section up top so the three new feature asks (Tool Health
   expansion, Security incidents panel, Free-tier infra tracking)
   land in context before any session-27 work starts.

3. **Fix 1 — no panels open on first load** (`29d14f8`) — flips
   every panel default from `{ open: true }` to `{ open: false }`
   in `Dashboard.tsx`. First load now renders the observatory stage
   (globe/map + TopBar + StatusBar + LeftNav + FilterPanel) with
   zero panel chrome occluding the map. Every panel opens on demand
   via LeftNav.

4. **Fix 2 — right-anchored panels reserve FilterPanel rail**
   (`807b42a`) — Tools and Models used `W - 420` for their default
   x, which at 1440px viewport placed their right edge at 1396 —
   188px overlap with the full FilterPanel rail (spans 1208-1428,
   z-40). Panels (z-30..37) rendered behind the rail and were
   largely occluded the moment they were opened. New helper
   `rightAnchor(panelW, floor)` subtracts `filterReserve` (240 at
   ≥1440px full rail, 64 at the icon-only rail below 1440) so panel
   right edges land 8px inside the rail's left boundary. Floor
   values from the prior `Math.max` preserved so narrow viewports
   don't underflow.

5. **Fix 3 — park Audit from nav + TopBar** (`40d156a`) — LeftNav
   Audit button gains `soon: true` and renders greyed + "soon"
   badge, sharing Agents' parked-feature styling. TopBar drops its
   `/audit` text link. The deterministic `/audit` page itself stays
   reachable via direct URL for anyone who has it bookmarked; it
   just isn't first-class UI anymore. Chrome test updated to expect
   Audit in the soon-disabled block alongside Agents.

6. **Fix 4 — hide The Globe tab** (`fc7b781`) — removes the Globe
   `TabButton` from `TopBar.tsx`. `ViewTabId="globe"` stays in the
   type and the render branch in `Dashboard.tsx` still handles it,
   so re-enabling the tab later is a one-line revert. Retired the
   `@globe` smoke test alongside the tab (no user path to exercise).
   Three tabs competing for the centre slot felt indecisive; the 3D
   surface loses on zoom fidelity anyway.

7. **Smoke-test realignment** (`65eaa3a`) — follow-up after the
   first prod smoke came back 22/25. Three assertions had gone
   stale: (a) "Wire is open by default" and (b) "Tools is open by
   default" in `02-dashboard-panels` — both now open via
   `openPanelViaNav` first, same pattern as Models/Research/
   Benchmarks; (c) `04-chrome` asserted the Globe tab was visible
   — inverted to `toHaveCount(0)` so the test now guards against
   accidental re-add.

**Files changed (session 27):**

- Docs (2): `HANDOFF.md` (trim + this entry),
  `docs/handoff-archive.md` (new, 2,264 lines).
- Chrome (2): `src/components/chrome/TopBar.tsx` (Globe tab removed,
  /audit link removed, comment updated),
  `src/components/dashboard/Dashboard.tsx` (defaults closed,
  `rightAnchor` helper, audit `soon: true`, audit-redirect branch
  in `toggle()` removed).
- Visual smoke tests (3): `tests/visual/01-dashboard-views.spec.ts`
  (@globe test retired, import list trimmed),
  `tests/visual/02-dashboard-panels.spec.ts` (Wire + Tools tests
  now open-via-nav),
  `tests/visual/04-chrome.spec.ts` (Globe tab → `toHaveCount(0)`,
  Audit moved into soon-disabled loop).
- Deleted (0). Touched outside project directory (0).

**Test + build state:**

- Unit tests: **213/213 ✓** (unchanged baseline).
- `npx tsc --noEmit`: clean (only the pre-existing
  `wire-rss.test.ts` StoreSpy + nullable errors flagged in session
  21 as out-of-scope remain).
- `npm run build`: ✓ compiled in 2.0s, 6 static pages, 17 dynamic
  routes intact.
- Visual smoke against prod: **25/25 green in 47s** at `65eaa3a`
  vs `https://aipulse-pi.vercel.app`. Suite dropped 26 → 25 because
  the `@globe` smoke retired alongside the tab.

**AUDITOR-REVIEW: PENDING (this session):**

- *Fix 2 rightAnchor constants* — 240px reserve at ≥1440 / 64px
  below assumes the FilterPanel never grows past its current width.
  If a future fix widens the full rail (e.g. a search affordance),
  bump both constants in lockstep or factor them into shared
  FilterPanel exports.
- *Fix 3 /audit page discoverability* — direct URL still works, but
  without the TopBar link or LeftNav button there is no in-product
  entry. If Auditor wants to keep the page truly reachable for
  internal use, consider a footnote in `/data-sources.md` or a
  developer-only keyboard shortcut.
- *Fix 4 Globe parking* — the `activeTab === "globe"` branch in
  Dashboard is now unreachable via UI. If it stays parked for more
  than a session or two, delete the dead render branch + ViewTabId
  member to shrink the type surface.

**NEXT (for session 28 — user to pick):**

1. *Grill one of the queued features.* Tool Health expansion is the
   smallest — Vercel/Supabase/Cloudflare/Upstash status pages are
   all public APIs with the same shape as the existing 4 tools.
   Security incidents and Free-tier infra tracking need tighter
   grilling on source-trust and scope.
2. *Consider trimming session 25 to a one-liner* next session,
   leaving only 26 + 27 in full detail. Active HANDOFF would drop
   another ~8KB and stay inside the 15-20KB band as session detail
   keeps accumulating.
3. *Audit the three pending items above* when next in the codebase
   — all three are small.

**Session 28 entry point:** `main` is clean at `65eaa3a`. First
command: `git status && npx vitest run` to confirm the 213-unit
baseline, then pick a queued feature or follow the NEXT #1 above.

---

### Session 26 — Panel chrome v2 (accent + stat bars + filter rail + shortcuts) · SHIPPED

**Status:** PR #7 squash-merged to `main` at merge commit `fde8345`.
Prod deploy green (Vercel deployment id `D67erEgYapruSaUTnmLRcSpyx4n2`).
Visual smoke against prod: **26/26 green in 56.8s** at `fde8345` vs
`https://aipulse-pi.vercel.app`. Trust bar + prod-smoke gate cleared.

Session brief (user, verbatim): *"Update the design spec with additions
from external review, then implement in order: 1) reusable panel frame
chrome with semantic dot + stat bar slot (prerequisite for density
fixes); 2) master-detail stat bars on every panel; 3) persistent
right-side filter strip with <1440px icon-only collapse; 4) keyboard
shortcuts (Esc / 1-9 / skip /). Commit each separately. Run Playwright
after each commit."* Followed the research-first protocol and pushed
back on one item before building: the "new `PanelFrame` component"
would have duplicated the existing `Win.tsx`. User approved extending
`Win` instead.

**Shipped this session (5 commits, one PR):**

| # | Commit    | Scope                                                        |
| - | --------- | ------------------------------------------------------------ |
| 0 | `e1c1be2` | `docs(design): v2 addendum — panel chrome is one component`  |
| 1 | `4a3e35c` | `feat(chrome): Win accent + stat-bar slot`                   |
| 2 | `f3daeb0` | `feat(chrome): panel stat bars`                              |
| 3 | `3242b2e` | `feat(chrome): filter strip <1440px icon-only`               |
| 4 | `f0b5594` | `feat(chrome): keyboard shortcuts (Esc + 1-9)`               |

1. **Spec addendum** (`e1c1be2`) — folds external-review feedback
   into `docs/design-spec-v2.md` as contract. Adds Principle 1.5
   ("panel chrome is one component — never fork Win.tsx"), the
   accent palette (wire/models=teal, tools=green, benchmarks=amber,
   research/labs=violet, regional-wire=orange; identity not state),
   FIX-13 (master-detail stat bar on every panel with per-panel
   formulae), FIX-14 (FilterPanel as persistent chrome, <1440px
   icon-only), FIX-15 (Esc + 1-9; `/` deferred until search lands),
   FIX-02 amendment ("Metrics pending" returns as 10px 0.5-opacity
   badge — hiding caused layout shift), and a REJECTED section
   logging coordinate readout, ticker restyle, and proper mobile
   so they don't resurface in session 27.

2. **Win accent + slot** (`4a3e35c`) — extends the single
   floating-panel frame (`Win.tsx`) with two new contracts instead
   of forking a sibling `PanelFrame`. New `accent` prop
   (`teal | green | amber | violet | orange`) drives the titledot +
   topmost glow via per-accent CSS custom properties
   (`--ap-win-accent` / `--ap-win-accent-glow`). New `statBar`
   ReactNode slot renders between titlebar and body (10px mono,
   24px min-height, divider below). CSS additions in `globals.css`:
   `.ap-win--accent-{teal,green,amber,violet,orange}`, updated
   `.ap-win__titledot` + `.ap-win--topmost` to read from the new
   custom properties, new `.ap-win__statbar`. All 7 panel call
   sites in `Dashboard.tsx` now pass an explicit accent.

3. **Panel stat bars** (`f3daeb0`) — per-panel master-detail
   summary rows wired via the slot from the previous commit. New
   `StatBar.tsx` (pure presentational, empty → "—") and
   `src/lib/stats/panel-stats.ts` (pure helpers with
   alpha-tiebreak deterministic sort). +7 unit tests
   (`panel-stats.test.ts`), taking the suite from 206 → 213.

   Per-panel formulae:
   - Wire: `"N GH · N HN"` (events.coverage.windowSize + hn.items)
   - Tools: `"N OPERATIONAL · N DEGRADED · N OUTAGE"` reusing
     `deriveSev`; zero segments suppressed so a healthy fleet
     reads as one clean line. Tone colours (op/degrade/outage)
     scoped to Tools only — other panels stay neutral so the
     panel accent breathes.
   - Models: `"N MODELS · N ORGS"` (HF endpoint has no flagship
     flag; deviation from spec's proposed formula, documented).
   - Research: `"12 cs.AI · 8 cs.LG …"` (top 3 primary categories).
   - Benchmarks: `"Top Elo: N · 20 MODELS"` with trailing
     `"PUBLISHED YYYY-MM-DD"`.
   - Labs: `"9 CN · 10 US · 4 EU …"` (top 5 country codes).
   - Regional Wire: `"N SOURCES · N ARTICLES"`.

4. **Filter strip <1440px icon-only** (`3242b2e`) — FilterPanel
   becomes persistent chrome (never dismissible). At ≥1440px keeps
   the current 220px labelled layout; below 1440px collapses to a
   44px icon rail with 9 coloured layer dots + tooltip + Reset ↺.
   Two sibling `<aside>`s + one CSS media query
   (`max-width: 1439px`) — no branching logic. Icon rail respects
   the mobile gate (<768px hides both variants via the existing
   `.ap-desktop-only` mask).

5. **Keyboard shortcuts** (`f0b5594`) — window-level keydown in
   Dashboard. Esc closes the topmost open panel (walks `zorder`
   tail-first). Digits 1-9 toggle `navItems[i-1]` (skips `soon`
   items — "4" → agents is a deliberate dead key until Agents
   ships). Globe-card coordination: on Escape, if any
   `[role="dialog"]` is mounted (the event-detail card), the
   handler no-ops so Globe's own Esc listener dismisses the card
   without double-consuming the keypress. Input safety:
   INPUT/TEXTAREA/SELECT/contenteditable focus + any modifier
   key (meta/ctrl/alt) pass through untouched. `/` deferred until
   a global search target exists.

**Files changed (session 26, squashed into `fde8345`):**

- New (3): `src/components/chrome/StatBar.tsx`,
  `src/lib/stats/panel-stats.ts`,
  `src/lib/stats/__tests__/panel-stats.test.ts`.
- Modified (5): `docs/design-spec-v2.md`,
  `src/app/globals.css`, `src/components/chrome/Win.tsx`,
  `src/components/chrome/FilterPanel.tsx`,
  `src/components/dashboard/Dashboard.tsx`.
- Deleted: 0.
- Diff vs. prior `main` tip: +677 / -54 lines.

**Test + build state:**

- Unit tests: **213/213 ✓** (+7 from `panel-stats.test.ts`;
  baseline was 206).
- `npm run build`: ✓ TypeScript clean.
- Playwright visual smoke (prod): **26/26 green in 56.8s** against
  `https://aipulse-pi.vercel.app` @ `fde8345`. Trust bar + prod-smoke
  gate cleared.

**AUDITOR-REVIEW: PENDING (this session's additions):**

- *Topmost glow now varies by panel accent* (was hard-coded teal).
  Auditor should eyeball at 1920px that the violet / orange / amber
  halos read without overpowering map content.
- *Tools accent stays green when degraded* — per spec decision
  (accents = identity, stat bar = state). The accent dot shows
  "this is the Tools panel"; the stat bar reports "and right now
  N are degraded" in amber. Auditor should confirm this reads
  correctly alongside an amber global StatusBar — i.e., state is
  legible even while the panel accent is static.
- *Tools stat-bar tone colours* inside a green-accented frame —
  auditor should confirm green op / amber degrade / red outage
  segments don't read as accent-vs-state contradiction.
- *1440px breakpoint for the filter rail swap* — confirm at 1366px
  (common laptop), 1280px (chromebook), and 1024px the icon rail
  doesn't crowd the right-edge of any panel resized to its rightmost
  extent. Also spot-check that the bottom Reset glyph isn't clipped
  by MetricsRow / ticker on rare 1024×768 viewports.
- *Research/Labs stat-bar sparseness* — when arxiv yields fewer
  than 3 distinct primary categories, or labs registry has <5
  countries, the bar shows 1-2 segments. Auditor to confirm this
  reads fine in the sparse case.
- *Models stat-bar formula deviation* — ships `"N MODELS · N ORGS"`
  vs. the spec's proposed `"N providers · N models · N flagships"`
  because the HuggingFace endpoint doesn't carry a flagship flag.
  Folding flagship metadata is a separate data-layer change; this
  is documented in the session-26 commit message for `f3daeb0`.
- *Esc-yields-to-card relies on `[role="dialog"]` selector match*.
  FilterPanel uses `aria-label` on `<aside>` (not dialog) so the
  yield doesn't misfire today, but worth spot-checking if any new
  dialog element lands in a future session.
- *Dead key "4" → agents (soon)* — 1-9 map to `navItems[0..8]` in
  render order and the agents slot is intentionally left in place
  so it unlocks on Agents ship rather than breaking the mapping
  when it arrives.

**NEXT (for session 27):**

1. *Auditor sweep* of the 8 pending items above if there's appetite
   — all are visual / UX calls rather than correctness bugs.
2. *P0 fixes from `docs/design-spec-v2.md` still outstanding:*
   **FIX-01 single-panel mode on viewport <1440px** (close-all-then-
   open behaviour) and **FIX-02 tool-health maximise cleanup**
   (2-column grid, 80% width centred, + the "Metrics pending" badge
   amendment from session 26's spec update).
2. *P1 polish still open:* FIX-05 / FIX-06 / FIX-07 (font-size
   standardisation, panel density sweep, wire timestamp precision).
   Session 24 covered some of this; cross-check vs. current CSS
   before duplicating work.
3. *New optional — data-layer:* flagship flag on HF models so the
   Models stat bar can ship its spec-proposed formula. One field
   + one pure-helper change.
4. *Stat-bar Playwright coverage* — the 26-spec suite asserts
   panels open and content is present, but not that stat bars
   render their expected segment shape per panel. Worth adding
   once spec text stabilises.
5. *Park (carried from session 25):* OpenRouter stats API, Gitee
   trending, Papers With Code SOTA empirical probes; Kimi audit's
   editorial / moderation-risk items (out of scope for an
   aggregator).

**Session 27 entry point:** `main` is clean at `fde8345`. First
command: `git status && npx vitest run` to confirm the 213-unit
baseline. Only re-run the visual smoke if touching anything that
affects Win chrome, FilterPanel, LeftNav, or panel z-order.

---

## Earlier sessions — summary line only

- **Session 25** — `49abf78` (3 commits direct on `main`). Design spec v2 added (`docs/design-spec-v2.md`, 91 lines — 6 principles + FIX-01..12), global StatusBar (FIX-09, between TopBar and map, N OP · N DEGRADED · N OUTAGE), +4 Chinese labs (Moonshot, MiniMax, Zhipu, ByteDance Seed; 32→36 entries, 47→55 tracked repos). 206/206 unit, 26/26 prod smoke.
- **Session 24** — `8421253` (PR #6, merged). Polish round: four-tier type scale tokens, publisher event-time tooltips, mobile gate with MobileNotice overlay, lab-dot test hardening via `__apMap` hook. 26/26 prod smoke. 200/200 unit.
- **Session 23** — `383a481` (PR #5, merged). UI/UX trust blockers: panel z-order emphasis (`topmost` prop + `.ap-win--topmost/--behind`), AI Labs `url` field (32 labs, no Wikipedia click targets), Regional Wire inline article links + `publisherUrl`, Tool Health grid auto-fit. 200/200 unit.
- **Session 22** — `5f5af28` (PR #4, merged). Regional RSS ship + cron seed: 114 items across 5 publishers (The Register, Heise, Synced Review, MarkTechPost, MIT TR). 25/26 prod smoke (lab-dot flake resolved in session 24).
- **Session 21** — `feature/regional-rss` (6 commits). Regional RSS layer RSS-01..05: source registry, parser/ingest, `/api/rss`, globe+map amber dots, cron `25,55 * * * *`, `press-rss` category. 196/196 unit, 26 smokes total.
- **Session 20** — `67a697b` (PR #3, merged). AI Labs layer: 32 curated labs × 47 flagship repos, violet dots with p95-clamped log sizing, 6h `labs-cron-warm`, LabCard/LabsPanel. 118/118 unit, 23/23 prod smoke.

_Audit-pending items from sessions 20–24 carried forward: see `docs/handoff-archive.md` §session-20..24 for the full list. Non-blocking._

---

## Earlier sessions (6–19)

Archived at [`docs/handoff-archive.md`](docs/handoff-archive.md). Not auto-loaded. Grep or Read specific sections when historical context is genuinely needed.
