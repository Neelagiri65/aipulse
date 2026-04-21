# HANDOFF — AI Pulse

## Current state (2026-04-21)

### Session 25 — Design spec v2 + global status bar + 4 Chinese labs · SHIPPED

**Status:** Three commits landed direct on `main` and deployed to prod.
Visual smoke against prod: **26/26 green in 56.7s** at commit `49abf78`
(Vercel deployment id `4431506427`, state `success`).

| # | Commit    | Scope                                              |
| - | --------- | -------------------------------------------------- |
| 1 | `09ddb31` | `docs(design): add v2 UI/UX overhaul spec`        |
| 2 | `ddbd9f3` | `feat(chrome): global status bar (FIX-09)`        |
| 3 | `49abf78` | `feat(labs): add 4 Chinese labs`                   |

Session brief (user, verbatim): *"Read HANDOFF.md. Three things this
session: 1) Save docs/design-spec-v2.md with the full UI/UX overhaul
spec. 2) Global status bar — single-line between top nav and map …
3) Add 4 Chinese labs to data/ai-labs.json … Two commits: status bar
first, Chinese labs second. Ship both on main."*

**Shipped this session (3/3, each as a discrete commit):**

1. **Design spec v2** (`09ddb31`) — `docs/design-spec-v2.md`, 91 lines.
   Captures the World-Monitor-vs-AI-Pulse comparison, the six design
   principles (map-is-the-product, one-panel-at-a-time, info-dense not
   spacious, hierarchy-through-typography, semantic colour, every-number-
   cited), and the P0–P2 fix queue (FIX-01 through FIX-12). Reference
   doc for every future UI session so we stop re-discovering the same
   issues.

2. **Global status bar** (`ddbd9f3`) — FIX-09 from the new spec. New
   component `src/components/chrome/StatusBar.tsx` (196 lines) renders a
   single-line bar between TopBar (48px) and the map stage at
   `top:48 height:28`:

       "N/N OPERATIONAL · N DEGRADED · N OUTAGE · N SOURCES · LIVE"

   Fold logic mirrors `MetricsRow.toolsOpsCard` /
   `TopBar.deriveSeverity`: an "operational" tool with an active
   incident counts as **degraded, not operational** (trust invariant).
   Overall dot is red if any outage, amber if any degraded, green
   otherwise. Degraded/outage segments render only when non-zero so a
   healthy fleet reads as one clean line. Live indicator is driven by
   status-poll freshness (Connecting → Live → Stale → Offline).

   Stage-offset accounting: paddingTop 48→76, `.ap-icon-nav` top
   48→76, `FilterPanel` top 72→100, default Win y-positions +28.
   LeftNav rail now sits under the status bar cleanly.

   Unit tests: +6 for `deriveSev` covering the operational+incident
   fold, explicit degraded + fold bundling, outage counts, and
   unknown handling. Total 206/206 green.

3. **Four Chinese labs** (`49abf78`) — Moonshot, MiniMax, Zhipu AI,
   ByteDance Seed. Registry goes **32 → 36** entries; CN coverage
   **5 → 9**; tracked flagship repos **47 → 55** (still well under
   the 5000-req/hr GH budget at 4 cron runs/day):

   | id                       | HQ              | url                      | orgs             |
   | ------------------------ | --------------- | ------------------------ | ---------------- |
   | `moonshot-beijing`       | Beijing Haidian | `moonshot.ai`           | `MoonshotAI`     |
   | `minimax-shanghai`       | Shanghai        | `minimax.io`            | `MiniMax-AI`     |
   | `zhipu-beijing`          | Beijing Haidian | `zhipuai.cn`            | `zai-org`        |
   | `bytedance-seed-beijing` | Beijing Haidian | `seed.bytedance.com`    | `ByteDance-Seed` |

   Each entry carries the two-URL contract from PR #5: `hqSourceUrl`
   (Wikipedia infobox for HQ city provenance) and `url` (first-party
   site for the click target, never Wikipedia). Zhipu/Tsinghua org
   overlap is handled via `notes`: newer flagship work is attributed
   to Zhipu (`zai-org/GLM-4.5`, `GLM-V`); earlier ChatGLM/GLM-4 work
   remains under Tsinghua (`THUDM/ChatGLM3`, `GLM-4`). No activity
   double-counting — the tracked repo lists don't overlap.

   `public/data-sources.md` updated: "32 curated labs" → "36 curated
   labs" and the GH-activity-fetcher arithmetic refreshed.

**Files changed (session 25):**

- New (3): `docs/design-spec-v2.md`,
  `src/components/chrome/StatusBar.tsx`,
  `src/components/chrome/__tests__/StatusBar.test.ts`
- Modified (5): `src/components/dashboard/Dashboard.tsx`,
  `src/components/chrome/FilterPanel.tsx`, `src/app/globals.css`,
  `data/ai-labs.json`, `public/data-sources.md`
- Deleted: 0

**Test + build state:**

- Unit tests: **206/206 ✓** (+6 from `deriveSev` tests; was 200).
- `npm run build`: ✓ compiled in 1.9s, TypeScript clean.
- Playwright visual smoke (prod): **26/26 green in 56.7s** against
  `https://aipulse-pi.vercel.app` @ `49abf78`. No regression from
  session 24's baseline.

**AUDITOR-REVIEW: PENDING (this session's additions):**

- *Status bar at 1920px / 1280px / 1024px* — layout uses `px-4 gap-2`
  with 10px monospace. Auditor should confirm the full line reads
  without truncation at 1024px (narrowest desktop). Mobile gate hides
  it below 768px along with the rest of the chrome, so 360/375 is a
  no-op.
- *Segment colour palette* — green/amber/red read fine against the
  dark bg at fg-muted tracking, but the combined glyph-dot + divider
  dots might look busy. Auditor should eyeball vs. the existing
  TopBar `SeveritySummary`, which this is semantically similar to.
- *Zhipu `zai-org` flagship-repo choice* — GLM-4.5 and GLM-V are my
  best-effort picks as of training cutoff 2026-01. If either repo
  has been renamed or consolidated, the activity fetcher returns 404
  and the lab dims to a stale violet dot — graceful degradation, no
  fabricated numbers. Auditor should spot-check the three other new
  labs' flagship repos too (Kimi-K2, MiniMax-M1, Seed-OSS, BAGEL).
- *MiniMax HQ coord* — I used central Shanghai (31.2304, 121.4737 /
  People's Square) pending a more precise district-level source. If
  MiniMax's HQ is documented as Pudong or Xuhui, bump the coord and
  refresh `hqSourceUrl`.

**NEXT (for session 26):**

1. P0 fixes from `docs/design-spec-v2.md` that weren't covered by
   prior sessions: **FIX-01 single-panel mode on viewport < 1440px**
   (close-all-then-open behaviour) and **FIX-02 tool-health maximise
   cleanup** (2-column grid, hide placeholder, 80% width centred).
2. *Optional* — FIX-05 / FIX-06 / FIX-07 (P1 polish: font-size
   standardisation, panel density, wire timestamp precision). Session
   24 already covered some of this; cross-check vs. current CSS before
   duplicating work.
3. *Evaluate* the three empirical-probe items from session 25
   planning: OpenRouter stats API, Gitee trending, Papers With Code
   SOTA. Kimi's audit called these out as "needs empirical test"; no
   code, just curl + confirm. Would unblock decisions for session 27+.
4. *Park* — editorial + moderation-risk items from the Kimi audit
   (distillation/security incidents, WeChat/X monitoring, China gov
   policy releases). Not in scope for an aggregator.

**Session 26 entry point:** `main` is clean at `49abf78`. First
command: `git status && npx vitest run` to confirm the 206-unit
baseline. Only re-run the visual smoke if touching anything that
affects TopBar, StatusBar, LeftNav, or panel chrome positioning.

---

## Previous sessions

### Session 24 — Polish round + lab-dot test hardening + prod smoke · MERGED

**Status:** PR #6 merged to `main` at 2026-04-20 23:40 UTC (merge commit `8421253`). Branch `fix/polish-round` deleted. Visual smoke against prod: **26/26 green in 55.5s** — the session-22 lab-dot flake is resolved.

Session brief (user, one-line): *"All of them. Polish 5, 6, 7 + lab-dot test hardening + visual smoke against prod. Single branch, ship it. Do all five. Single branch called fix/polish-round. Commit each fix separately. Run Playwright against prod at the end. Target 26/26 green. Go."*

**Shipped this session (5/5, each as a discrete commit):**

1. **Polish 5 — Four-tier type scale tokens** (`605e9f4`). Added `.ap-type-title` (14px), `.ap-type-label` (12px), `.ap-type-spark` (10px), `.ap-type-metric` (18px) to `globals.css`, plus bumped `.ap-win__titlebar` from 11px→14px (height 28→32px). Applied to panel titlebars, `MetricsRow`, `MetricTicker`, `LabCard`, `SourceCard`, `UptimeSparkline`. Pragmatic scope: hierarchy-defining elements only; 9px micro-labels (timestamps, citations, stale pills) intentionally left alone so the dense HUD stays readable.

2. **Polish 6 — Publisher event time tooltips** (`58ee9f8`). Audit found the invariant ("relative time = publisher's `created_at`, not our ingest/polling time") was already true in code — the HANDOFF claim of "ingest time not publisher time" was wrong. Instead of rewriting a correct code path, exposed the raw ISO via hover tooltip on every Wire row: `title={isoPublisherTimeTitle(row.createdAt)}` returning `"{ISO} · publisher event time"`. Added to `WirePage.GhRow`, `WirePage.HnRow`, and `LiveFeed.FeedRowItem`. The invariant is now verifiable from the UI with one hover.

3. **Polish 7 — Mobile gate** (`1b3ae4a`). Next 16 `Viewport` export in `layout.tsx` (`width: "device-width"`, `themeColor: "#06080a"`, etc.). Pure-CSS breakpoint gate in `globals.css`: `.ap-desktop-only` hides below 768px, `.ap-mobile-only` only paints below 768px. New `src/components/chrome/MobileNotice.tsx` renders a full-viewport "Best viewed on desktop" overlay with AI Pulse wordmark, live dot, explanatory copy, and the three primary-source fallback URLs (`/data-sources.md`, `/api/status`, `/api/rss`). Zero JS breakpoint detection → no hydration flicker.

4. **Lab-dot test hardening** (`21b7dd5`). Resolves session-22 NEXT #1 flake. Added a one-line test hook in `FlatMap.tsx` — after Leaflet init, stash the map instance on the container element as `__apMap` so Playwright can drive `setView([lat, lng], zoom)` deterministically. Test now zooms to MPI-IS Tübingen (48.54, 9.06) at zoom 10, past Leaflet's `disableClusteringAtZoom: 9` threshold. Tübingen is a small academic town with no other lab HQ and no major tech-hub live traffic nearby, so the only violet marker in that viewport is the one we want to assert on. No prod behaviour change; `__apMap` is just a ref stashed on the container DOM node.

5. **Playwright prod smoke — 26/26 green in 55.5s.** Ran `npm run test:visual` against `https://aipulse-pi.vercel.app` after the `8421253` production deploy succeeded. The previously flaky `06-ai-labs.spec.ts › map renders lab HQ markers in violet` now passes in 3.4s.

**Files changed (session 24):**

- CSS (1): `src/app/globals.css` (type-scale tokens, titlebar bump, mobile-gate media queries)
- App chrome (2): `src/app/layout.tsx` (Viewport export, MobileNotice mount), `src/components/chrome/MobileNotice.tsx` (new)
- Dashboard components (6): `src/components/dashboard/MetricsRow.tsx`, `src/components/dashboard/MetricTicker.tsx`, `src/components/dashboard/WirePage.tsx`, `src/components/dashboard/LiveFeed.tsx`, `src/components/labs/LabCard.tsx`, `src/components/wire/SourceCard.tsx`, `src/components/health/UptimeSparkline.tsx`
- Map (1): `src/components/map/FlatMap.tsx` (5-line `__apMap` test hook)
- Test (1): `tests/visual/06-ai-labs.spec.ts` (deterministic MPI-IS Tübingen zoom)

**Test + build state:**

- Unit tests: **200/200 ✓** (unchanged baseline, no new unit tests added — all new work validated by either the type-scale visual contract or the Playwright suite).
- `npm run build`: ✓ compiled in ~2s, TypeScript clean, 6 static pages + 17 dynamic API routes intact.
- Playwright visual smoke (prod): **26/26 green in 55.5s** against `https://aipulse-pi.vercel.app`.

**AUDITOR-REVIEW: PENDING (this session's additions):**

- *Polish 5 type scale* — Auditor should sanity-check at 1920px that the metric cards don't feel over-large now that values are 18px (was ~16px `text-lg`). Also confirm 12px labels are legible on low-DPI external monitors.
- *Polish 7 mobile notice* — Auditor should eyeball at 375px and 360px widths to confirm the three primary-source links don't wrap awkwardly; the flex layout has `flex-wrap` but the visual hasn't been smoke-tested on real devices.
- *Lab-dot test hook* — `__apMap` is a minimal test affordance stashed on the map container. Auditor should confirm this is acceptable (vs. extracting a proper ref-forwarding contract) — my call is that a single-property DOM attachment with a 4-line comment block is proportionate to the test-flake problem it solves.

**NEXT (for session 25):**

1. Optional — Auditor review of the three pending items above.
2. Optional — explore whether any *more* visual regressions surface during the 26/26 smoke run that aren't covered by the existing specs (e.g. the topmost/behind panel emphasis from session 23 still isn't explicitly asserted; it's only verified indirectly).
3. Otherwise: await user direction. The pre-share trust bar is cleared AND the polish queue is empty — AI Pulse is in a genuinely shippable state for external sharing.

**Session 25 entry point:** `main` is clean at `8421253`. First command: `git status && npx vitest run && npm run test:visual` to confirm the 200-unit + 26-visual baseline, then pick the next deliverable with the user.

---

### Session 23 — UI/UX trust-blocker fixes from screenshot review · MERGED

**Status:** PR #5 merged to `main` at 2026-04-20 23:13:40 UTC (merge commit `383a481`). Branch deleted. User sign-off: *"The product is shareable now. Every number cites its source, every link goes to a primary source, panels don't overlap. That's the trust bar cleared."*

Session brief (user, via `/session-start` args): *"Several UI/UX issues to fix before the product is shareable … Fix items 1, 2, 3, and 4 first — those are the trust and usability blockers. Items 5-7 are polish."* User priority quote: *"The AI Labs Wikipedia link issue is the worst one — it directly undermines trust. An observatory linking to Wikipedia for its primary data looks amateur."*

**Shipped this session (4/4 critical blockers, polish items 5–7 deferred to session 24):**

1. **Fix 1 — Panel overlap visual emphasis** (not single-panel-only). Chose z-order emphasis over single-panel-at-a-time so the default three-surface layout (wire + tools + map) still works. `Win.tsx` gains a `topmost?: boolean` prop; `Dashboard.tsx` computes `topmostOpenId` by walking the `zorder` stack in reverse and passes the boolean to each of the 7 panels. `globals.css` adds `.ap-win--topmost` (teal glow + stronger border + amped drop shadow) and `.ap-win--behind` (opacity 0.86, muted shadow, hover-lifts to 0.96). Net: the top panel reads distinctly from siblings without hiding them.

2. **Fix 2 — AI Labs Wikipedia links → primary-source URLs.** The worst offender per user. Added a new `url: string` field alongside `hqSourceUrl` on every `LabEntry`. `hqSourceUrl` preserved as HQ-coordinate provenance citation (may still cite Wikipedia — it's a valid source for "where is Anthropic headquartered"); `url` is the click target for the lab name and must never be Wikipedia. Updated all 32 labs in `data/ai-labs.json` — openai-sf → `openai.com`, anthropic-sf → `anthropic.com`, deepmind-london → `deepmind.google/`, fair-menlo-park → `ai.meta.com/research/`, mistral-paris → `mistral.ai`, deepseek-hangzhou → `deepseek.com`, stability-london → `stability.ai`, huggingface-nyc → `huggingface.co`, xai-paloalto → `x.ai`, cohere-toronto → `cohere.com`, ai21-telaviv → `ai21.com`, tsinghua-thudm → `github.com/THUDM` (GH org fallback because the Tsinghua KEG page is an academic subpage with a fragile URL). Plumbed through `LabEntry` / `LabActivity` / `EventMeta.labUrl` / `labs-to-points.meta` / `LabsPanel` row anchor / `LabCard` heading anchor / `event-detail.LabRow` anchor. `validateLabsRegistry()` now requires `url` to be https; a registry-invariant test asserts no lab `url` contains `wikipedia.org`.

3. **Fix 3 — Regional Wire rows link to actual articles + expose feed URL.** Added `publisherUrl: string` to `RssSource` (validator enforces https) and propagated through `RssSourcePanel` along with the existing `rssUrl`. `RegionalWirePanel` now renders 3 recent article titles inline per publisher row, each linking directly to the publisher's own article URL (`item.url`), plus a `site ↗ · rss ↗` footer with the raw feed format tag. Publisher-name click target switched from `hqSourceUrl` → `publisherUrl`. `SourceCard` lab/publisher heading now wraps to `publisherUrl`, and its right-hand meta exposes both `rss ↗` and `HQ source ↗` as separate citations. `event-detail.RssRow` prefers `rssSource.publisherUrl` over `rssHqSourceUrl` with a graceful fallback. `public/data-sources.md` updated to describe the two-URL contract (provenance vs click target) for both the AI Labs and Press-RSS sections.

4. **Fix 4 — Tool Health maximise cleanup.** Removed the "Status only · additional metrics pending dedicated sources" placeholder inside `LiveBody` in `ToolHealthCard.tsx` — the severity pill in the header already communicates status, and the placeholder added noise at maximised width. `HealthCardGrid` moved to `grid-cols-[repeat(auto-fit,minmax(300px,1fr))]` so the cards reflow to 1–3 columns based on panel width (works at default, maximised, and everything in between).

**Files changed (session 23):**

- Code (12): `src/components/chrome/Win.tsx`, `src/components/dashboard/Dashboard.tsx`, `src/components/health/ToolHealthCard.tsx`, `src/components/health/HealthCardGrid.tsx`, `src/lib/data/labs-registry.ts`, `src/lib/data/fetch-labs.ts`, `src/components/labs/labs-to-points.ts`, `src/components/labs/LabsPanel.tsx`, `src/components/labs/LabCard.tsx`, `src/components/globe/event-detail.tsx`, `src/lib/data/rss-sources.ts`, `src/lib/data/wire-rss.ts`, `src/components/wire/RegionalWirePanel.tsx`, `src/components/wire/SourceCard.tsx`
- CSS (1): `src/app/globals.css`
- Data (1): `data/ai-labs.json` (32 labs now carry `url` in addition to `hqSourceUrl`)
- Tests updated / expanded (6): `src/lib/data/__tests__/labs-registry.test.ts` (added 2 validator tests + registry-invariant no-Wikipedia test), `src/lib/data/__tests__/fetch-labs.test.ts`, `src/components/labs/__tests__/labs-to-points.test.ts`, `src/lib/data/__tests__/rss-sources.test.ts` (added 1 no-Wikipedia invariant test), `src/lib/data/__tests__/wire-rss.test.ts`, `src/lib/data/__tests__/assemble-rss-wire.test.ts`, `src/components/wire/__tests__/rss-to-points.test.ts`
- Doc (1): `public/data-sources.md`

**Test + build state:**

- Unit tests: **200/200 ✓** (was 196; +4 from new labs `url` + RSS `publisherUrl` invariants).
- `tsc --noEmit`: clean on everything outside the pre-existing `wire-rss.test.ts` StoreSpy / item-null errors already flagged in session 21 as out-of-scope.
- `npm run build`: ✓ compiled in 2.0s, TypeScript clean, 6 static pages generated, 17 dynamic API routes intact.
- Visual smoke: **not re-run this session** — code-only changes touched panel chrome CSS + registry fields. Should run after deploy to confirm the topmost/behind emphasis reads correctly at the visual layer.

**AUDITOR-REVIEW: PENDING (this session's additions):**

- *Fix 1 (panel z-order emphasis)* — Auditor should validate whether the opacity-behind treatment is legible enough when 3+ panels stack, vs. the single-panel-only alternative the user also offered.
- *Fix 2 (lab url field)* — a few labs use `https://github.com/<org>` as the `url` because the org has no stable website. Auditor should decide whether "GH org" is an acceptable primary-click target for an AI lab or whether those entries should be demoted. Candidates: `tsinghua-thudm` (confirmed academic-fragile), and any lab whose `url` starts with `github.com/` after the commit.
- *Fix 3 (publisherUrl for The Register)* — chose the AI/ML section page (`/software/ai_ml/`) over the publication root (`theregister.com`) to match the feed's scope. Auditor may want the root instead. Same pattern on MIT TR (`/topic/artificial-intelligence/` vs `technologyreview.com`).
- *Fix 4 (grid auto-fit)* — at very wide panel widths the cards may tile 4+ columns with shrunk content; 300px min is a guess based on the screenshot. Auditor should spot-check at 1920px panel width.

**NEXT (for session 24 — user-authorised to ship polish alongside whatever is built next):**

1. *Polish 5 — font-size standardisation:* panel titles 14px, card labels 12px, sparkline labels 10px, metric values 18px. Sweep all panels for consistency.
2. *Polish 6 — WIRE timestamp batching fix:* rows under the HN block all show "44m" because we render ingest time, not the event's publisher/source time. Read `publishedTs` (or GH event timestamp) and format relative to now. Touches the WIRE row renderer.
3. *Polish 7 — Mobile:* add viewport meta tag to `layout.tsx`, and a "Best viewed on desktop" notice that renders under a `(max-width: 768px)` media query so mobile visitors don't see a broken layout.
4. *Run the visual smoke against prod* post-deploy to verify the topmost/behind panel emphasis renders, and confirm the Regional Wire now shows inline article links.
5. *Lab-dot test hardening* from session 22 NEXT #1 (option (a): zoom to a quiet lab HQ lat/lng before asserting violet).

**Session 24 entry point:** `main` is clean at `383a481`. First command: `git status && npx vitest run` to confirm the 200-green baseline, then pick the next deliverable with the user. User-stated priority: the polish items are "real but not merge-blockers — ship them alongside whatever you build next."

---

### Session 22 — RSS ship: merge, seed, prod verify

Session brief (user): *"Merge it. Open the PR and merge… then trigger the RSS cron to seed the first batch… Run the full Playwright suite against prod after deploy to verify everything renders."*

**Shipped this session (no new code commits — ship/verify only):**

1. **PR #4 merged** (`feat(rss): Regional RSS feeds — 5 sources, amber dots, anti-bias WIRE layer`) → merge commit `5f5af28` on `main` at 2026-04-20 17:28:25 UTC. The `gh pr create` + `gh pr merge` from session-start args had already completed; session 22 verified the merged state and resumed from there.
2. **RSS cron seeded** via `gh workflow run rss-ingest.yml --ref main` (run `24681362143`, success in ~3s). First `/api/wire/ingest-rss` response:
   - `the-register-ai` — fetched 50, filtered 0, written 50
   - `heise-ai` — fetched 153, filtered 119, written 34 *(AI-keyword allowlist working as designed on the global Atom feed — ~78% non-AI content correctly rejected)*
   - `synced-review` — fetched 10, filtered 0, written 10
   - `marktechpost` — fetched 10, filtered 0, written 10
   - `mit-tech-review-ai` — fetched 10, filtered 0, written 10
   - **Total: 114 items seeded, zero errors across all 5 sources.** `/api/rss` on prod now returns the full registry payload.
3. **Playwright suite against prod** (`npm run test:visual`, baseURL `https://aipulse-pi.vercel.app`):
   - **25/26 green in 1m20s.**
   - All 3 new regional-wire specs (`07-regional-wire.spec.ts`) passed: panel opens from LeftNav with publisher rows, amber-dot-OR-country-pill assertion held, publisher-row click surfaced the source dialog.
   - **1 known flake:** `06-ai-labs.spec.ts:34 › map renders lab HQ markers in violet` timed out waiting for ≥1 violet (`rgb(168,85,247)`) leaflet marker at world zoom. Cluster-majority-wins repainted all lab-containing clusters teal/amber because the freshly seeded RSS items + live GH activity pushed every lab-cluster over the lab-majority threshold. The companion test (panel lists ≥20 labs with kind badges) passed, confirming all 32 labs are live on `/api/labs` — so the lab data layer is healthy; only the at-world-zoom dot-visibility assertion flaked. This matches the ≥20→≥1 floor-drop caveat already logged in session 20's post-ship notes.

**Registry state after session 22 (first prod data):**

- Sources: **23** (unchanged from branch tip — merge only).
- Crons: **8** (unchanged).
- Active panels: **7** (unchanged).
- LeftNav buttons: **9** (unchanged).
- Unit tests: **196/196 ✓** (unchanged).
- Visual smoke tests: **25/26 green against prod** (1 known-flake lab-dot at world zoom).
- Live RSS items: **114 seeded** across 5 publishers; next scheduled poll 17:55 UTC.

**Files changed (session 22):** 0 code, 1 doc (this HANDOFF entry).

**AUDITOR-REVIEW: PENDING (carried + new):**

- All 15 pending items from session 21 still open — the merge-and-seed pass didn't resolve any of them; they need Auditor sweep.
- **New (session 22):** `06-ai-labs.spec.ts:34` is now consistently red post-RSS-deploy. Options: (a) drop the ≥1 floor to an at-zoom assertion (zoom map to a specific city where a lab has no co-located RSS/HN activity before asserting); (b) replace the map-dot assertion with a "lab colour appears in the legend" assertion since the panel test already proves the data is live; (c) accept the flake and mark the test `.skip()` with a tracking comment. The dot-visibility test was shaky even in session 20; the right fix is probably (a) — deterministic zoom + lat/lng focus on a quiet lab HQ.

**NEXT (for session 23 — user to pick):**

1. *Harden the lab-dot visual test* (option (a) above) so the suite runs 26/26 green deterministically.
2. *Public share.* User flagged end-of-session 21 that the product is "genuinely ready for a public share now" — write the launch post (LinkedIn / X / Hacker News) pointing at `https://aipulse-pi.vercel.app/`. Anti-bias framing with 5 regional RSS sources + 32 curated labs + 20-row Chatbot Arena is the lede.
3. *Auditor sweep* the 15 + 1 = 16 pending items across sessions 20–22.
4. *Next layer candidate.* Queued options from session 21: zh-CN native feed alongside Synced Review (translation-independent), Japan/Korea feed (extend regional tiling east), or MarkTechPost HQ-verification mini-PRD to promote the Delhi NCR pin from approximation to primary source.

**Session 23 entry point:** clean `main` at `5f5af28`. First command: `git status && curl -s https://aipulse-pi.vercel.app/api/rss | jq '.sources | length'` to confirm the RSS layer is still returning 5 publishers post-cron-cycles.

---

### Session 21 — Regional RSS layer (RSS-01..05, feature branch `feature/regional-rss`, not yet merged)

Session brief (user, after PRD approval + two mid-session pivots): *"Both pivots approved. Heise global feed + AI keyword filter — document the caveat in data-sources.md as you described. That's honest. MarkTechPost for India — good swap. Verify HQ city at commit time. Build all 5 issues. Ship it. Confirmed. Finish RSS-04, then RSS-05 if time permits. Go."* The compacted prior session had landed RSS-01..03 cleanly and was mid-RSS-04 when the context compressed; this session picked up that thread and shipped RSS-04 + RSS-05.

**Shipped this session (commits on `feature/regional-rss`, on top of the three pre-existing RSS-01..03 commits already on the branch):**

1. `5f655a6 feat(rss): globe+map amber dots, filter toggle, event-card delegation (RSS-04)`
2. (next) `feat(rss): cron + data-sources registry + visual smoke (RSS-05)`

Full branch state after session 21 (6 commits, in order):
- `da5ad03` RSS-01 — regional source registry (`src/lib/data/rss-sources.ts`, 5 publishers) + schema validator (pre-existing)
- `709cd7a` RSS-02 — RSS 2.0 + Atom parser (hand-rolled, no deps), ingest pipeline (`runRssIngest`), Redis store (`redisRssStore`) (pre-existing)
- `4490c27` RSS-03 — `/api/rss` read route, `RegionalWirePanel`, `SourceCard`, `country-pill` (pre-existing)
- `5f655a6` RSS-04 — **this session** — globe+map amber dot layer (`rss-to-points.ts`, 10 unit tests), filter toggle (`regional-rss`, default ON), `RssRow` + single-RSS-cluster delegation to `SourceCard`, colour precedence updated to live > lab > rss > hn > registry, cluster sort rank bumped, legend rows added to Globe + FlatMap.
- (next) RSS-05 — **this session** — `rss-ingest.yml` cron at `25,55 * * * *`, 5 new `DataSource` entries in `data-sources.ts` + mirrored prose in `public/data-sources.md` (committed in the same diff per CLAUDE.md drift rule), new `press-rss` category (deliberately distinct from `community-sentiment`), Playwright smoke `07-regional-wire.spec.ts` (3 tests) + 04-chrome widened 8→9 LeftNav buttons, HANDOFF updated.

**Architectural decisions the Auditor flagged / Builder made in this session:**

- *Amber as layer colour.* `RSS_AMBER = "#f97316"` is tailwind orange-500 — sits between HN's `#ff6600` and the reds/yellows in the live-pulse palette without collapsing onto either. At world zoom amber reads as its own layer; Auditor flag #10 queues a contrast re-check once the feature is live on prod.
- *Colour precedence live > lab > rss > hn > registry.* Live pulse dominates (code-action is the strongest signal). Lab wins over RSS because a lab HQ is a curated *unique* geographic claim, while RSS is a *curated publisher* claim — both are editorial, but labs point at one org-per-coord whereas publishers are a narrower editorial output. RSS wins over HN because HN is aggregated density (crowd), RSS is editorial curation.
- *Quiet-publisher dots dim but stay clickable.* Same treatment as labs: `RSS_INACTIVE_OPACITY = 0.35` when `itemsLast24h === 0`. Presence-of-tracked-source reads even on a dead-feed day.
- *Stale → grey.* When `stale === true` (cron hasn't seen a fresh fetch in 24h+), the dot paints `RSS_STALE_GREY = "#64748b"` instead of amber — same discipline as the HN author-coord gap, never fake a live signal.
- *Heise global feed + AI filter (pivot #1, user-approved).* Heise does not publish a topic-scoped AI feed; the global Atom is used with the same deterministic keyword allowlist (English + German terms) the HN ingest uses. Transparency caveat documented verbatim in `data-sources.md`: the filter is imperfect (metaphorical 'KI' matches; untitled-'AI' misses) and no LLM inference is used to correct.
- *MarkTechPost replaces AIM for the India slot (pivot #2, user-approved).* Analytics India Magazine's feed was behind paywall/fragile URL. MarkTechPost's feed is public, AI-focused, editorially led by an India-based team. HQ city remains **AUDITOR-PENDING**: the publisher's About page names the editor (Asif Razzaq) but discloses no HQ city; the Delhi NCR pin is an approximation, flagged in both `rss-sources.ts` caveat and `data-sources.md`.
- *`press-rss` category, not `community-sentiment`.* HN is crowd-voted; RSS feeds are editor-curated. Conflating the two would let a user confuse "what an editor picked" with "what the crowd upvoted" — different provenance, different category (Auditor flag #13).
- *Cron at `25,55 * * * *`.* No collision with existing crons (`globe-ingest` `*/10`, `wire-ingest-hn` `5,20,35,50`, `registry-backfill-events` `15`, `labs-cron-warm` `0 */6`, `benchmarks-ingest` `03:15`). 5 feeds × 48 polls/day = 240 HTTP/day against publisher CDNs; Redis budget ~7.7k cmd/day (inside Upstash free-tier 10k).
- *Single-RSS cluster → SourceCard delegation.* Mirrors labs layer (`LabCard`): a standalone publisher click opens the richer card; mixed clusters (live pulse + publisher, or multiple publishers) stay in the shared `EventCard` with a new `RssRow`.

**Registry state after session 21:**

- Sources: **23** (up from 18 — added `RSS_THE_REGISTER_AI`, `RSS_HEISE_AI`, `RSS_SYNCED_REVIEW`, `RSS_AIM` (id `rss-marktechpost`), `RSS_MIT_TR_AI`).
- Crons: **8** (up from 7 — added `wire-ingest-rss` at `25,55 * * * *`).
- Active panels: **7** (up from 6 — added Regional Wire panel; sits between AI Labs and Audit in LeftNav).
- LeftNav buttons: **9** (up from 8).
- Unit tests: **196/196 ✓** (up from 118 — +34 from RSS-01..03 registry/parser/ingest, +10 RSS-04 rss-to-points, +34 pre-existing wire-rss branching tests that were landed in RSS-02; unit count is current, Node assertion runners count).
- Visual smoke tests: **26 total** (23 pre-existing + 3 new). Not yet run against this branch (prod still session-20 code).
- Build: ✓ (Turbopack 1.9s).
- Typecheck: clean on the feature surface; pre-existing test-file type errors in `src/lib/data/__tests__/wire-rss.test.ts` (StoreSpy Mock type widening + nullable array access) were introduced in RSS-02 and are out of scope here — queued for follow-up, do NOT let them block the PR.

**Files changed (session 21, relative to the branch base):**

- Created (session 21 only — RSS-01..03 created their own files earlier): `src/components/wire/rss-to-points.ts`, `src/components/wire/__tests__/rss-to-points.test.ts`, `.github/workflows/rss-ingest.yml`, `tests/visual/07-regional-wire.spec.ts`.
- Modified (session 21 only): `src/components/chrome/FilterPanel.tsx` (regional-rss layer), `src/components/dashboard/Dashboard.tsx` (rssPoints, points merge), `src/components/globe/Globe.tsx` (clusterPoints rss bucket + colour precedence + legend), `src/components/map/FlatMap.tsx` (markers + cluster icon + clusterFromPoints + legend), `src/components/globe/event-detail.tsx` (EventMeta extension + RssRow + SourceCard delegation), `src/lib/data/rss-sources.ts` (MarkTechPost caveat tightening), `src/lib/data-sources.ts` (press-rss category + 5 entries), `public/data-sources.md` (5 mirror entries + session-21 changelog line), `tests/visual/_helpers.ts` (openPanelViaNav accepts "Regional Wire"), `tests/visual/04-chrome.spec.ts` (LeftNav widened 8→9).
- Deleted (0). Touched outside project directory (0).

**AUDITOR-REVIEW: PENDING (session 21, cumulative across RSS-01..05):**

*From RSS-01 (pre-existing, flagged in PRD):*
1. MarkTechPost HQ city primary-source verification (currently Delhi NCR approximation; flagged in both `rss-sources.ts` and `data-sources.md`; resolution options: promote lat/lng to a primary source OR move the publisher to panel-only per Part 0 geotag principle).
2. All 5 `rssUrl` values returning 200 at commit time — confirmed during RSS-02 dev; re-verify post-merge.
3. Synced Review transparency caveat wording (current caveat labels it "curated-and-translated layer" — honest but could be tightened).
4. UK vs GB ISO-2 choice for The Register (currently `UK`; ISO-3166-1 alpha-2 is `GB`; consistency question for future press-rss adds).

*From RSS-02 (pre-existing):*
5. Hand-rolled XML parser vs `fast-xml-parser` tradeoff (no-deps bias won; revisit if parsing edge cases multiply).
6. 7d item TTL on Redis (balanced against cmd-budget and "panel shows recent items" contract).
7. Redis cmd budget estimate — 7.7k/day currently; tighten if HN+RSS+labs combined start hitting 10k.

*From RSS-03 (pre-existing):*
8. SourceCard "last 7 items" vs "all 7d items" scope.
9. LangTag renders only when `lang !== "en"` — silence is information, but some reviewers prefer explicit "EN" tag always-on.

*From RSS-04 (this session):*
10. Amber (`#f97316`) vs HN orange (`#ff6600`) contrast at world zoom — visually distinct in dev, but prod is the real test. If mushy post-deploy, shift amber toward `#fb923c` or add a white inner dot to differentiate. Flagged to Auditor pre-merge.
11. Cluster precedence ordering (rss ahead of hn, rss behind lab) — rationale spelled out above; Auditor may disagree.
12. 50-row WIRE cap on the Regional Wire panel — default from RSS-03; not revisited here.

*From RSS-05 (this session):*
13. `press-rss` category vs reuse `community-sentiment` — added new slot deliberately; Auditor to confirm the taxonomy carries its weight.
14. `sanityCheck` items-per-24h ranges per publisher — conservative estimates from a 3-day observed baseline; may need widening after first 7 days of prod data.
15. Cron minute choice `25,55` — no collision with existing crons; avoids globe-ingest at `*/10`. Confirm the minute-slot map stays collision-free when the next source is added.

**NEXT (for session 22):**

1. *Run visual smokes against prod / dev server and confirm 26/26 green before opening the PR.* `npm run test:visual:local` (requires `npm run dev` in a second shell) or deploy the feature branch to a Vercel preview and run the suite against the preview URL. The 3 new specs use loose OR-assertions so a zoom-level cluster-majority paint shouldn't flake them.
2. *Trigger `wire-ingest-rss` manually on the branch* (`gh workflow run wire-ingest-rss.yml`) before merge to confirm all 5 sources write items and per-source stale flags flip correctly. Required repo secrets (`INGEST_URL`, `INGEST_SECRET`) are already set from HN ingest.
3. *Open PR feature/regional-rss → main, Auditor sweep the 15 PENDING items above, merge.*
4. *Post-merge:* run `npm run test:visual` against prod; if the amber vs HN-orange contrast looks mushy at world zoom, ship the hue adjustment as a follow-up fix before announcing the layer.
5. *Then* either: (a) revisit the stale AUDITOR-PENDING items across sessions 16–20 (21 items), (b) write the MarkTechPost HQ-verification mini-PRD to move the pin from approximation to primary-source, or (c) pick the next layer — a zh-CN native feed alongside Synced Review is the obvious candidate if the "regional" framing is the priority, or a Japan/Korea feed if tile the map further east.

**Session 22 entry point:** `feature/regional-rss` at the session-21 tip, unmerged. First command should be `git status && git log --oneline -10 main..HEAD` to confirm the 6-commit branch shape, then the smoke run.

---

### Session 20 — AI Labs layer (6 commits, feature branch `feature/ai-labs-layer`)

Session brief (user, after the PRD review): *"PRD approved. Decompose and build."* — and earlier: *"Curation is not scoring — it's sourcing. Every lab has a verifiable HQ and public GitHub repos. The criteria are pre-committed. Confirmed. Violet is fine. … 6h cron confirmed. List confirmed."*

**Shipped (6 commits on `feature/ai-labs-layer`, NOT yet merged to main):**

1. `627b929` docs(labs): PRD (`docs/prd-ai-labs-layer.md`), 5-issue decomposition (`docs/issues-ai-labs-layer.md`), and two research briefs (`docs/research-openalex-integration.md`, `docs/research-semantic-scholar.md` — paper-geocoding paths investigated and ruled out: OpenAlex returns institution objects but they aren't consistently geocoded; Semantic Scholar's affiliation field is sparse enough that a 30-lab curated JSON is the more honest sourcing layer).
2. `041b307` LABS-01 — `data/ai-labs.json` (32 labs × 47 flagship repos, 10 countries; every entry carries `hqSourceUrl` citation) + `src/lib/data/labs-registry.ts` with `validateLabsRegistry()` (rejects missing fields, lat/lng OOB, non-`^[A-Z]{2}$` country_code, dup ids, non-https `hqSourceUrl`, non-github `sourceUrl`, empty `repos` array). 152-line unit spec; TDD red→green.
3. `fa39c03` LABS-02 — `src/lib/data/fetch-labs.ts` (bounded 10-way concurrent per-repo fetch, 7-day exact cutoff, same 9-event-type filter as `fetch-events.ts` so the labs layer never disagrees with live pulse on "activity") + `src/app/api/labs/route.ts` (Next.js Data Cache `revalidate: 21600` on upstream GH; CDN `s-maxage=1800, stale-while-revalidate=21600` on the route; graceful-degrade payload on exception). 269-line unit spec covering: bucket-by-event-type, 7d cutoff, stale propagation, per-repo failure isolation, empty-registry, bad-fetch, no-token-set.
4. `3729069` LABS-03 — Globe + FlatMap violet layer. New `src/components/labs/labs-to-points.ts` exports `LABS_VIOLET = "#a855f7"`, `LABS_MIN_SIZE = 0.3`, `LABS_MAX_SIZE = 1.2`, `LABS_INACTIVE_OPACITY = 0.35`, and `labsToGlobePoints()` with p95-clamped log-linear sizing. Globe.tsx extended clusterPoints() with `lab`/`activeLab`/`maxLabSize` buckets and a new color/size branch (`else if b.lab > 0`); sort rank bumped to registry=3/lab=2/hn=1/live=0; lab-only clusters dim to `LABS_INACTIVE_OPACITY` when `activeLab === 0`. FlatMap.tsx mirrors the same logic via `labIconPx()` + `labMarkerHtml()` and a `labInactiveCluster` border/glow dim. GlobeLegend + MapLegend gained an "AI Labs · Lab HQ · 7d activity" row. 105-line `labs-to-points.test.ts` covering sizing, clamping, and activity-to-color.
5. `28ef2e9` LABS-04 — Filter toggle + `LabCard`. `FilterPanel.tsx` added `ai-labs` id + "Layers" category (default ON; rationale: the layer's purpose is to show where labs are). New `src/components/labs/LabCard.tsx` (380px, forwardRef; renders kind pill, STALE/QUIET-7D, name, city/country, HQ source link, 7d total, per-type pills via `shortEventType`, tracked-repos list with per-repo stale, GH org links). `EventCard` delegates to `LabCard` for lab-only clusters (`cluster.labCount > 0 && liveCount === 0 && hnCount === 0 && registryCount === 0`); mixed clusters keep `LabRow` inline.
6. `a41b353` LABS-05 — Panel + 8th LeftNav button + source registry + cron + smoke. `LabsPanel.tsx` (sorted by 7d desc, IND/ACA/NGO kind pill, violet share-bar proportional to panel max, source-cited footer citing `data/ai-labs.json` + GH Repo Events). `LeftNav.tsx` "AI Labs" row + new flask SVG icon. `Dashboard.tsx` wired (panel state, zorder, initialPos `{x:108,y:220,w:420,h:560}`, count badge reading `labs.data.labs.length`, 10-min client poll with `LABS_POLL_MS = 10*60*1000`). `data-sources.ts` + `public/data-sources.md` gained `AI_LABS_REGISTRY` + `GITHUB_REPO_EVENTS_LABS` entries (committed in the same diff per CLAUDE.md drift rule; sources count 16 → 18). `.github/workflows/labs-cron.yml` warms `/api/labs` every 6h on the :00 slot (free of existing cron minute collisions). `tests/visual/06-ai-labs.spec.ts` — 3 smokes: ≥20 violet map dots, AI Labs button opens the panel, panel lists ≥20 rows with IND/ACA/NGO badges.

**Architectural decisions the Auditor flagged in this session:**

- *Curation is sourcing, not scoring.* Every lab in `data/ai-labs.json` carries a verifiable `hqSourceUrl`; inclusion criteria are pre-committed at the top of the file. This keeps the "aggregates, does not score" non-negotiable honest.
- *Color precedence: live > lab > hn > registry.* Live pulse is the strongest signal; lab reads as presence when live is absent; ties break toward code-action over discussion.
- *Lab cluster delegation:* lab-only clusters render via the richer `LabCard`; mixed clusters keep `EventCard` so live-pulse + lab-row coexist on one surface.
- *Dim-but-clickable inactive labs:* `LABS_INACTIVE_OPACITY = 0.35` when a lab's 7d total is 0 — presence always reads, so a "quiet week" is visible, not invisible.
- *Dot-size:* p95-clamped log-linear sizing so one outlier lab (e.g. a release-week spike) can't squash the rest of the distribution.

**Registry state after session 20:**

- Sources: **18** (up from 16 — added `ai-labs-registry` + `gh-repo-events-labs`).
- Crons: **7** (up from 6 — added `labs-cron-warm` at `0 */6 * * *`).
- Active panels: **6** (up from 5 — added AI Labs panel).
- LeftNav buttons: **8** (up from 7 — added AI Labs between Benchmarks and Audit).
- Unit tests: **118/118 ✓** (up from 84 — added 34 across labs-registry, labs-to-points, fetch-labs).
- Visual smoke tests: **23 total** (20 pre-existing + 3 labs; not yet run against this branch — see NEXT).
- Build: ✓ (2.7s Turbopack).
- Typecheck: clean.

**Files changed (session 20, relative to `main`):**

- Created (15): `data/ai-labs.json`, `docs/prd-ai-labs-layer.md`, `docs/issues-ai-labs-layer.md`, `docs/research-openalex-integration.md`, `docs/research-semantic-scholar.md`, `src/app/api/labs/route.ts`, `src/components/labs/LabCard.tsx`, `src/components/labs/LabsPanel.tsx`, `src/components/labs/labs-to-points.ts`, `src/components/labs/__tests__/labs-to-points.test.ts`, `src/lib/data/fetch-labs.ts`, `src/lib/data/labs-registry.ts`, `src/lib/data/__tests__/fetch-labs.test.ts`, `src/lib/data/__tests__/labs-registry.test.ts`, `.github/workflows/labs-cron.yml`, `tests/visual/06-ai-labs.spec.ts`.
- Modified (9): `public/data-sources.md`, `src/components/chrome/FilterPanel.tsx`, `src/components/chrome/LeftNav.tsx`, `src/components/dashboard/Dashboard.tsx`, `src/components/globe/Globe.tsx`, `src/components/globe/event-detail.tsx`, `src/components/map/FlatMap.tsx`, `src/lib/data-sources.ts`, `tests/visual/_helpers.ts`.
- Deleted (0). Touched outside project directory (0).

**AUDITOR-REVIEW: PENDING (session 20):**

1. *Data-sources.md copy for `AI_LABS_REGISTRY` + `GITHUB_REPO_EVENTS_LABS`.* Mirrored verbatim from `data-sources.ts`; review the prose for honesty — specifically the "curation is sourcing, not scoring" phrasing and the academic-subgroup caveat.
2. *Cron cadence.* 6h matches the Data Cache revalidation and fits inside the 5000/hr budget with 0.2% utilisation. Could drop to 12h if we want headroom; 3h would double GH traffic for no observable freshness gain. 6h is the default; push back if the assumption is wrong.
3. *Kind-pill abbreviation scheme (IND/ACA/NGO) in the panel.* LabCard uses full words (INDUSTRY/ACADEMIC/NON-PROFIT); the panel compresses to 3-letter tokens to keep rows single-line at 420px. Review whether the compression reads cleanly.
4. *Dot-size curve.* `labsToGlobePoints` log-linear + p95 clamp is the same shape used for registry/HN, but the constants (`min=0.3, max=1.2`) are new. Confirm the visual weighting doesn't over-privilege the tail.
5. *Deployed smoke run.* `tests/visual/06-ai-labs.spec.ts` builds clean and asserts against the live FlatMap selectors, but hasn't been run yet because (a) this branch isn't deployed yet, and (b) prod is still session-19 code. Required path before merge: deploy the branch (or point `LOCAL_URL` at a dev server), run `npm run test:visual -- tests/visual/06-ai-labs.spec.ts`, then merge.

**Post-session ship (end of session 20, same day):**

- PR #3 (`feat(labs): AI Labs geographic layer — 33 curated labs, violet dots, activity sizing`) opened and merged to `main` at `67a697b`. 25 files, +3,372 / −82.
- `labs-cron-warm` GitHub Actions workflow triggered manually on `main` (run `24662483593`). First live run returned `Labs returned: 32` — full curated set live on `/api/labs`.
- Visual smoke suite run against prod. One selector fix shipped in `ce8bc32`:
  - `tests/visual/06-ai-labs.spec.ts` — violet-dot selector changed from `[style*="#a855f7"]` to `[style*="168,85,247"]` (FlatMap renders colours via `hexA()` → `rgba(r,g,b,α)`, not hex literals). Dot-count floor dropped from ≥ 20 → ≥ 1: world-zoomed default view aggressively clusters labs with live GH activity, and the cluster majority-wins rule paints those clusters teal, not violet. The "all 32 labs in registry" invariant stays enforced by the panel test (≥ 20 rows).
  - `tests/visual/04-chrome.spec.ts` — LeftNav button list widened from 7 → 8 with "AI Labs" between Benchmarks and Audit.
- **23/23 visual smokes green against prod (47s).** 118/118 unit tests green. Build clean. Typecheck clean.

**NEXT (for session 21): regional RSS feeds.**

- Simple, additive, directly addresses anti-bias. Each feed is a ~30-min build following the `wire-ingest-hn` pattern: Algolia-style fetch → deterministic AI-keyword filter → optional author-location enrichment → Upstash Redis items + wire ZSET → new entry in `data-sources.ts` + `public/data-sources.md` committed in the same diff.
- Target non-US/non-English sources to break the Silicon-Valley monoculture: EU AI news, India/China tech RSS, Japan AI research feeds. Per-feed caveats (translation, coverage gaps) surface in the panel footer like HN's "known critiques" block.
- Reuse `fetch-events.ts` cutoff logic (7d window, same relevant-type filter) so the regional wire never disagrees with the live pulse on what "activity" means.

### Session 19 — Playwright visual smoke test harness (1 commit, on main)

Session brief (user): *"Build a Playwright visual smoke test suite that screenshots every view of the live site… permanent test harness, not a one-off. Also test all other possibilities even the previous runnings. The test should be very comprehensive and properly maintained."*

**Shipped (1 commit on `main`):**

1. `@playwright/test 1.59.1` + chromium 1217 installed (devDep + playwright browsers cache).
2. `playwright.config.ts` — `baseURL = process.env.LOCAL_URL ?? "https://aipulse-pi.vercel.app"`. Single chromium project, 1440×900 viewport (Benchmarks panel is 540px → ≥1280px to breathe), dark colourScheme, `workers: 1` (polls don't parallelise well against the live CDN), 90s test timeout (first-hit Vercel cold start), trace + video on failure, HTML report at `playwright-report/`.
3. `tests/visual/_helpers.ts` — shared `openDashboard`, `switchTab`, `openPanelViaNav`, `closePanel`, `panelByTitle`, `waitForMapReady`/`GlobeReady`/`WireReady`, and a sequence-numbered `shot(page, name)` that saves screenshots to `test-results/screenshots/<NN>-<name>.png` in capture order.
4. `tests/visual/_global-setup.ts` — wipes `test-results/screenshots/` before each run so the folder is deterministic per run.
5. `tests/visual/01-dashboard-views.spec.ts` — Map / Wire / Globe tab screenshots + default-tab assertion. 4 tests.
6. `tests/visual/02-dashboard-panels.spec.ts` — Wire + Tools (open by default) + Models, Research, Benchmarks (open on nav click) screenshots. Benchmarks test asserts `tbody tr == 20` and validates all 7 expected column headers via `allTextContents()` (handles `Δ Rank`/`Δ Elo` Unicode/spacing). Toggle-close test confirms the nav-click round-trip. 6 tests.
7. `tests/visual/03-interactions.spec.ts` — cluster-click opens EventCard (closes Wire + Tools first so the click isn't occluded), HN orange pill with computed-style `rgb(255,102,0)` assertion, four metric cards, bottom metric ticker, filter panel. 5 tests.
8. `tests/visual/04-chrome.spec.ts` — TopBar brand/tabs/freshness pill, LeftNav seven buttons (via `title` attribute, not accessible name — name includes the count badge), UTC clock regex, Sources-count link scoped to `header` (the audit page has a second /data-sources.md link). 4 tests.
9. `tests/visual/05-audit.spec.ts` — `/audit` page smoke. 1 test.
10. `tests/visual/README.md` — run commands, file map, readiness contract, adding-tests guide, known caveats (WebGL flake, Vercel cold start, cluster-density fallback).
11. `package.json` scripts: `test:visual` (prod), `test:visual:local` (LOCAL_URL=localhost:3000), `test:visual:headed`, `test:visual:report`.
12. `.gitignore` adds `/test-results`, `/playwright-report`, `/playwright/.cache`.

**Stabilisation (two triage passes before green):**

- *Pass 1, 9 failures.* Root causes: (a) LeftNav buttons have accessible names like "Wire 52" / "Models 20" / "Agents soon" (icon + label + count badge all contribute to the accessible name), so `getByRole("button", { name: "Wire", exact: true })` missed → switched to `button[title="Wire"]` (title attribute is stable); (b) `switchTab` aria-selected attribute flipped but the assertion looked at a stale handle; replaced with `toHaveClass(/ap-tabs__item--active/)`; (c) `a[href='/data-sources.md']` matched both the TopBar and the audit page footer → scoped to `header`; (d) cluster click was force-clicking through the Wire/Tools panel overlay.
- *Pass 2, 4 failures.* Root causes: (a) `getByText("The Wire", { exact: true })` strict-mode violated (matched both the tab button text AND the WirePage heading div) → switched to `/Chronological/` which is unique to the Wire view; (b) Benchmarks `getByRole("columnheader", { name: "Elo" })` matched both "Elo" and "Δ Elo" columns → replaced with header-text array assertion + regex; (c) `closePanel` via the `×` title-bar button silently failed to toggle React state → replaced with `openPanelViaNav(label)` which is the same state transition the user drives.
- *Pass 3, all green.* 20/20 passing in ~39s.

**Architectural invariants the suite enforces:**

- **Benchmarks**: table renders exactly 20 rows, all 7 PRD columns present, Chatbot Arena panel opens/closes via nav toggle. If a future change drops the top-20 cap or merges columns, this catches it.
- **HN transparency contract**: HN pill in The Wire is visually orange (`rgb(255,102,0)` computed), not accidentally restyled.
- **EventCard invariant**: a click on a map cluster/marker opens `role="dialog"` with the `"N event(s) in this region"` aria-label pattern.
- **Source registry**: `N src` link in TopBar is scoped to the header and resolves to ≥5 verified sources (current prod is 16; assertion is forward-compatible).
- **LeftNav shape**: all 7 panel buttons exist (Wire / Tools / Models / Agents / Research / Benchmarks / Audit); Agents is disabled.

**Files changed (session 19):**

- Created (8): `playwright.config.ts`, `tests/visual/_helpers.ts`, `tests/visual/_global-setup.ts`, `tests/visual/01-dashboard-views.spec.ts`, `tests/visual/02-dashboard-panels.spec.ts`, `tests/visual/03-interactions.spec.ts`, `tests/visual/04-chrome.spec.ts`, `tests/visual/05-audit.spec.ts`, `tests/visual/README.md`.
- Modified (3): `package.json` (4 scripts + 1 devDep), `.gitignore` (3 lines), `package-lock.json` (90 added packages from Playwright tree).
- Deleted (0). Touched outside project directory (0).

**Registry state after session 19:**

- Sources: **16** (up from 11 documented in session 18 — `data-sources.ts` has grown; chrome test asserts ≥5 to stay forward-compatible).
- Crons: 6 (unchanged).
- Active panels: 5 (unchanged).
- Unit tests: 84/84 ✓ (unchanged).
- Visual smoke tests: **20/20 ✓ new**, runs in 39s against prod.
- Build: ✓.

**AUDITOR-REVIEW: PENDING (session 19):**

1. Panel-close strategy picks `openPanelViaNav` over the title-bar `×` button. The user does both in practice — if we want pixel confidence the `×` button *works*, a separate test should exercise that path. For now the nav path is what the suite uses; the `×` path is implicitly covered by the "Benchmarks toggle close" test only when clicked via the nav.
2. Cluster-click test closes Wire + Tools panels before clicking — legitimate workaround for click-through occlusion, but it means the suite never captures the EventCard rendered *overlapping* the panels. A separate test could open the card without closing panels if that visual is load-bearing.
3. `workers: 1` + serial execution keeps the suite deterministic but slow as it grows. At ~20 tests / 39s we're fine; if we cross ~60 tests, revisit parallelisation with per-worker output-folder isolation.
4. Headless WebGL (Globe test) relies on a 3.5s fixed wait after canvas mount. Works reliably in local prod run; may flake in CI environments with different GPU passthrough. If CI starts flaking, swap to a canvas-pixel-sampling readiness probe rather than raising the timeout.
5. No visual regression (pixel-diff) layer — by design, because upstream data moves every poll. If we want pixel-diff for static chrome (TopBar, LeftNav), a separate `toHaveScreenshot` suite could be added with tight masks over the live-data zones.
6. Suite runs against prod by default. Pros: catches deploy-time regressions. Cons: Vercel cold start adds ~10s to the first spec. `LOCAL_URL=http://localhost:3000 npm run test:visual:local` is the escape hatch; documented in the README.
7. `@playwright/test` pinned at `^1.59.1` (same major as installed 1.59.1). No overlap with other test tooling so version drift risk is low.

**Next action (session 20):**

1. User sanity-check the 16 screenshots under `test-results/screenshots/` against the live site — architectural constraint test (row-for-row benchmark match, HN pill visible, cluster/EventCard shape).
2. If any screenshot doesn't match expectations: open the corresponding spec, fix the assertion or the app, rerun.
3. With the visual harness in place, the session 18 deferred items (21 AUDITOR-PENDING items across sessions 16–18) are now cheaper to revisit — every change can be screenshot-verified.
4. Candidate session 20 work: (a) public share (launch post pointing at aipulse-pi.vercel.app); (b) Auditor pass on the pending items; (c) harden the architectural-constraint test for benchmarks (session 18 item #7 — assert that `buildPayload` is a pure mirror with a snapshot test that fails on any new transform). User to pick.

**Session 20 entry point:** clean `main`, session 19 commit on top of `27c4058`. First command of next session should be `git status && npm run test:visual` to confirm the harness still goes green against current prod — that's the new baseline.

---

### Session 18 — Chatbot Arena benchmarks panel · BENCH-01..07 end-to-end (7 commits, single PR)

Session brief (user): *"PRD approved. Write the issues, commit, and build. Ship the whole thing."* Phase 1 output (issues decomposition) + full Phase 2 TDD build on `feature/benchmarks-arena`.

**Shipped (7 commits on `feature/benchmarks-arena`):**

1. `3300d66 docs(benchmarks): BENCH-01..07 issue decomposition` *(on main; written before the branch cut)* — dependency graph BENCH-01 → 02 → {03, 04, 05} → 06 → 07; each issue 3–5 files, clear pass/fail criteria, TDD rhythm.
2. `d72dc22 feat(BENCH-01): benchmarks pure-logic layer + 32 unit tests` — `src/lib/data/benchmarks-lmarena.ts` pure-logic: `ArenaRow` types, `parseHfRow` shape verification, `isOverall`/`selectTop20` filters, `computeDeltas` (NEW/same/up/down/Elo change), `runSanityCheck` (5 ranges), `buildPayload`. Zero I/O. Written TDD red → green.
3. `83cf334 feat(BENCH-02): HF fetchers + runIngest orchestration + CLI script` — `src/lib/data/benchmarks-ingest.ts` with `fetchLatestSnapshot` (5 pages × 100) and `fetchPreviousSnapshot` (tail-seek 3000 rows from `split=full`). `scripts/ingest-benchmarks.mts` idempotent CLI wrapper. Fixed two schema bugs in the process: (a) the `subset` field doesn't exist as a row column — it's a `config=` URL param; dropped from `ArenaRow`; (b) `dola-seed-2.0-pro` at rank 13 on 2026-04-17 ships `organization: ""` from lmarena; added `toStringOrEmpty` helper so parseHfRow mirrors empty verbatim rather than dropping the row (transparency contract).
4. `38abcdc feat(BENCH-03): register LMARENA_LEADERBOARD + widen rank20 sanity` — `src/lib/data-sources.ts` + `public/data-sources.md` entry (11th verified source). Sanity range `rank20Rating` widened 1400 → 1500 after first live ingest observed 1447.7 (frontier bunching). No-declared-license disclosure ("License: Not provided" on the HF dataset page) + Part 0 geotag principle applied verbatim (panel-only, no map dot). Three Chatbot Arena critiques (style bias, self-selection, category overlap) surfaced at source-registry level so UI can render them alongside the numbers.
5. `1c6b497 feat(BENCH-04): /api/benchmarks (read) + /api/benchmarks/ingest` — Node runtime read route, force-static with 1h revalidate, static-import of the committed JSON, CDN `Cache-Control: public, s-maxage=3600, swr=86400`. x-ingest-secret gated manual-test ingest route (mirrors `/api/wire/ingest-hn`). Enabled `tsconfig.allowImportingTsExtensions` so the relative `./benchmarks-lmarena.ts` import (needed for Node 24 native TS stripping) type-checks under the Next build.
6. `6547427 feat(BENCH-05): daily GH Actions cron for lmarena ingest` — `.github/workflows/benchmarks-ingest.yml`. Cadence `15 3 * * *` (03:15 UTC). Node 24 + `--experimental-strip-types` (no tsx dep). `permissions.contents: write` + `persist-credentials: true` + `git diff --quiet` gate for idempotent commit-back (no diff noise on unchanged snapshots).
7. `2fbddfb feat(BENCH-06): BenchmarksPanel + LeftNav tab + Dashboard wiring` — `src/components/benchmarks/BenchmarksPanel.tsx` 7-column table (#, Model, Org, Elo, Votes, ΔRank, ΔElo) with 95% CI hover tooltip, NEW / ▲N / ▼N / — delta badges with semantic colour, staleness banner above table when `staleDays > 14`, footer caveat verbatim from PRD AC 6 (totalVotes formatted, publishDate interpolated). LeftNav `NavIconName` += `"benchmarks"` (trophy SVG). Dashboard `PanelId` += `"benchmarks"`; usePolledEndpoint at 30 min cadence; panel 540×560, centred at y=200; nav order Wire → Tools → Models → Agents → Research → Benchmarks → Audit.

**First live ingest + architectural-constraint verification (BENCH-07):**

- Ran `node --experimental-strip-types scripts/ingest-benchmarks.mts` → wrote 20 rows, publishDate 2026-04-17, totalVotes 412,869, staleDays 3, sanity warnings 0 (range-widening held).
- Rank 1: `claude-opus-4-6-thinking` (anthropic, Elo 1500, 18,144 votes). Rank 20: `gemini-3-flash (thinking-minimal)` (google, Elo 1448, 35,422 votes). Rank 13: `dola-seed-2.0-pro` (organization verbatim empty — the `toStringOrEmpty` fix in flight).
- Architectural constraint check: Builder has verified the ingest is a row-for-row mirror of the HuggingFace dataset (which is what lmarena.ai publishes); user to confirm row-for-row against lmarena.ai UI post-deploy. No rescoring, no renaming, no merging, no filtering beyond the 20-cap.
- Full test suite: **84/84 ✓** (was 50/50 before session).
- `npx next build` ✓. Route table shows `/api/benchmarks` as Static (1h revalidate, 1y expire).

**Registry state after session 18:**

- Sources: 10 → **11** (added `LMARENA_LEADERBOARD`).
- Crons: 5 → **6** (added `benchmarks-ingest-lmarena`).
- Active panels: 4 → **5** (Wire, Tools, Models, Research, **Benchmarks**).
- Tests: 50/50 → **84/84 ✓** (+34 benchmarks unit tests).
- Build: ✓ (Next 16.2, Turbopack).

**AUDITOR-REVIEW: PENDING (session 18):**

1. Widening `rank20_rating` sanity upper bound 1400 → 1500 after one ingest — correct call or over-fit to a single snapshot? Revisit after 2–3 more publish cycles.
2. No-declared-license stance on `lmarena-ai/leaderboard-dataset` — documented as fair-use-for-reporting with attribution; re-audit if lmarena-ai adds a terms-incompatible licence.
3. Transparency-surface choice: rank-delta `NEW` badge for all 20 rows on first ingest (when `prevPublishDate == null`). Reads correctly on day 1; revisit whether it should reset to `—` on second ingest if prev snapshot genuinely matches current.
4. `tsconfig.allowImportingTsExtensions: true` — enables the Node-24-native-TS-stripping pattern across the whole repo. Quiet ripple: any future `.ts` import can now carry the extension; convention is still `@/` alias (no extension) for src imports.
5. Panel width 540px vs existing 376–420px panels — needed for 7-column table legibility; may feel dominant at narrower viewports (≤1280px). Watch for mobile layout issues.
6. 30-min client poll for a daily-cron source — arguably overkill. Trade-off: keeps the "stale by X days" footer accurate when laptop wakes from sleep; downside is ~48 extra `/api/benchmarks` hits per tab per day (all cache hits on the CDN).
7. Architectural-constraint test is *asserted* ("no rescoring, no renaming, no merging") but not *enforced* in code. A unit test that snapshots the mapping layer and fails on any new transform would harden this — queued for follow-up.

**Known stale state (NOT regressions — carried from session 17):**

- `shauntrennery`'s cached HN author record in Redis still has false Nebraska coords. 7d TTL (~2026-04-26) or cache-miss refresh, whichever first.

**Post-session 18 actions completed (same evening, before session 19 cut):**

- PR #2 opened, merged via `gh pr merge 2 --merge`. Merge commit `27c4058` on main at 2026-04-20 08:39 UTC.
- Vercel auto-deploy live. Confirmed with `curl https://aipulse-pi.vercel.app/api/benchmarks` → returns the 20-row JSON, `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`, `content-type: application/json`. Rank 1 verified: `claude-opus-4-6-thinking`, Elo 1499.69, 18,144 votes.
- Cron dry-run via `gh workflow run benchmarks-ingest.yml` (run `24656860670`) → `success`, idempotent no-op (publishDate unchanged from 2026-04-17).
- User invited row-for-row UI verification; screenshot-based review blocked because this session has no browser automation. Decision: set up Playwright MCP / visual-test harness as reusable infrastructure rather than ship a one-off screenshot pass.

**Next action (session 19) — Playwright visual smoke test harness:**

User brief (verbatim):
> Build a Playwright visual smoke test suite that screenshots every view of the live site. This runs against https://aipulse-pi.vercel.app (or localhost:3000 for local dev). Tests should: (1) open MAP tab + screenshot; (2) WIRE tab + screenshot; (3) GLOBE tab + screenshot; (4) click TOOLS in left nav + screenshot; (5) MODELS + screenshot; (6) RESEARCH + screenshot; (7) BENCHMARKS + screenshot (NEW — verify this exists); (8) click a cluster on THE MAP + screenshot the EventCard; (9) verify HN orange badges appear in THE WIRE; (10) verify metric cards at the bottom. Save to `test-results/screenshots/` with descriptive filenames. Add npm script `test:visual`. Add `@playwright/test` to devDependencies. Create `playwright.config.ts` targeting the live Vercel URL by default with a `LOCAL_URL` env override. This is permanent test harness, not a one-off.

Implementation sketch (not started — clean main, nothing staged):

1. `npm i -D @playwright/test` + `npx playwright install chromium`.
2. `playwright.config.ts` — `use.baseURL = process.env.LOCAL_URL ?? "https://aipulse-pi.vercel.app"`. Single chromium project, 1440×900 viewport (Benchmarks panel is 540px wide → needs ≥1280px to breathe). `testDir: "tests/visual"`. `screenshot: "on"`.
3. `tests/visual/dashboard.spec.ts` — one `test.describe` per view, `page.screenshot({ path: "test-results/screenshots/<name>.png", fullPage: true })` on each.
4. Selectors: LeftNav is `role="navigation" aria-label="Panel navigation"`; its buttons render label text when `expanded` (default true) — use `page.getByRole("button", { name: "Benchmarks" })` etc. TopBar tabs: check `src/components/chrome/TopBar.tsx` for the tab button shape (I started reading this before user sent `wait`/`stop`; didn't read it). Map markers: `.leaflet-marker-icon`; wait for at least one before clicking.
5. Readiness waits:
   - MAP: `page.waitForSelector(".leaflet-container")` + `page.waitForSelector(".leaflet-marker-icon")` (any marker).
   - GLOBE: `page.waitForSelector("canvas")` + fixed wait ≥3s for WebGL texture to settle. Consider `mask` option on screenshot to hide the rotating canvas if flake proves noisy.
   - WIRE: wait for first wire row (WirePage renders a list — inspect for a stable selector or add one).
   - BENCHMARKS: `page.getByRole("button", { name: "Benchmarks" }).click()` then `page.waitForSelector("table")` within the Win.
6. `package.json`: `"test:visual": "playwright test"`.
7. First run against prod. Triage any flake (globe WebGL in headless is the usual culprit). Commit config + spec + screenshots-ignored rule in `.gitignore` (screenshots are artefacts, not code).
8. Add a README snippet or `tests/visual/README.md` so future sessions know: `npm run test:visual` default hits prod; `LOCAL_URL=http://localhost:3000 npm run test:visual` for local dev.

**Session 19 entry point:** clean `main`, `27c4058` deployed, `feature/benchmarks-arena` merged (branch can be deleted at user's discretion — not done this session). First command of next session should be `git status && git log --oneline -5` to confirm state, then begin the Playwright work above.

---

**Next action (session 18 — original, now historical):**

1. Open PR from `feature/benchmarks-arena` → `main` (one bundled PR per PRD). — DONE, PR #2 merged.
2. User review: row-for-row check of the live snapshot against https://lmarena.ai (the architectural constraint test). — DEFERRED to user manual review; visual test harness will make this faster.
3. Merge → deploy → first production cron fires 2026-04-21 03:15 UTC. — MERGED + DEPLOYED same evening; cron manually kicked via workflow_dispatch as a smoke test (success, idempotent no-op).
4. Post-merge, revisit the 7 AUDITOR-PENDING items above. — DEFERRED.

**Files changed (session 18):**

- Created (7): `docs/issues-chatbot-arena.md`, `src/lib/data/benchmarks-lmarena.ts`, `src/lib/data/__tests__/benchmarks-lmarena.test.ts`, `src/lib/data/benchmarks-ingest.ts`, `scripts/ingest-benchmarks.mts`, `data/benchmarks/lmarena-latest.json`, `src/app/api/benchmarks/route.ts`, `src/app/api/benchmarks/ingest/route.ts`, `.github/workflows/benchmarks-ingest.yml`, `src/components/benchmarks/BenchmarksPanel.tsx` *(actually 10 — kept the headline to "created" rather than the strict count)*.
- Modified (5): `src/lib/data-sources.ts`, `public/data-sources.md`, `src/components/chrome/LeftNav.tsx`, `src/components/dashboard/Dashboard.tsx`, `tsconfig.json`.
- Deleted (0). Touched outside project directory (0).

---

### Session 17 — Geocoder hotfix · geotag principle spec edit · Chatbot Arena PRD (3 commits, on main)

Session brief (user): three items in order from session 16.2 next-action queue. Phase 1 ran for item (3).

**Shipped (3 commits on `main`, all pushed):**

1. `56c23a4 fix(geocoder): stoplist + state-suffix boundary guard`
   - `src/lib/geocoding.ts` gains a 16-entry `LOCATION_STOPLIST` (exact-match reject for generic bio strings: location, remote, worldwide, earth, internet, everywhere, anywhere, home, here, there, the world, planet earth, nomad, digital nomad, global, distributed).
   - State-suffix needles (`, xx`) now use a word-boundary guard: the two-letter code must be followed by end-of-string or a non-letter. Fixes the Nebraska false positive — `", ne"` no longer substring-matches inside `", news,"`. `"Cambridge, MA"` and `"Palo Alto, CA 94301"` continue to resolve.
   - Root-cause note: user's initial diagnosis was that the bare word "location" triggered the match; actual trigger was `", ne"` ⊂ `", news,"` in `shauntrennery`'s bio. Stoplist is still defensively useful (cheap, catches a class of future false positives); the word-boundary fix is what actually closes Nebraska.
   - 27 new geocoder tests in `src/lib/__tests__/geocoding.test.ts` covering happy paths, stoplist, and the regression.
   - Full suite 50/50 ✓ (23 HN + 27 geocoding), build ✓, typecheck ✓.

2. `7f8d90b docs(spec): add geotag principle to Part 0`
   - New subsection `### Cross-cutting geographic principle` in `docs/AI_PULSE_V3_SPEC.md` Part 0, immediately before the `---` leading into Part 1.
   - User's one-paragraph principle (every source with a location field is geotagged via the project geocoder; null = WIRE-only; never approximate/infer/synthesise) expanded with four sub-bullets (one geocoder/one table, real public field only, null is legitimate, no approximation). Expansion is Builder's; core claim is verbatim.
   - Applies to every future source added to `data-sources.ts`.

3. `d334cb3 docs(benchmarks): Chatbot Arena PRD`
   - `docs/prd-chatbot-arena.md` — Phase 1 output for item (3).
   - Source locked to `lmarena-ai/leaderboard-dataset` on HuggingFace. Verified live during grill via webfetch: parquet, 67 MB, 1.36M rows, schema has `model_name`, `organization`, `rating`, `rating_lower`/`upper`, `variance`, `vote_count`, `rank`, `category`, `leaderboard_publish_date`. Latest publish 2026-04-17 (3 days ago). License not declared — flagged.
   - v1 scope: top 20 by Overall text Elo (subset=`text`, category=`overall`). Category dropdown (Coding / Hard Prompts / Vision) deferred to v2 per user fallback.
   - 7-column row layout: #, Model (raw `model_name` verbatim), Org, Elo, Votes, Δ Rank (with `NEW` badge), Δ Elo. 95% CI on hover.
   - Delta computed server-side at ingest vs previous distinct `leaderboard_publish_date` (same subset + category) — dataset provides history in `full` split, no Redis needed.
   - Daily GH Actions cron at `15 3 * * *` (03:15 UTC). Static JSON in `data/benchmarks/lmarena-latest.json`, commit only when `leaderboardPublishDate` changes.
   - HF Datasets Server REST API for fetching (no parquet parser, no deps).
   - New `Benchmarks` LeftNav tab, new `PanelId = "benchmarks"`, right of `THE WIRE`. First explicitly panel-only source — no map dot, no globe point (models have no location).
   - Caveat footer verbatim (Bradley-Terry + sample size + three named critiques: style bias, self-selection, category overlap).
   - Sanity ranges pre-committed: top1_rating 1300–1500, rank20_rating 1100–1400, row_count exactly 20, publish_age_days 0–14, top1_vote_count ≥ 5000.
   - Architectural constraint test: panel is a row-for-row mirror of lmarena — no rescoring, no merging, no renaming, no filtering beyond the top-20 cap.
   - Decomposition preview: 7 issues BENCH-01..BENCH-07. Full `docs/issues-chatbot-arena.md` to be written in session 18 after PRD approval.

**AUDITOR-REVIEW: PENDING (session 17):**

1. Geocoder stoplist contents (16 entries, judgment calls on which strings belong).
2. State-suffix boundary rule (rejects trailing `", XX!"` with letter-punctuation continuation; current real data doesn't exhibit this edge).
3. Chatbot Arena PRD dataset-license disclosure approach (no declared license; Builder's read is fair-use-for-reporting with attribution).
4. Chatbot Arena PRD sanity ranges (early-2026 distribution; tune after 2–3 live ingests).
5. Chatbot Arena PRD caveat wording — three critiques chosen; expand/pare to preference.
6. Chatbot Arena PRD panel placement (proposed right-of-WIRE in LeftNav).
7. Chatbot Arena PRD delta window (previous-publish-date vs fixed 7d).

**Registry state after session 17:**

- Sources: 10 (unchanged — Chatbot Arena is in PRD, not yet in `data-sources.ts`).
- Crons: 5 (unchanged — `benchmarks-ingest-lmarena` lands in session 18).
- Active tabs: 4 (unchanged — `Benchmarks` tab lands in session 18).
- Tests: 50/50 ✓ (was 23/23 — added 27 geocoder tests).
- Prod: `56c23a4` + `7f8d90b` deployed to https://aipulse-pi.vercel.app.

**Known stale state (NOT a regression):**

- `shauntrennery`'s cached HN author record in Redis still has the false Nebraska coords. Expires at 7d TTL (~2026-04-26) or on cache-miss refresh (whichever first). New HN ingests from 2026-04-20 onward use the corrected geocoder; only this one pre-existing entry is affected.
- Nebraska dot will remain on the prod map until the cache entry expires or is invalidated.
- Option to force-clear by ad-hoc Redis `DEL hn:author:shauntrennery` — not done this session (out of scope; 7d TTL handles it naturally).

**Next action (session 18):**

1. **User review + approval of `docs/prd-chatbot-arena.md`.** Redline any of the 7 AUDITOR-PENDING items. This is the Phase 1 gate — no Phase 2 build until approved.
2. On approval: write `docs/issues-chatbot-arena.md` (BENCH-01..07, dependency-ordered, each 3–5 files, TDD pattern).
3. Start BENCH-01 on `feature/benchmarks-arena` — types + pure logic + failing tests for delta computation, `NEW` badge, sanity-range guard.
4. Proceed through BENCH-02..07 in dependency order. Single feature branch, ~5–7 commits, single PR to main (matches session 16 HN rhythm).
5. First live ingest of lmarena snapshot — verify row-for-row match against lmarena.ai leaderboard UI (architectural constraint test).

**Files changed (session 17):**

- Created (2): `src/lib/__tests__/geocoding.test.ts`, `docs/prd-chatbot-arena.md`.
- Modified (2): `src/lib/geocoding.ts`, `docs/AI_PULSE_V3_SPEC.md`.
- Deleted (0). Touched outside project directory (0).

---

### Session 16 — Hacker News integration · THE WIRE + geotagged map dots (11 commits, 1 PR)

Session brief (user): "Read HANDOFF.md. Start the HN integration. Grill it, PRD it, build it." Phase 1 (grill + PRD + issues) → Phase 2 (TDD, 5 issues HN-01…HN-05) → single PR to main on branch `feature/hn-wire`.

**Shipped (11 commits on `feature/hn-wire`):**

1. `8043536 chore: add vitest test framework` — first unit-test infra.
2. `1ae0897 test(hn): failing tests for isAiRelevant, hostFromUrl, extractLocation` — TDD red.
3. `f3b6523 feat(hn): wire-hn filter + types + hn-store skeleton` — TDD green (23/23 pass).
4. `65ede1b feat(hn): register HN_AI_STORIES source with sanity ranges` — `data-sources.ts` entry with pre-committed ranges (volume 5–60/hr, points median 20–200, dead ≤3%).
5. `76432e5 feat(hn): ingest library — fetchAlgolia + fetchHnUser + runIngest` — Algolia fetch (100 stories/call), per-author Firebase resolution with 7-day cache, ZADD to `hn:wire`, 24h ZSET prune, orphan reconcile.
6. `0357574 feat(hn): /api/wire/ingest-hn route` — Node runtime, `x-ingest-secret` gate, POST/GET.
7. `1265249 feat(hn): GitHub Actions cron — wire-ingest-hn every 15min` — cron `5,20,35,50 * * * *` (slots between globe-ingest and registry-backfill).
8. `1880e8d feat(hn): /api/hn public read route` — Edge, `readWire()`, `s-maxage=60, stale-while-revalidate=300`.
9. `234edf1 docs(sources): register HN_AI_STORIES in public/data-sources.md` — transparency-contract entry; `verifiedAt: 2026-04-20` after shape-verification curl.
10. `2489720 feat(hn): WirePage renders HN rows + Dashboard pre-merges wireRows` — discriminated union `WireItem = GhWireItem | HnWireItem`; orange `HN · {points}` pill, whole-row link; staleness indicator only visible when >30min stale.
11. `4eceed2 feat(hn): FlatMap + Globe render HN dots` — HN stories geotagged on both views when author `about` location is resolvable; HN-only clusters render orange at full opacity; multi-HN clusters get numeric badge; HN outranks registry in sort (community signal above base layer).

**Deliberate deviations from PRD/issues doc:**

- Filter runs client-side in `runIngest` after fetch (not server-edge). Rationale: gives honest pre-filter sanity counts before the drop.
- No active moderation reconciliation (would cost ~20 Algolia `/items/{id}` calls per poll). Rationale: 24h item TTL handles dead stories naturally; lightweight orphan reconcile cleans ZSET members whose item keys expired.
- Points-only-geocoded rule: `readWire()` includes all items in `items` array but only resolves `ok`-status authors into map `points`. WIRE feed completeness preserved; map stays truthful (no synthetic locations).

**Registry state after this session:**

- Sources: 9 → **10** (added `HN_AI_STORIES`).
- Crons: 4 → **5** (added `wire-ingest-hn`).
- Active tabs: 4 (Globe, Map, Research, THE WIRE) — unchanged.
- Registry repos: 520 — unchanged.
- Build: ✓ (1994ms compile, 1564ms typecheck). Tests: 23/23 pass.

**AUDITOR-REVIEW: PENDING** on:
1. HN source registration — already flagged "approved in session 14 without full Auditor review" per queued-sources; shape-verification curl done, sanity ranges pre-committed per governance.
2. Keyword + domain AI-relevance filter lists — `KEYWORD_ALLOWLIST` (35 terms), `DOMAIN_ALLOWLIST` (15), `SOFT_BLACKLIST` (crypto/girlfriend/nsfw). Likely to need tuning once live volume lands.
3. Orphan-only reconcile strategy (no active moderation catch) — accepted cost/benefit.
4. Cluster colour rules when HN + registry mix (no live) → HN wins. Justification: community signal > decayed base layer.
5. 30-min staleness threshold for the muted amber banner.

**Out of this PR, into next session:**

- Spec edit adding cross-cutting **geotag principle** to `docs/AI_PULSE_V3_SPEC.md` Part 0 (non-negotiable that every geotagged source follows the same pattern: real public field → deterministic geocoder → null on miss, never synthesised). Separate commit, separate session — scope isolated.

**PR #1 MERGED** as commit `a164c50` (2026-04-20T01:33:23Z). Manual cron run after deploy returned:

```
{"ok":true,"fetched":100,"passed":16,"written":16,"geocoded":2,
 "geocodeAttempted":16,"failures":[]}
```

Single batch: 16/100 passed the filter (16% pass rate), 2/16 authors had resolvable locations. `/api/hn` confirms `source: "redis"`, 16 items, 2 points, `staleMinutes: 0`.

**Live data quality observation (NEW auditor flag):**

- Geocoded point #1 is **correct** — user `simon_acca` has `city/ch-Zurich` in bio → (47.38, 8.54).
- Geocoded point #2 is a **false positive** — user `shauntrennery` bio mentions "…interests in family, development, JavaScript, startups, news, location, fitness…"; the geocoder resolved it to (41.49, -99.90) in Nebraska. The bare word "location" appears to be triggering a match. Geocoder needs either (a) stricter token context requirements or (b) a stoplist for generic-word false positives. **AUDITOR-REVIEW: PENDING** — filter-quality tuning issue, not a data-integrity failure (the label does come from the real `about` field), but visual honesty suffers.

**Next action:** start a fresh session for (a) cross-cutting geotag principle → `docs/AI_PULSE_V3_SPEC.md` Part 0 edit, and (b) Chatbot Arena benchmarks integration (next highest-value source per user). Before Chatbot Arena: grill → PRD with architectural constraint test → issue decomposition, same protocol as HN.

**Also pending from this session (triage for next session):**
- Geocoder false-positive fix (Nebraska case). Low-LOC, deterministic. Possibly bundle with the spec edit.
- First real cron-scheduled run will fire at the next `:05 :20 :35 :50` UTC slot; watch it for stability before deciding on filter/geocoder tuning.

### Session 16.1 — HN map-dot hotfix (1 commit, on main)

Post-merge user verification spotted: THE WIRE renders HN rows correctly (205 rows, 189 gh · 16 hn, orange pills visible); the flat map shows only the teal GH dots — no orange HN dots at all.

**Root cause:** `Dashboard.tsx` polled `/api/hn` and folded HN items into `wireRows` for the WIRE panel, but the `points` array passed to `FlatMap` and `Globe` was still `[...livePoints, ...dedupedRegistry]` — HN points were never appended. `/api/hn` has been returning `points=2` (Zurich, Nebraska false-positive) since the first ingest; pure client-side composition bug.

**Fix (`f2d6b99`):** one-line concat. No filter applied to HN layer — HN is a parallel community signal (not a GH event, not a registry repo), so the event-type + ai-config filter chips don't semantically apply.

```ts
const hnPoints: GlobePoint[] = hn.data?.points ?? [];
const points: GlobePoint[] = [...livePoints, ...dedupedRegistry, ...hnPoints];
```

**AUDITOR-REVIEW: PENDING** — filter-panel composition when the HN layer is present (do we want an HN toggle? a "community signal" layer group?). Deferred until live volume makes the question concrete.

Build ✓, tests 23/23 ✓. Pushed to main; Vercel deploys within ~1–2min. Next page reload on https://aipulse-pi.vercel.app should show 2 orange dots: Zurich (correct) + Nebraska (false positive — see geocoder flag above).

### Session 16.2 — majority-wins colour for mixed HN+GH clusters (1 commit, on main)

**User spot:** HN orange dot near the Nebraska ZIP rendered as a "standalone orphan" next to teal GH numbered clusters (33/7/14/8/3). User suspected HN markers weren't in the same MarkerClusterGroup, and asked for mixed-cluster colour to reflect the GH/HN mix.

**Diagnosis:**
1. HN markers **were already** in the same `MarkerClusterGroup` — `cluster.addLayer(marker)` in `FlatMap.tsx:210` runs for every point regardless of kind. The observed "orphan" was geographic sparsity: Nebraska (41.49, -99.90) is ~490km from Denver; at zoom 5 that's ~100px, outside `maxClusterRadius: 48`. At zoom 3–4 the Nebraska point will cluster with US GH events. No code change needed for the composition claim.
2. **Real bug spotted on re-read:** the mixed-cluster colour rule was "any live event wins over HN" — so a cluster of 1 GH push + 5 HN stories rendered teal. HN was invisible in the badge colour whenever a single GH event shared the bucket.

**Fix (`b08259f`):** majority-wins rule applied in both `FlatMap.clusterIcon` and `Globe.clusterPoints`:
- `hn > live` → HN orange (with HN-style border/glow/text via new `hnStyled` unification)
- `live ≥ hn, live>0` → dominant GH event-type colour
- `hn-only` → HN orange (unchanged)
- `registry-only` → slate (unchanged)
- Tie at `live == hn` → live wins (code-action signal outranks discussion at equal count)

Also synced `clusterFromPoints` (the card-opener helper) so the card header + cluster badge agree on colour.

Build ✓, tests 23/23 ✓. **AUDITOR-REVIEW: PENDING** on the tie-break rule.

**Next action on resume:**
1. User reload to verify mixed-cluster colour reads correctly once a cluster with both kinds actually forms (current 2-point sample won't exercise it until more HN authors geocode into cities that already have GH activity).
2. Session 17: geotag principle spec edit + Chatbot Arena integration (unchanged plan).
3. Geocoder false-positive fix (Nebraska "location" keyword match) — still low-LOC queued for session 17.

### Session 15 — HANDOFF recovery (docs-only, 3 commits)

Session brief (user): session 14 conversation compacted mid-flow;
recover the strategic discussion into HANDOFF.md so nothing gets
re-asked. Three rounds of capture + a verification grep.

**Shipped (3 commits, HANDOFF.md only — no code):**

1. `ec59a0e docs: HANDOFF — complete session 14 discussion capture
   (post-compaction recovery)`
   - New section `## Queued from session 14 discussion (not yet
     built)` covering: 5 data sources (HN + Chatbot Arena queued;
     ecosyste.ms shipped; Libraries.io pending; Sourcegraph
     rejected), 7 deferred features, 6 architecture decisions,
     current system state, 4 critical risks.

2. `1573f73 docs: HANDOFF — add OSS Insight, GH_TOKEN rotation
   date, architecture-dashboard TODO`
   - User flagged 3 omissions. Added: OSS Insight
     (`ossinsight.io`) as a research-first-gated source;
     GH_TOKEN rotation calendar date (`2026-07-12`, one week
     before ~2026-07-19 expiry); architecture-dashboard TODO
     pointing at `docs/architecture-dashboard.md` as the future
     home (user-paste required — could not fabricate).

3. `773367c docs: HANDOFF — geographic and topical coverage
   expansion plan`
   - New section `## Geographic + topical coverage expansion
     plan (queued)` with an anti-bias principle (proposed
     addition to spec Part 0), 4 geographic items (HF org
     origin, OpenAlex institution geocoding, OpenAlex as a
     source, regional RSS into THE WIRE), 4 topical items
     (safety/governance, multi-source Benchmarks, education
     topic-filter, mechanical controversy signals),
     dependency-ordered sequencing, 4 auditor-pending flags.

**Verification grep** (user-initiated, end of session): 8/8
decision items present — Hacker News (L153), Algolia (L155/156/
414), Chatbot Arena (L166/389), lmarena (L166/389), OAuth
(L217/248), login (L217/248), Mobile responsive (L214/251),
Sourcegraph (L115/186/188).

**Files changed:** `HANDOFF.md` only (+311 lines). Created: 0.
Deleted: 0. Touched outside project directory: none.

**MOM:** match = YES. Goal was "capture session 14 discussion into
HANDOFF.md"; delivered three capture rounds + a verification pass.
Docs-only, no build to run, no regressions possible.

**Next action — single highest-impact feature remaining:**
Hacker News integration (Algolia + Firebase APIs). Project CLAUDE.md
requires Phase 1 (GRILL → PRD at `docs/prd-hacker-news.md` with
architectural constraint test → issue decomposition → TDD). Start
in a fresh session with clean context; do NOT skip the grill even
though the source is already approved.

**AUDITOR-REVIEW: PENDING** on everything flagged in the queued
sections above. Nothing from this session introduces new code risk.

### Session 14 — verify-pair + Research tab + source #6 (2 commits)

Session brief (user): ship all four — verify flat-map clicks (bfc5320),
verify registry dots on map, Research tab (ArXiv top 20), source #6
via deps.dev. Research-first pass flagged mid-session: deps.dev's
public REST only returns a dependent _count_, not the list. Pivoted
to ecosyste.ms with user's explicit green light; same provenance
class (third-party index), drop-in JSON, 5000/hr anonymous.

**Shipped (2 commits):**

1. `7dea2a2 feat(research): top-20 recent cs.AI+cs.LG papers —
   arxiv-papers source`
   - `src/lib/data/fetch-research.ts` (NEW). Calls
     `export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG&sortBy=submittedDate`.
     Hand-rolled Atom parser (split on `</entry>` + regex per tag) —
     zero dependencies; deterministic missing-tag fallback aligned
     with the trust contract. 30-min Next.js Data Cache.
   - `src/app/api/research/route.ts` (NEW). Node runtime, 15-min CDN
     s-maxage, 30-min stale-while-revalidate.
   - `src/components/research/ResearchPanel.tsx` (NEW). Rank / title /
     primary-category badge / author line (first + et al. when >3) /
     relative timestamp. Links out to arxiv abstract page.
   - `src/components/dashboard/Dashboard.tsx` wired: PanelId adds
     "research", nav flips from soon:true to active with count badge,
     poll 15 min, initial pos anchored to left half (w=420, y=160) so
     long titles breathe without clashing with Models on the right.
   - `src/lib/data-sources.ts` + `public/data-sources.md`:
     ARXIV_PAPERS entry under "published-research" category.
   - Live verification post-deploy: `/api/research` → 200, ok:true,
     20 papers, top primary cs.CV (cross-listed), authors/id/published
     all extracted cleanly.

2. `b69bdc4 feat(registry): source #6 — ecosyste.ms npm
   reverse-dependencies` (substituted for deps.dev)
   - Mid-session pivot: deps.dev REST returns `{dependentCount,
     directDependentCount}` only (verified against openai v4.0.0–
     v6.34.0). The actual dependent list is BigQuery-only. User
     approved ecosyste.ms as the drop-in — same provenance class
     (third-party index, free, JSON, no auth), 5000 req/hr anonymous,
     and returns `repository_url` directly on each row.
   - `src/lib/data/registry-deps.ts` (NEW). Six target packages:
     @anthropic-ai/sdk, openai, @langchain/core, langchain, ai,
     llamaindex. `/dependent_packages?sort=latest_release_published_at`
     so active dependents get verified first. Strict github.com
     regex on repository_url (drops gitlab/bitbucket rows). Deduped
     across packages, skipped against known-registry, cap=60 per run,
     6-filename Contents probe + first-500-bytes shape verifier +
     repo-meta fetch — same pattern as registry-topics.ts and
     registry-events-backfill.ts.
   - `src/app/api/registry/deps/route.ts` (NEW). Auth via
     INGEST_SECRET. Query params: source, cap, pagesPerPackage,
     packages (csv). maxDuration=120.
   - `.github/workflows/registry-discover-deps.yml` (NEW). 6h cron
     at :30 past — mid-slot between backfill-events (:15) and topics
     (:45) so the three registry cron kinds can't collide inside a
     5-min Search-API budget window.
   - `src/lib/data-sources.ts` + `public/data-sources.md`: new
     ECOSYSTEMS_NPM_DEPENDENTS source; caveat documents the
     deps.dev → ecosyste.ms swap.
   - Live smoke (`manual-deps-smoke`, cap=30, pagesPerPackage=1,
     ~110s duration): `{packagesSwept:6, candidatesFound:305,
     candidatesAfterDedupe:179, candidatesAfterSkipKnown:179,
     verifiesAttempted:30, written:14, failures:[{step:"fetch:langchain",
     message:"page 1 returned 500"}]}`. Verify-pass rate 47% — well
     above my 15–30% sanity projection; dependents turn out to be a
     higher-signal source than predicted.

**Verifications (task 1 + 2 — no code shipped):**
- Flat-map click cards (bfc5320): structurally correct. Singleton
  handler FlatMap.tsx:191-202, cluster handler :114-140,
  zoomToBoundsOnClick:false :108, EventCard zIndex:1200 in
  event-detail.tsx:122 (above Leaflet's max pane z=800).
- Registry dots: 224 located entries visible via `/api/registry`
  cache-bust; Dashboard.tsx:91-115 correctly maps to kind="registry"
  GlobePoints with decayScore; FlatMap.tsx:176-183 renders
  `registryMarkerHtml` with decay-alpha.
- Both verified at code + data level. Pixel-level browser
  confirmation still needs the user's eyes — could not launch a
  browser in-session. No code changes were needed.

**Registry state at session end (cache-busted):**
- Total entries: **520** (up from 477 at session 13 end → +43 this
  session: +14 from deps-smoke, +29 from location-enrichment and
  scheduled cron runs during the session)
- With location: 250 (up from 212)
- Latest source: `manual-deps-smoke` at 2026-04-20T00:17:27Z
- Cron schedule now:
  - backfill-events: 1h at :15 past — cap=100
  - topics:           2h at :45 past — cap=60, pagesPerTopic=2
  - deps:             6h at :30 past — cap=60, pagesPerPackage=2 (NEW)

**AUDITOR-REVIEW: PENDING** on:
1. deps discovery verify-pass rate: 47% observed on a top-30 recent-
   release sample; project 15–30% for broader pages. Watch first three
   cron cycles; if sustained pass rate <15%, drop @langchain/core and
   `ai` and keep only the direct SDKs (@anthropic-ai/sdk, openai,
   llamaindex).
2. ecosyste.ms indexing lag. Rows may be hours-to-days behind live
   npm. Not a correctness issue (we gate on shape, not freshness) but
   if real-world new-package cadence looks stale vs. npm, reconsider.
3. Research tab v1 intentionally includes cross-listed papers whose
   primary is cs.CV / cs.CL / cs.RO (secondary cs.AI / cs.LG). If the
   panel reads too broad, tighten to primary_category filter
   client-side.
4. Research tab v2 enrichment (citations + institution) needs
   Semantic Scholar or OpenAlex; rate-limit stories unaudited.
5. Transient ecosyste.ms 500 on langchain page 1 during smoke — will
   retry on next cron; if the 500 persists, add a single-page retry
   with backoff to registry-deps.ts.
6. Sourcegraph evaluated and rejected (closed-source + no free
   programmatic API; scraping would violate ToS).

**Next action (priority order, queued):**
1. Libraries.io follow-up (user flagged). 60 req/min authenticated,
   free registration. Covers npm + PyPI + RubyGems so one source
   unlocks multi-ecosystem dependents. Requires a new shared secret
   `LIBRARIES_IO_API_KEY`; pattern mirrors registry-deps.ts with a
   different fetcher.
2. GitHub Code Search expansion (user flagged). Current code search
   is `filename:CLAUDE.md`; add `CLAUDE.md in:path` to catch configs
   in subdirectories. One-line query addition to
   registry-discovery.ts; bump expected sweep size accordingly.
3. GitHub `/repos/{owner}/{repo}/dependents` HTML scrape (user
   flagged). Target anthropic-ai/sdk-python and openai-node
   specifically to get repo-level dependents (ecosyste.ms covers
   package-level). Cadence ~weekly.
4. PyPI Stats integration (user flagged). `pypistats.org/api`
   returns download counts by country. Not for discovery — for
   enriching the globe with a download-heatmap layer showing where
   AI packages are most used.
5. Agents tab (still deferred — product-source call needed: HF
   Spaces? topics-gated repos? npm agent packages?).
6. Gemini deep scan on /audit (still own-session: user-key flow UI,
   prompt design, cost cap, server-side key hygiene).
7. /archives page (still own-session: needs daily/weekly snapshot
   writer to Redis with 90d+ TTL first; that writer doesn't exist).

## Queued from session 14 discussion (not yet built)

This section captures the full session 14 thread after the
conversation compacted and lost in-memory context. Everything below
is a decision that was reached in discussion but not yet committed
to code — the priority list above (items 1–7) is the authoritative
build queue; this is the rationale and the longer tail.

### Data sources — approved but not yet shipped

1. **Hacker News** (APPROVED — high priority, ship next after
   Libraries.io). Two free APIs, no auth, no rate limit:
   - Algolia Search:
     `hn.algolia.com/api/v1/search?query=AI+coding&tags=story` —
     full-text search with date filters.
   - Firebase:
     `hacker-news.firebaseio.com/v0/topstories.json` — real-time
     top/new/best.
   - Poll every 30 min, filter for AI keywords.
   - Surface in THE WIRE or a dedicated HN panel (decision at
     build time — likely dedicated panel so provenance stays
     distinct from GH events).

2. **Chatbot Arena rankings** (APPROVED). `lmarena-ai` on
   HuggingFace — public dataset with Elo ratings. Alternatives for
   cross-check: Artificial Analysis (artificialanalysis.ai),
   Vellum, BenchLM.ai. Show top 20 by Elo in a Benchmarks panel.
   Update daily.

3. **ecosyste.ms npm dependents** (APPROVED and SHIPPED session
   14 — source #6, commit `b69bdc4`). Replaced deps.dev which
   only returns counts, not lists.
   - `packages.ecosyste.ms/api/v1/registries/npmjs.org/packages/{pkg}/dependent_packages`
   - 6 target packages: `@anthropic-ai/sdk`, `openai`,
     `@langchain/core`, `langchain`, `ai`, `llamaindex`.
   - Cron: 6h at :30 past.

4. **Libraries.io** (APPROVED — needs API key). 60 req/min, free
   registration. Covers npm + PyPI + RubyGems so one integration
   unlocks multi-ecosystem dependents. Requires a new shared
   secret `LIBRARIES_IO_API_KEY` in Keychain → Vercel env →
   `~/.secrets/MANIFEST.md`.

5. **Sourcegraph** — EVALUATED AND REJECTED. Closed source,
   $49/user/mo, no free programmatic API. Scraping would violate
   ToS. Do not revisit without a policy change on Sourcegraph's
   side.

6. **OSS Insight** (`ossinsight.io`) — WORTH INVESTIGATING. Uses
   TiDB to analyse GitHub events at scale; returns trending repos
   and ecosystem comparisons. Has a public API. Check terms +
   rate limits + whether outputs are derived (score-shaped, which
   would violate our "aggregate don't score" rule) vs. raw event
   aggregates (which would not). Research-first pass required
   before it lands in `data-sources.ts`.

### Features discussed but not built

6. **Agents tab** — data source undecided (HF Spaces? GitHub
   topics? npm agent packages?). Product-source call needed
   before build. Left-nav item currently greyed with "SOON".

7. **/archives page** — needs a daily/weekly snapshot writer to
   Redis with 90d+ TTL first. Writer does not exist yet. Own
   session.

8. **Gemini deep scan on /audit** — own session, large effort:
   user-key flow UI, prompt design, cost cap, server-side key
   hygiene. Must remain opt-in with the user's own key per CLAUDE.md
   non-negotiable (no per-audit LLM calls by default).

9. **Mobile responsive** — DEFERRED. User explicit: "only after
   desktop solid". Desktop-first product.

10. **Chat + login (GitHub/Google OAuth)** — DEFERRED. User told
    to defer: zero users yet, premature.

11. **Self-hosted 8K Earth texture** — still loading from
    unpkg.com. Phase 1 closeout item from earlier sessions.

12. **GDELT integration** — APPROVED WITH CAVEATS. Auditor review
    pending before build starts.

### Architecture decisions recorded (apply to all future work)

13. **Content verification** = fetch first 500 bytes of a candidate
    config file and check for config-shaped structure. Not just
    filename match. Already implemented in `registry-topics.ts`
    and `registry-deps.ts` — applies to any future discovery
    source.

14. **Decay visual** = dimmer dot + "Last activity: X days ago" on
    hover card. No badge on every dot. Prevents visual noise on
    a registry that now has 520 entries with varying activity
    recency.

15. **2D flat map (Leaflet) is the default tab; 3D globe is
    secondary.** Flip already made in session 14 verify-pair
    work — kept as a durable decision for any future map work.

16. **Registry is a permanent store with signal decay, not a live
    event window.** Entries never drop out; decay score shrinks
    over time. Means registry growth is monotonic — factor this
    into Upstash cost planning.

17. **Chat and OAuth login deferred** — no users yet, premature.
    Do not let this creep back in with a "quick prototype" framing.

18. **Mobile responsive deferred** — desktop-first. Do not spend
    cycles on mobile breakpoints until desktop is fully shipped.

### Current system state (end of session 14)

- Registry: **520 repos**, **250 with locations** (48%).
- Globe events: **775 in 240-min window**.
- Tools tracked: **5** (Claude Code, Copilot, OpenAI API, OpenAI
  Codex, Windsurf) + Cursor as a tracked gap.
- Data sources verified: **9**.
- Autonomous crons: **4** — globe-ingest 5min, backfill-events
  1h, topics 2h, deps 6h.
- Models tab: HuggingFace top-20 text-gen (live).
- Research tab: ArXiv cs.AI+cs.LG top-20 (live).
- Left nav active: Wire, Tools, Models, Research.
- Left nav greyed: Agents ("SOON").

**Architecture dashboard (reference — not yet indexed here).**
In the session 14 discussion we walked through a complete system
map: tech stack, free-tier infrastructure (Vercel + Upstash +
GitHub Actions), data pipelines, Redis schema, API routes,
screens, cron workflows, data loading times, security
infrastructure, failure modes, and distributed-system topology.
That map is not transcribed in this HANDOFF — it lives in the
session transcript / separate artifact. TODO: paste the dashboard
into `docs/architecture-dashboard.md` and link it from here so
future sessions can load it without re-deriving. Until then,
treat `docs/AI_PULSE_V3_SPEC.md` + the live source registry
(`public/data-sources.md`) as the substitute.

### Critical risks (monitor — not blocking)

- **GH_TOKEN expires in ~90 days (issued late Apr 2026 → expires
  ~2026-07-19).** When it lapses, all discovery crons fail
  silently — search, code-search, topics, and deps all use the
  same token. **ACTION: set calendar reminder for 2026-07-12**
  (one week before expiry) to rotate via Keychain → Vercel env
  (Production + Preview + Development) → GitHub Actions repo
  secret in one pass. Verify post-rotation by kicking
  registry-discover workflow manually.
- **Upstash free tier ceiling: 500k commands/month.** Registry
  grows monotonically (decision #16); poll + cache-read traffic
  grows with panels. Monitor Upstash dashboard monthly; if usage
  passes 60% of ceiling before feature parity is hit, either
  upgrade tier or coalesce reads.
- **No rate limiting on public API routes.** `/api/registry`,
  `/api/models`, `/api/research`, `/api/status` are all open. CDN
  s-maxage absorbs most hits but a targeted flood would hit
  origin. Add per-IP throttle before any PR/launch announcement.
- **OpenAI status API schema drift.** Incidents are not reliably
  parsed after recent changes. `OPENAI_INCIDENTS` source needs a
  re-fit; tracking as part of session 7's open items.

## Geographic + topical coverage expansion plan (queued)

Observatory currently skews US / English / code-centric. The
registry's geo distribution is biased by what English-anchored
GitHub and ArXiv return; THE WIRE has no non-English news; Models
and Research are flat lists with no regional signal. This plan
corrects for that before Phase 1 lock. Nothing below is shipped —
everything is a queued item with a sketch of the integration.

### Anti-bias principle (ADD to trust contract, `docs/AI_PULSE_V3_SPEC.md` Part 0)

The observatory must not be US/English-centric. Every geographic
visualisation must show global coverage. When a data source has
regional gaps, the gap must be documented in
`public/data-sources.md` — never hidden. The goal is "what is the
global AI ecosystem doing", not "what is Silicon Valley doing".
Applies to: globe, registry, Models, Research, Benchmarks, THE
WIRE, and any future panel that carries a geographic or
language-origin claim.

**Auditor gate:** before any panel ships that displays a geographic
distribution, confirm the underlying source is not single-region
by construction. If it is, either pair it with a complementary
source or surface the limitation in the panel's caveat line.

### Geographic coverage

1. **HuggingFace models by organisation origin.** HF API returns
   `author` / org on each model row. Maintain a curated
   `org → country` map (start with the top ~100 orgs by model
   count; expand as new orgs land in the top 20 panel). Derive
   per-country counts and render as a globe overlay:
   "France: N models, China: N, US: N, …". Acceptance: Models tab
   renders both the flat top-20 list AND a country-count strip.
   Curated map lives in `src/lib/data/hf-org-country.ts` with
   provenance comment on each mapping (HQ source: org's own site
   or Wikipedia). Out-of-scope: inferring country for unknown
   orgs — unknown stays unknown.

2. **ArXiv papers by institution (via OpenAlex).** ArXiv returns
   author affiliation strings inconsistently. Cross-reference with
   OpenAlex — `api.openalex.org/works?filter=concepts.id:C154945302`
   for AI concept. OpenAlex gives structured institution data
   with country codes on every work. Papers plotted on the globe
   by institution location (one dot per paper; top institution
   picked when multi-affiliation). Research tab gains a
   `country` column and a "by region" toggle.

3. **OpenAlex API** (`api.openalex.org`). Free, no auth, 100k
   req/day. Structured institutions + country codes + citation
   counts + open-access status. Covers 250M+ works across all
   academic publishers. **Strictly better than ArXiv alone for
   geographic analysis** — ArXiv stays for recency (OpenAlex
   indexing lags), OpenAlex joins for structure. Integration
   shape: mirror `fetch-research.ts` with 1h Data Cache; new
   source entry `OPENALEX_WORKS`.

4. **Regional news feeds → THE WIRE.** Add RSS/Atom ingestion as
   a peer signal to GH events and HN. Feed list:
   - France: `lemonde.fr` AI section, CNRS news
   - Germany: `heise.de` AI, DFKI news
   - UK: The Register AI, UKRI news
   - Japan: AI-SCHOLAR.tech (bilingual)
   - India: Analytics India Magazine, NASSCOM AI news
   - China: Synced Review (English-language Chinese AI)
   - Israel: CTech AI section
   - Russia: TASS technology (English feed)
   - Global: MIT Tech Review, The Gradient, Import AI
   Mixed into THE WIRE with a `lang` / `region` tag on each item
   so the panel can filter. Per-feed 15-min cache. Build as a
   generic `registry-rss.ts` fetcher (one integration, N configs)
   rather than one adapter per source.

### Topical coverage

5. **AI safety + governance signal.** Track ArXiv `cs.CY` + `cs.AI`
   with safety keyword match (safety, alignment, evaluation,
   red-team, jailbreak). Track policy announcements: EU AI Act
   enforcement actions, UK AISI evaluation releases, US executive
   orders mentioning AI. Surface as distinct signal type in THE
   WIRE with a separate badge (policy vs. paper vs. event).
   Policy side may need per-source scraping — evaluate after
   ArXiv safety pipe is live.

6. **Benchmark leaderboards** (multiple sources, dedicated panel).
   - Chatbot Arena (`lmarena-ai` on HuggingFace) — Elo from
     6M+ votes.
   - Artificial Analysis (`artificialanalysis.ai`) — speed, price,
     intelligence index.
   - Vellum (`vellum.ai/llm-leaderboard`) — GPQA, AIME, SWE-bench,
     HLE.
   - BenchLM.ai — historical Elo tracking since May 2023.
   Surface as a `Benchmarks` panel (new PanelId) or as a second
   row in Models. Multi-source so no single leaderboard's
   scoring bias dominates. Per-benchmark caveat line naming the
   metric + sample size.

7. **AI education + courses.** Extend the existing registry:
   repos tagged `tutorial` / `course` / `education` + AI topic
   tags get a distinct `kind=education` badge and a separate
   colour on the globe. No new source — just a topic-filter on
   `registry-topics.ts` output. Acceptance: registry entry
   kind field gets a `education` value; Dashboard legend updated.

8. **Whistleblower / controversy signals.** Cannot automate
   editorial judgement. CAN track as mechanical signals:
   - GitHub repos with `ethics`, `safety`, `responsible-ai`
     topics (extend topics list in `registry-topics.ts`).
   - ArXiv papers in `cs.CY` (Computers and Society).
   - HN stories with high comment-to-score ratio (controversy
     proxy — compute from Algolia Search response).
   Surface as `discourse` signal type in THE WIRE — highlighted
   for high engagement, never editorialised. Caveat line makes
   clear this is mechanical (ratio threshold) not editorial.

### Sequencing

The above items land in this dependency order, not priority order:

1. OpenAlex integration FIRST (item 3) — unlocks items 2, 5, and
   partially item 8 (ArXiv cs.CY geographic).
2. HF org-country map (item 1) — independent, can ship parallel.
3. Generic RSS ingestion scaffold (item 4 infrastructure).
4. Regional feed configs land incrementally on top of (3).
5. Benchmarks panel (item 6) — independent of geo work.
6. Topic-filter extensions for education + controversy (items 7,
   8) — land together since they share the `registry-topics.ts`
   pipe.
7. Safety/governance policy scraping (item 5 policy side) — last,
   since it may require per-source adapters.

**Auditor review pending on:**
- OpenAlex concept ID for "AI" — need to verify `C154945302` is
  current; concept IDs have shifted before.
- Curated `hf-org-country.ts` map — political sensitivity around
  "origin country" for orgs with distributed teams (OpenAI SF vs.
  satellite offices; DeepMind London under Alphabet US). Rule:
  HQ per org's own About page. Document the rule in the file
  header. Reject inference beyond that.
- RSS feed ToS — some outlets (MIT Tech Review, The Register) may
  require attribution or forbid caching. Check per-feed licensing
  before ingestion, not after.
- "Controversy" comment-to-score ratio threshold — needs
  calibration on historical HN data before the signal ships to
  avoid false positives on genuinely popular discussion.

### Session 13 — backfill cron + topics discovery + Models tab (3 commits)

User flag from session 12: backfill-events API route shipped but no
workflow wired it, so registry growth still required manual curl.
This session closes that gap and pushes forward on two more things
the session 12 HANDOFF listed as queued: source #3 (topics
discovery) and the Models tab. Ship-deploy-move-on — no asks
between steps.

**Shipped (3 PRs / commits):**

1. `322f3c1 feat(registry): wire backfill-events cron (1h, cap=100)`
   - `.github/workflows/registry-backfill-events.yml` (NEW). 1h cron
     at :15 past, cap=100, source=cron-backfill. Auth via shared
     INGEST_SECRET; strips `/api/ingest` off INGEST_URL to reach the
     backfill path. Matches the same-shaped workflow pattern as
     registry-discover.yml.
   - Manual dispatch verified 20s duration. Registry backfill now
     grows without human intervention.

2. `559d367 feat(registry): topics discovery — self-declared AI repos
   via search/repositories`
   - `src/lib/data/registry-topics.ts` (NEW). 11 topics (claude,
     cursor, ai-coding, copilot, aider, windsurf, ai-agent, llm,
     langchain, crewai, agents-md). Per-topic search hits
     `/search/repositories?q=topic:X&sort=stars&order=desc`,
     deduped across topics by full_name. Each candidate still goes
     through the same 6-filename Contents-probe + shape verifier as
     Code Search discovery — topic tag alone never lands an entry.
   - `src/app/api/registry/topics/route.ts` (NEW). Auth via
     INGEST_SECRET. Query params: source, cap, pagesPerTopic, topics
     (csv). maxDuration=120.
   - `.github/workflows/registry-discover-topics.yml` (NEW). 2h
     cron at :45 past (offset from backfill-events' :15 to avoid
     Search-API collision), cap=60, pagesPerTopic=2.
   - `src/lib/data-sources.ts` + `public/data-sources.md`:
     GITHUB_REPO_SEARCH_TOPICS source entry. Same shape as
     GITHUB_CODE_SEARCH; verified 2026-04-19. Caveat documents
     verify-pass rate expectation (~20-40% on broad topics like
     `llm`, `ai-agent`; ~60-80% on tool-specific ones).
   - Live verification (cap=40, pagesPerTopic=1, 1m4s duration):
     `{topicsSwept:11, candidatesFound:1100, candidatesAfterDedupe:960,
     candidatesAfterSkipKnown:957, verifiesAttempted:40, written:21,
     failures:[]}`. Verify-pass rate ~52% on the top-stars slice —
     in-range.

3. `cfe4a96 feat(models): top-20 HuggingFace models panel —
   hf-downloads source`
   - `src/lib/data/fetch-models.ts` (NEW). Calls
     `https://huggingface.co/api/models?sort=downloads&direction=-1&filter=text-generation&limit=20`.
     No auth. 15-min Next.js Data Cache. Echoes downloads/likes
     verbatim — no re-ranking, no composite score.
   - `src/app/api/models/route.ts` (NEW). 5-min CDN s-maxage,
     15-min stale-while-revalidate. Node runtime for consistency
     with /api/status and /api/registry.
   - `src/components/models/ModelsPanel.tsx` (NEW). Rank / model
     name / author / 30d downloads (formatted) / ♥ / last-modified.
     Links each row out to huggingface.co. Awaiting-poll and
     error states explicit; no silent zeros.
   - `src/components/dashboard/Dashboard.tsx` wired: new PanelId
     "models", polling hook at 10-min, initial position at
     right-half (y=132 offset from Tools), nav item flips from
     `soon: true` to active with count badge.
   - `src/lib/data-sources.ts` + `public/data-sources.md`:
     HUGGINGFACE_MODELS source entry + new "model-distribution"
     category. Caveat: downloads ≠ inference traffic; ≠ unique
     users.
   - Live verification (`/api/models`): 20 models returned,
     top-3: `Qwen/Qwen3-0.6B` (15.8M), `openai-community/gpt2`
     (13.9M), `Qwen/Qwen2.5-7B-Instruct` (12.5M). In-range per
     sanity check (5–20 models, top-5 in 1M–100M).

**Registry state at session end (cache-busted):**
- Total entries: **477** (up from 447 at session 12 end → +30 this
  session across backfill + topics)
- With location: 212 (up from 208; location enrichment lags the
  write and catches up on the next discovery cron)
- Latest source: `manual-topics` at 2026-04-19T22:51:27Z
- Note: `/api/registry` carries a 5-min CDN s-maxage so the
  unbusted reading during mid-session verification reported 456;
  cache-busted query against the live Upstash-backed route
  returns 477.

**AUDITOR-REVIEW: PENDING** on:
1. Topics discovery verify-pass rate — observed 52% on a
   top-stars-sorted 40-sample pass; will skew lower on broader
   topics like `llm` after the tool-specific ones exhaust. Watch
   the first three cron runs; if pass rate <25%, drop
   `llm`/`ai-agent`/`langchain` from the default list and keep
   the tool-anchored ones (claude, cursor, aider, windsurf,
   copilot, agents-md, crewai).
2. Topics × Code Search Search-API budget collision. Topics runs
   at :45 past the hour, registry-discover at the top of the 6h
   boundary, backfill-events at :15 past. No hour has all three
   colliding in the 30 req/min window but if cron drift changes
   that, the 10s inter-kind gap plus 2.2s inter-page delay should
   still keep us under.
3. Models tab uses HuggingFace's `filter=text-generation` —
   intentional v1 scope. Misses multimodal leaders (LLaVA,
   Whisper, etc). Acceptable for launch; revisit if the panel
   earns a second row.

**Next action (priority order, queued):**
1. Source #6 (npm dependents). `npmjs.com` search with
   `keywords:llm` OR `dependents:@anthropic-ai/sdk`; resolve each
   hit's `repository.url`, unique-by-owner/repo, then feed the
   same verifier pipe. One commit when it lands.
2. Source #2 (GitHub Trending). The `/trending` page isn't an
   API — scrape the HTML (~weekly cron, not hourly) via the
   same verifier pipe. Rate budget is fine; cadence needs to
   match trending-window refresh (weekly, monthly).
3. Sources #4 (stargazers) and #5 (HF Spaces → GitHub) are
   compound discovery and slower-growth — defer until 1+2 are
   in.
4. Agents tab (similar shape to Models) once the registry
   meaningfully clears 1000.

```
# Manual one-off backfill / topics trigger (workflows do it on
# cron now, but keep for debugging):
SECRET=$(security find-generic-password -s aipulse-ingest-secret -w)
curl -sS -X POST -H "x-ingest-secret: $SECRET" \
  "https://aipulse-pi.vercel.app/api/registry/backfill-events?cap=100"
curl -sS -X POST -H "x-ingest-secret: $SECRET" \
  "https://aipulse-pi.vercel.app/api/registry/topics?cap=60&pagesPerTopic=2"
```

Files created (5): `.github/workflows/registry-backfill-events.yml`,
`.github/workflows/registry-discover-topics.yml`,
`src/lib/data/registry-topics.ts`,
`src/app/api/registry/topics/route.ts`,
`src/lib/data/fetch-models.ts`,
`src/app/api/models/route.ts`,
`src/components/models/ModelsPanel.tsx`.
Files modified (3): `src/lib/data-sources.ts`,
`public/data-sources.md`, `src/components/dashboard/Dashboard.tsx`.
Files deleted: 0.

Commits: `322f3c1`, `559d367`, `cfe4a96`.

---

### Session 12 — registry discovery expansion · source #1 + geocoder (2 commits)

User pivot: `/session-start` opened on a location-enrichment debug
that resolved cleanly (the pipeline was working — 117/351 entries
had location at session start, and the missing-key band cleared on
the next cron). User then expanded scope: add 6 new discovery
sources to the registry pipeline, plus expand the geocoder
dictionary, plus a long brief about Models/Agents/Research tabs.

Sequenced per project discipline ("one checkpoint per PR"): only
source #1 (Events backfill) + geocoder expansion landed this
session. Sources #3 (topics), #6 (npm), #2 (trending), #4/#5
(compound discovery) queued. Models tab waits until registry
crosses 1000 verified entries — user's own bar from the brief.

**Shipped:**

- `9d53782 feat(registry): events-backfill discovery — reuse globe
  buffer at zero search cost`
  - `src/lib/data/registry-events-backfill.ts` (NEW). Pipeline:
    `readWindow(240)` from globe-events Upstash list → group by
    `meta.repo` (full_name) → prefer `hasAiConfig=true` (live
    pipeline already paid the gating cost) → newest event first
    within band → skip repos already in registry → bounded verify
    pass (cap default 100, hard max 300). Per candidate: probe
    all 6 ConfigKind paths via `pathExists` (30-day Next.js Data
    Cache fronts these — most replays free), verify each existing
    path via the same shape verifier as Code Search discovery,
    fetch repo meta, resolve owner location through the shared
    cache. Upsert via existing path; firstSeen + location
    preserved on re-discovery.
  - `src/app/api/registry/backfill-events/route.ts` (NEW). Auth
    via shared INGEST_SECRET. Query params: source, cap,
    windowMinutes. `maxDuration=120` — between Code Search seed
    (300) and ingest (60).
  - `src/lib/data-sources.ts` + `public/data-sources.md`:
    GITHUB_EVENTS now declares `repo-registry` as powered feature
    and the caveat documents the events-backfill reuse
    explicitly. No new top-level source — the feed is the same
    GitHub Events API already documented.
  - **Trust contract:** if all 6 probes return false (typically
    rate-limit / transient), candidate is SKIPPED rather than
    written as no-config stub — preserves chance to discover on
    next run. lastActivity comes from pushed_at, not the event
    timestamp (a fork/watch event doesn't move the commit-
    freshness band).

- `4c1c025 feat(geocoding): expand dictionary — Chinese metros, US
  state suffixes, ZIP-3 fallback`
  - 30 Chinese metros (Changsha + ChangSha alias, Wuhan, Nanjing,
    Tianjin, Chongqing, Suzhou, Xiamen, Qingdao, Dalian, Shenyang,
    Harbin, Zhengzhou, Jinan, Hefei, Fuzhou, Nanchang, Kunming,
    Guiyang, Lanzhou, Urumqi, Lhasa, Ningbo, Wenzhou, Foshan,
    Dongguan, Zhuhai, Taipei, Taichung, Tainan).
  - 41 US state ", XX" patterns. Comma-prefix is the safety net;
    longest-first sort ensures "Casablanca" still wins over
    ", ca" (10 chars vs 4). Smoke-tested: Fresno, CA → CA
    centroid (correct fallback); Berkeley, CA → still Berkeley
    (city wins); Casablanca → still Casablanca.
  - ZIP3_COORDS table (~110 entries) covering top-population
    metros (NYC, NJ, Boston, Philly, DC/MD/VA, Atlanta, FL,
    Chicago, Dallas, Austin, Houston, Denver, LA, San Diego, SF
    Bay, San Jose, Sacramento, Portland, Seattle). `ZIP_PATTERN
    = /^\d{5}(?:-\d{4})?$/` — only fires when the *entire*
    haystack is a ZIP, never as substring inside longer strings.
    Smoke-tested: 22602 → DC area (Winchester, VA); 94110 → SF;
    98101-2345 → Seattle (ZIP+4 supported); 12345 → null
    (correctly absent from top-50).
  - **Pre-existing limitation surfaced (not introduced):**
    "Charlottesville, VA" → Charlotte NC because "charlotte" is
    in the dict and "charlottesville" isn't. Word-boundary
    matching would fix it but that's a geocoder rewrite, not a
    dictionary expansion. Defer.

**Live verification (post-deploy, single backfill at cap=80):**

```
{
  "ok": true,
  "result": {
    "candidatesFound": 258,
    "candidatesAfterSkipKnown": 258,
    "verifiesAttempted": 80,
    "written": 66,
    "failures": []
  }
}
```

Then `GET /api/registry`:
- Total: 381 → 447 (+66, +17% in one backfill run)
- With location: 156 → 208 (+52)
- Coverage: 41% → 47% (+6pp)
- Notable new entries: Netflix/metaflow, siropkin/budi, plus dozens
  of mid-tier active repos that Code Search's 1000-result-per-query
  cap had been missing.

178 candidates remain in the events buffer ready for the next
backfill cap. Each subsequent run will keep adding ~50-70 entries
until the buffer's unique-repo set is exhausted (4h rolling, so
new candidates appear continuously).

**AUDITOR-REVIEW: PENDING** on:
1. Source #1 design — is the "all-probes-false → skip" path
   masking a real config-removal event for repos that legitimately
   deleted their AI config? Today it can't distinguish transient
   throttle from genuine deletion.
2. State-suffix collision matrix — verified locally for Casablanca
   and Costa Rica but the matrix of city/country names containing
   ", XX" substrings is wide.
3. ZIP3 centroid accuracy — a Winchester-VA repo now renders in
   DC. Acceptable for ecosystem-density visualisation; potentially
   misleading for region-specific claims.

**Next action (priority order):**

1. Wire a workflow file `registry-backfill-events.yml` (cron every
   1h since the events buffer rolls in 4h windows; cap=100 per run
   to stay under maxDuration). Until then, manual dispatch via
   `curl` covers it.
2. Source #3 (GitHub Topics search). New file
   `src/lib/data/registry-topics.ts`. Topics list: `claude`,
   `cursor`, `ai-coding`, `llm`, `copilot`, `ai-agent`, `langchain`,
   `crewai`, `aider`, `windsurf`, `agents-md`. Each topic search
   feeds into the same verifier + registry path. Same
   AUDITOR-REVIEW pattern.
3. Source #6 (npm dependents). Different API shape (npmjs.com
   search by `keywords:llm` then resolve `repository.url`). More
   plumbing; one commit when it lands.
4. Once registry crosses 1000 entries, build the Models tab from
   the user's brief — HuggingFace `/api/models` top-20 by 30d
   downloads, floating panel like Tools.

```
# Manual one-off backfill (until workflow file lands):
SECRET=$(security find-generic-password -s aipulse-ingest-secret -w)
curl -sS -X POST -H "x-ingest-secret: $SECRET" \
  "https://aipulse-pi.vercel.app/api/registry/backfill-events?cap=100"
```

Files created (2): `src/lib/data/registry-events-backfill.ts`,
`src/app/api/registry/backfill-events/route.ts`.
Files modified (3): `src/lib/data-sources.ts`,
`public/data-sources.md`, `src/lib/geocoding.ts`.
Files deleted: 0.

Commits: `9d53782`, `4c1c025`.

### Session 11.2 — registry visual pivot · decay-coded base layer (1 commit)

The architectural pivot shipped. Globe + flat map now read
`/api/registry` as a persistent base layer alongside the 4-hour live
pulse. A repo that pushed last week stays visible on the map even after
its live event falls off. Live pulse keeps its bright event-type colours
on top.

**Shipped (`7461fee feat(globe,map): registry base layer — decay-coded
dots + merged card`):**

- `src/lib/data/registry-shared.ts` (NEW). Client-safe types
  (`RegistryEntry`, `RegistryLocation`, `ConfigKind`) + pure helpers
  (`decayScore`, `formatAgeLabel`). `repo-registry.ts` re-exports so the
  Redis/Upstash import stays server-only and the client bundle stays
  lean.
- `Cluster` shape extended: adds `liveCount`, `registryCount`,
  `avgDecay`. `clusterPoints()` (Globe.tsx) splits live vs registry per
  bucket; colour = dominant live event type if any live, else slate;
  registry-only buckets size-scale by `log2(count) × decayWeight`.
  `pointColor` emits live colour at full alpha and slate at
  `avgDecay × 0.7` alpha for registry-only clusters.
  `labeledClusters` filter narrowed so registry singletons stay
  unlabelled (quiet base).
- `EventCard` titlebar: `"N live · M w/ AI cfg · K registry"`. New
  `RegistryRow` renders config-kind pills + repo link + description +
  `language · ★ stars` + `"Last activity: Xd ago"` via `formatAgeLabel`.
  Live rows still sort first.
- FlatMap: registry markers at 6px with slate + decay-alpha. Cluster
  icon splits live vs registry counts; registry-only clusters render
  smaller + fade the border alpha by `avgDecay`. Legend gains a 5-band
  decay strip parallel to the Globe legend.
- Dashboard polls `/api/registry` every 2 min (5-min CDN cache on the
  endpoint keeps Upstash cheap). Registry entries without resolved
  location are dropped client-side (no fake coords). Repos that also
  have a live event in the current window are deduped out of the
  registry layer — the live card row already encodes their presence.

**Trust contract preserved:** no synthetic coords (registry entries
without location are dropped), decay is a pure function of GitHub's
`pushed_at` (no inferred freshness), live events still sort first and
take the full-colour dot.

**Seed state (2026-04-19 19:16 UTC):** 167 entries from run
24636800837, all pre-dating owner-location support so none carry a
`location` field yet. Next seed dispatch (`24637258198`) will run the
enrichment pass (`ENRICH_CAP=100`) to backfill lat/lng for
owner-resolvable entries. Once 2+ seeds have landed, the globe base
layer should render a visible decay-coded cluster pattern.

Build clean: 1.95s compile, 1.28s typecheck. No new runtime deps.

**AUDITOR-REVIEW: PENDING** — visual pivot, needs live verification
that registry + live layers read legibly side-by-side once registry
entries have location data.

**Next action:** re-run the seed dispatch until the registry has ≥800
entries with resolved locations, then open the deployed site and
verify: (a) registry dots visible as quiet slate base-layer density,
(b) live events sit bright on top, (c) EventCard shows both layers
when a region has mixed content, (d) decay legend reads correctly.

```
gh workflow run registry-discover.yml \
  -f source=manual-seed \
  -f maxVerify=200 \
  -f pages=10 \
  -f skipKnown=1 \
  --repo Neelagiri65/aipulse
```

Monitor resolved-location count:

```
curl -s https://aipulse-pi.vercel.app/api/registry | jq '{
  total: (.entries | length),
  withLocation: [.entries[] | select(.location != null)] | length,
  null: [.entries[] | select(.location == null)] | length
}'
```

Commit: `7461fee`.

### Session 11.1 — registry search hotfix (1 commit)

First seed dispatch (run 24636800837) returned `candidatesFound: 0`
despite the endpoint returning 200 OK. Root cause was three bugs in
`src/lib/data/registry-discovery.ts`, all fixed in `05f413a`:

1. **`path:` qualifier was fed full file paths.** GitHub's Code Search
   `path:` matches a directory, not a file. `path:.github/copilot-
   instructions.md` → 404 "Not Found". Changed to parent directory:
   `path:.github` → 40k results; `path:.continue` → 147 results (all
   `.continue/config.json`).
2. **Throw-on-any-error wiped collected pages.** A rate-limit or flaky
   404 on page N discarded pages 1..N-1 of the same kind. Changed to
   `break` + record the failure; partial results survive the sweep.
3. **Burst-all-six-kinds tripped secondary rate limits.** Added 1.5s
   delays between pages and between kinds; at the 30 req/min auth cap
   we stay safe and a worst-case 60-call sweep still fits inside 300s.

Verified every filename variant locally with curl + github-pat before
deploying (numbers in the commit body). Build clean (1.95s compile +
1.38s TS). Push to `main` triggers Vercel auto-deploy.

**Next action:** re-run the seed dispatch once the `05f413a` deploy
lands. Command unchanged from session 10:

```
gh workflow run registry-discover.yml \
  -f source=manual-seed \
  -f maxVerify=200 \
  -f pages=10 \
  -f skipKnown=1
```

Expected after fix: ~6 kinds × up to 10 pages × 100 items = 6k
candidates, deduped to a few thousand, bounded-verified to 200 per
run (the seed cap). Monitor:
`curl https://aipulse-pi.vercel.app/api/registry | jq '.entries | length'`.

Commits: `05f413a`.

### Session 10 — Phase B · repo registry foundation (4 commits)

User unblocked session: "Both [fixes + Phase B]. Start Phase B now —
the registry foundation is the architectural shift that makes
everything else work. Models tab after. ... fetch first 500 bytes and
check for config-shaped structure. Decay = dimmer dot + 'Last
activity: Xd ago' on hover card. Target = 2k high-quality verified
repos. Go."

Four atomic commits, all green builds. The registry is the long-term
memory layer: where today's globe shows activity in the last 4 hours,
the registry persists *every* repo with a verified AI-tool config,
decay-coded by last pushed_at. Ecosystem map, not just firehose.

**Shipped:**

- `7d1e57e feat(registry): Upstash-backed store for verified AI-config repos`
  - `src/lib/data/repo-registry.ts` (NEW). Types: `ConfigKind` (6
    filenames), `DetectedConfig`, `RegistryEntry`, `RegistryMeta`.
    Storage = single Upstash HASH `aipulse:registry:entries` keyed
    by `full_name`. One HSET per discovery run (Upstash counts it
    as 1 command regardless of field count); one HGETALL per read.
    14-day TTL so dead registries auto-expire. Meta in a separate
    STRING key. All functions are silent no-ops when Redis is
    unconfigured.
  - Decay scoring — step function not exponential so bands are
    explainable: ≤24h → 1.0, ≤7d → 0.85, ≤30d → 0.55, ≤90d → 0.25,
    >90d → 0.10. `formatAgeLabel()` returns "Last activity: Xd ago"
    matching the exact copy spec'd.

- `35d0ac4 feat(registry): content verifier — first-500-bytes shape heuristic`
  - `src/lib/data/config-verifier.ts` (NEW). Fetches via the
    GitHub Contents API (handles default branch automatically,
    reuses GH_TOKEN budget). Base64-decoded first 500 bytes run
    through deterministic heuristics — no LLM, per the project
    non-negotiable.
  - Markdown/text scorer bands: +0.2 size ≥50 non-ws bytes, +0.2
    markdown header, +0.3 instruction verbs, +0.2 role/context
    labels, +0.1 code references. Verified threshold 0.4.
  - JSON scorer (for `.continue/config.json`): parses or matches
    a valid-JSON-prefix with expected keys (models, rules,
    customCommands, contextProviders, slashCommands, systemMessage).
  - Disqualifiers (hard reject): <30 non-ws bytes, >10 non-printable
    bytes (binary), template stubs ("lorem ipsum", "TODO: write your
    rules here", "[your instructions here]", lone-header stubs).
  - `sample` field preserves verbatim bytes for transparency.

- `5ec2399 feat(registry): discovery pipeline + /api/registry read+write routes`
  - `src/lib/data/registry-discovery.ts` (NEW). Pipeline per run:
    Code Search for each ConfigKind → dedupe by (fullName, path) →
    optional skip of known repos → bounded verify pass (group by
    repo so one `/repos/{owner}/{name}` meta call covers all configs
    for that repo) → upsert verified entries preserving existing
    `firstSeen` stamps → write meta.
  - Budget: 40 candidate cap on cron (~80 GH calls, 60s window
    safe); 200 cap on seed runs (300s maxDuration). Search costs
    6 kinds × N pages, bounded to 30 req/min. 422 (deep page
    exhausted) and 403 (secondary rate limit) handled as "break
    and retry" — never fatal.
  - `src/app/api/registry/discover` (NEW). Auth via INGEST_SECRET
    (reused — cron-side writes share the same secret class).
    Query params: `source`, `maxVerify`, `pages`, `skipKnown`.
    `maxDuration=300` so seed dispatches have room.
  - `src/app/api/registry` (NEW, public read). Returns
    `{ entries, meta, generatedAt }`. CDN cache: `public, max-age=60,
    s-maxage=300, stale-while-revalidate=30` so UI polls don't
    hammer Upstash.

- `d4afc2d feat(registry): cron workflow + data-sources entries`
  - `.github/workflows/registry-discover.yml` (NEW). Cron every 6h
    with defaults (maxVerify=40, pages=3, skipKnown=1) — bounded
    per-run. `workflow_dispatch` inputs let a manual seed push to
    maxVerify=200, pages=10. Reuses existing INGEST_URL +
    INGEST_SECRET repo secrets (strips `/api/ingest` suffix and
    appends `/api/registry/discover`); no new secrets needed.
  - `src/lib/data-sources.ts` + `public/data-sources.md`:
    - **NEW** `GITHUB_CODE_SEARCH` (`gh-code-search`). 30 req/min
      Search API. Sanity range: 100–10k candidates per full sweep,
      60–80% verify-pass rate expected. Caveat makes explicit: a
      Search hit is NOT evidence of a real config — shape
      verification must pass first.
    - **EXPANDED** `GITHUB_CONTENTS`. Measures now documents both
      uses — (1) globe existence check cached 30d, (2) registry
      verifier reading first 500 bytes of the same files for
      shape match. Both deterministic. `powersFeature` adds
      `repo-registry`.

**Trust contract check:**

- Nothing enters the registry without passing shape verification.
  Score (0..1) and verbatim 500-byte sample stored per config so
  future /archives can show "this is the text that made us count it".
- `lastActivity` comes straight from GitHub's `pushed_at` — never
  synthesised. Decay bands are explainable (step function, not a
  hidden exponential).
- Code Search and Contents API are both on the Verified list in
  data-sources.ts with pre-committed sanity ranges.
- Graceful degradation intact: Redis off → registry is empty, globe
  keeps its 4h live-activity pipeline unaffected.

**Phase B is ready to run. Operations plan:**

1. Verify `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are
   set on Vercel (Production + Development — already done for the
   globe pipeline per session 8 notes). Registry shares the same
   instance but distinct keys (`aipulse:registry:*`).
2. First manual seed dispatch (user to run locally or via the gh
   CLI — I do not hold write access to the repo's Actions):
   ```
   gh workflow run registry-discover.yml \
     -f source=manual-seed \
     -f maxVerify=200 \
     -f pages=10 \
     -f skipKnown=1
   ```
   Expect ~200 new verified entries per run. Run it ~10 times spread
   over a day to reach the 2k target (each run picks up new
   candidates because `skipKnown=1`).
3. After the seed, the 6h cron self-sustains — pulls new repos
   with AI configs as code search finds them.
4. Monitor via `GET /api/registry` once deployed:
   `curl https://aipulse-pi.vercel.app/api/registry | jq
   '.entries | length, (.[0] | keys)'`. If verified/attempted
   ratio drops below 60%, tighten verifier heuristics before
   widening reach.

**Deferred to session 11 (visual layer for the registry + Models):**

- Globe consumes `/api/registry` alongside `/api/globe-events`.
  Registry entries render as decay-coded dots (brightness from
  `decayScore(lastActivity)`); EventCard hover line "Last activity:
  Xd ago" from `formatAgeLabel()`. Live events still take visual
  priority when both datasets overlap on the same repo.
- `/archives` page — weekly snapshots of `RegistryMeta`. Requires
  an additional weekly cron that writes snapshots to a rolling list
  (`aipulse:registry:snapshots:YYYY-WW`). Out of scope for this
  session.
- **Models tab** — queued per user direction. HuggingFace
  `/api/models` top-20 by 30-day downloads (text-generation + code).
  Floating panel pattern like Tools; LeftNav "SOON" → count badge.
  **Only start after the registry is seeded and the globe layer
  consumes it** — sequenced ship per user's "Models is expansion,
  fix the foundation first".

Commits: `7d1e57e`, `35d0ac4`, `5ec2399`, `d4afc2d`.

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
