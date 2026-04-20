# Issues — AI Labs Layer

**Parent PRD:** `docs/prd-ai-labs-layer.md` (approved 2026-04-20)
**Feature branch:** `feature/ai-labs-layer`
**Discipline:** one issue = one commit (possibly 2–3 for test + impl + refactor per CLAUDE.md Phase 2 Step 4).

---

## Issue 1 — Curated lab registry + schema validator

**Goal:** `data/ai-labs.json` with 33 entries plus a deterministic schema validator. Zero UI work. Foundation for every downstream issue.

**Files:**
- create `data/ai-labs.json`
- create `src/lib/data/labs-registry.ts` (types + `validateLabsRegistry()`)
- create `src/lib/data/__tests__/labs-registry.test.ts`

**Acceptance:**
- `validateLabsRegistry(registry)` returns `{ ok: true }` for the real file; rejects malformed entries (missing field, lat outside [-90, 90], lng outside [-180, 180], country_code not 2-letter, duplicate id).
- Tests cover: happy path, each rejection branch, cross-entry duplicate-id detection.
- `npm run build` clean.

**Curation criteria (pre-committed, written in the file's top comment):**
1. Must have ≥1 public GitHub org OR ≥1 canonical flagship AI repo verifiable today.
2. HQ coordinate must trace to a public source (Wikipedia infobox or the org's own "about/contact" page); URL cited in `hqSourceUrl`.
3. Org must publish AI research/code — not just "uses AI". E.g. Hugging Face (yes, they ship transformers/datasets), Netflix (no, infrastructure consumer).
4. Academic labs use their most-active AI subgroup org (e.g. `stanford-crfm` for Stanford AI Lab, `mit-han-lab` for MIT) since universities don't centralise AI work under one GitHub org.

**Verified list (33):** listed in the PRD. Final resolutions for ambiguous academic orgs will be noted in `data/ai-labs.json`'s per-entry `notes` field — e.g. "Stanford AI Lab represented by stanford-crfm; sibling subgroups stanford-nlp, stanford-futuredata excluded to avoid double-counting".

**Commit message:** `feat(labs): curated AI-labs registry + schema validator`

---

## Issue 2 — Activity fetcher + API route

**Goal:** pull 7-day public-event activity for every tracked repo, bucket by lab, expose at `/api/labs`.

**Files:**
- create `src/lib/data/fetch-labs.ts`
- create `src/app/api/labs/route.ts`
- create `src/lib/data/__tests__/fetch-labs.test.ts`

**Acceptance:**
- `fetchLabActivity()` returns `{ labs: LabActivity[], generatedAt, failures }`.
- Each `LabActivity` includes: lab id + static fields, per-type event counts, total, per-repo breakdown, `stale: boolean` if any repo fetch failed.
- 7-day window is an exact 7 × 24 × 3600 × 1000 ms cutoff against event `created_at`.
- Event types filtered to the same RELEVANT_TYPES set used by `fetch-events.ts` (PushEvent / PullRequestEvent / IssuesEvent / ReleaseEvent / ForkEvent / WatchEvent / CreateEvent / IssueCommentEvent / PullRequestReviewEvent).
- Network failures on individual repos do NOT tank the whole response — the lab just records `stale: true` with last-known count 0 on cold start.
- Uses `GH_TOKEN` via the existing `src/lib/github.ts` headers pattern.
- Next.js `fetch` `revalidate: 21600` (6h Data Cache).
- `/api/labs` returns JSON with CDN `s-maxage=1800, stale-while-revalidate=21600`.
- Unit tests mock `fetch`; cover window boundary, per-type bucketing, graceful failure on one repo.

**Commit message:** `feat(labs): 7-day GitHub activity fetcher + /api/labs`

---

## Issue 3 — Globe + FlatMap labs layer (visual)

**Goal:** violet dots plotted at each lab's HQ, sized by activity, zero-activity dim, legend updated. No panel or card yet.

**Files:**
- create `src/components/labs/labs-to-points.ts` (pure: `labsToGlobePoints(LabActivity[]) → GlobePoint[]`)
- modify `src/components/globe/Globe.tsx` (recognise `meta.kind === "lab"`, use violet, apply size-scale helper, include in clusters)
- modify `src/components/map/FlatMap.tsx` (same additive change for leaflet)
- modify `src/components/dashboard/Dashboard.tsx` (fetch `/api/labs`, pass points into Globe + FlatMap)
- create `src/components/labs/__tests__/labs-to-points.test.ts`

**Acceptance:**
- Log-scaled dot size: `minSize` (e.g. 0.3) for zero-activity, up to `maxSize` (e.g. 1.2) at the 95th-percentile activity count across the run. Tests cover the clamp at both ends.
- Violet `#a855f7` for the labs layer.
- Zero-activity lab: dim (0.35 opacity) violet dot at min size — still present, still clickable.
- Legend in the globe status overlay gains an "AI Labs" row with the violet swatch.
- Tests assert the pure function's outputs are deterministic given fixed input.

**Commit message:** `feat(labs): globe + flat-map violet layer with activity scaling`

---

## Issue 4 — Filter toggle + labs click-card

**Goal:** user can toggle the layer; clicking a lab dot shows a card with activity breakdown + repo links.

**Files:**
- modify `src/components/globe/Globe.tsx` (filter-panel: new checkbox "AI Labs", default on)
- modify `src/components/globe/event-detail.tsx` (route to a LabCard render branch when clicked cluster contains lab points)
- create `src/components/labs/LabCard.tsx` (name, kind badge, city/country, 7d activity count, per-type breakdown, tracked repos with counts + GitHub links, HQ source link)

**Acceptance:**
- Toggle off → no labs dots visible; toggle on → they return instantly.
- Click a lab cluster in either Globe or FlatMap → LabCard opens.
- LabCard shows every field specified; links are real URLs.
- Zero-activity lab still clickable; card clearly shows "0 events in 7d · present".

**Commit message:** `feat(labs): filter toggle + labs click-card`

---

## Issue 5 — AI Labs panel, LeftNav, source registry, cron, Playwright

**Goal:** close the feature. LeftNav 8th button, full-screen list panel sibling to Research, data-sources.ts entry, `public/data-sources.md` row, GitHub Actions cron, Playwright smoke test.

**Files:**
- create `src/components/labs/LabsPanel.tsx`
- modify `src/components/chrome/LeftNav.tsx` (8th button: AI Labs + count badge)
- modify `src/components/dashboard/Dashboard.tsx` (register panel, wire nav)
- modify `src/lib/data-sources.ts` (add `AI_LABS_REGISTRY` + `GITHUB_REPO_EVENTS_LABS`)
- modify `public/data-sources.md` (mirror entries)
- create `.github/workflows/labs-cron.yml` (6h schedule hitting `/api/labs` to warm the Data Cache)
- create `tests/visual/06-ai-labs.spec.ts`

**Acceptance:**
- LeftNav shows 8 buttons; "AI Labs" opens the panel.
- Panel shows all 33 labs sorted by 7d activity desc, each row has: name, kind badge, city/country, 7d count, sparkline-ish bar.
- `data-sources.ts` has two new entries: `AI_LABS_REGISTRY` (the curated JSON) + `GITHUB_REPO_EVENTS_LABS` (the per-repo events API usage), each with expected range + caveat.
- `public/data-sources.md` mirrors them.
- Playwright test 06-ai-labs.spec.ts: (a) labs layer renders with ≥20 violet dots on Map view, (b) LeftNav "AI Labs" opens LabsPanel, (c) panel lists ≥20 rows.
- GitHub Actions workflow runs every 6h; on failure posts to the same place existing crons alert (if any; otherwise logs only).
- Full unit + visual suites green.

**Commit message:** `feat(labs): panel, nav, source registry, cron, smoke test`

---

## Integration + merge (CLAUDE.md Phase 2 Step 5)

Before merging `feature/ai-labs-layer` → `main`:

1. `npm run build` clean.
2. `npm test` all green (existing 84 + new labs unit tests).
3. `npm run test:visual` all green (existing 20 + 06-ai-labs spec).
4. Confirm rate-limit math: 33 labs × avg 2.5 repos × 4 cron runs/day = ~330 req/day. Current gh-events + registry daily usage: ~3000/day. Total: ~3300 / 5000/hr cap — comfortable.
5. Confirm `/audit` score is not worsened by the new data-sources.ts entries.
6. Merge to `main`. HANDOFF.md updated. Deploy to Vercel.

---

## Auditor-review placeholders (flag in commit messages)

Per `CLAUDE.md` dual-model build protocol — no live Auditor available, so each commit message tagged:

- Issue 1 commit: `AUDITOR-REVIEW: PENDING — curation list inclusion decisions, schema strictness.`
- Issue 2 commit: `AUDITOR-REVIEW: PENDING — 7d window exactness, rate-limit headroom.`
- Issue 3 commit: `AUDITOR-REVIEW: PENDING — size-scale clamp choices, colour contrast.`
- Issue 4 commit: `AUDITOR-REVIEW: PENDING — toggle default, card field hierarchy.`
- Issue 5 commit: `AUDITOR-REVIEW: PENDING — source-registry copy, cron cadence.`
