# HANDOFF — AI Pulse

## Current state (2026-04-20)

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
