# PRD — Chatbot Arena benchmarks (Benchmarks panel)

**Status:** AUDITOR-REVIEW: PENDING (no Auditor available; user is the review surface).
**Author:** Builder (Claude Code, session 17).
**Date:** 2026-04-20.
**Source approval:** APPROVED in session 14 (HANDOFF L329–333). v1 scope confirmed in session 17 grill (Overall text only; dropdown → v2).

---

## Problem statement

AI Pulse currently shows what's being **built** (registry, GH events) and what's being **discussed** (HN). It does not show which models are actually **winning** — the single most-cited quality signal in the AI ecosystem. Chatbot Arena's Elo leaderboard is the de-facto frontier benchmark, derived from millions of pairwise human preference votes, and it is publicly and verifiably available as a HuggingFace dataset (`lmarena-ai/leaderboard-dataset`).

Adding a dedicated Benchmarks panel with the top 20 models by Overall text Elo — including week-over-week rank and Elo deltas — turns the observatory from a build/discuss diptych into a build/discuss/**rank** triptych. It is the last major data source needed before the product is feature-complete for a first public share.

## User story

> **As an** AI-watcher / dev / founder scanning the ecosystem,
> **I want** to see the top 20 models by current Chatbot Arena Elo — with org, Elo rating, vote count, and rank-and-Elo deltas vs the previous publish date — in a dedicated panel accessible from the LeftNav,
> **so that** at a glance I can tell which frontier models are climbing, which are stalled, and which are new — with every number traceable back to the lmarena-ai published dataset and no AI Pulse rescoring in the middle.

## Acceptance criteria

1. **New `Benchmarks` tab in LeftNav**, right of `THE WIRE`. New `PanelId = "benchmarks"`. Floating-panel layout consistent with existing panels; default position saved in the same session layout scheme (no new persistence).

2. **Panel renders top 20 rows** by `rank` ascending (1–20) in the `latest` split, subset `text`, category `overall` of `lmarena-ai/leaderboard-dataset`.

3. **Row shape** (7 columns): `#` (rank), `Model` (raw `model_name` verbatim), `Org` (raw `organization` verbatim), `Elo` (integer of `rating`), `Votes` (formatted `vote_count`, e.g. `12.3k`), `Δ Rank` (▲N / ▼N / — / `NEW`), `Δ Elo` (`+N` / `−N` / `—` / `NEW`).

4. **Hover on any row shows 95% CI tooltip**: `95% CI: ${Math.round(rating_lower)} – ${Math.round(rating_upper)}`.

5. **Deltas computed server-side at ingest** against the previous distinct `leaderboard_publish_date` for the same (subset=`text`, category=`overall`) pair. A model present in current but absent in previous → `Δ Rank = NEW`, `Δ Elo = NEW`. A model with identical rank / Elo → `—`. Precomputed and written into the JSON so the client renders only.

6. **Panel footer caveat (verbatim)**:
   > Elo ratings from Chatbot Arena (lmarena.ai) — Bradley-Terry scores computed from {totalVotes} pairwise human preference votes. Dataset: lmarena-ai/leaderboard-dataset · published {leaderboardPublishDate}. Known critiques: style bias (verbose answers score higher), self-selection (volunteer voters ≠ general users), category overlap.
   `{totalVotes}` = sum of `vote_count` across the top 20 rows, formatted with thousands separators. `{leaderboardPublishDate}` = the `leaderboard_publish_date` of the served snapshot.

7. **Cron `benchmarks-ingest-lmarena` runs daily at `15 3 * * *`** (03:15 UTC). No overlap with existing `:05/:20/:35/:50` HN slots or other `registry-*` / globe crons.

8. **Cron fetches via HF Datasets Server REST API**:
   `GET https://datasets-server.huggingface.co/rows?dataset=lmarena-ai/leaderboard-dataset&config=text&split=latest&offset=0&length=100`
   Selects rows where `category == "overall"`, sorts by `rank` asc, takes top 20.

9. **Previous-snapshot fetch:** cron additionally queries `split=full` filtered to the most-recent `leaderboard_publish_date` strictly less than the `latest` date, same subset + category, to compute deltas. If no previous snapshot exists (dataset newly populated), all rows render `NEW`.

10. **Cron writes `data/benchmarks/lmarena-latest.json`** and commits only when the `leaderboardPublishDate` in the file would change. No-op fetches produce no commit (no diff noise).

11. **`/api/benchmarks` edge route** reads the committed JSON, returns `{ ok, rows, meta: { leaderboardPublishDate, prevPublishDate, totalVotes, staleDays, fetchedAt } }`. Cache `s-maxage=3600, stale-while-revalidate=86400`.

12. **Staleness banner** in the panel header: when `staleDays > 14`, show muted amber banner "Last updated {N} days ago — source has not refreshed" per source-down fallback contract. Below 14 days, no banner.

13. **Source-down fallback:** cron fetch failure keeps the last committed JSON unchanged; UI continues to serve it; log entry captures failure. No synthetic data, no placeholder values. If the committed JSON itself is missing (first deploy before first cron), the API returns `{ ok: false, reason: "not_yet_ingested" }` and the panel shows a single row "Awaiting first ingest".

14. **Sanity ranges pre-committed in `src/lib/data-sources.ts`** (per Part 0 non-negotiable): top1_rating 1300–1500, rank20_rating 1100–1400, row_count exactly 20, publish_age_days 0–14, top1_vote_count ≥ 5000. Values outside these ranges do not block writes but are logged and flagged in `HANDOFF.md` for investigation.

15. **No map dot, no globe point.** Models have no location; Benchmarks is panel-only. This is the first explicitly panel-only source — per the Part 0 geotag principle added this session, sources without a public location field don't get geotagged, they live in panels.

16. **Transparency contract updated:** `public/data-sources.md` gains an entry for `LMARENA_LEADERBOARD` mirroring `data-sources.ts`, including the no-declared-license disclosure and the verifiedAt timestamp of first ingest.

## Technical approach

**Files added:**

- `src/lib/data/benchmarks-lmarena.ts` — pure-logic layer: types, `parseHfRow`, `computeDeltas`, `buildPayload`. No I/O.
- `src/lib/data/benchmarks-ingest.ts` — fetchers (`fetchLatestSnapshot`, `fetchPreviousSnapshot`) and `runIngest` orchestration. Writes the JSON file via Node `fs/promises` when invoked from the GH Action (local-only path), or returns the payload when invoked from the API route (dev path).
- `data/benchmarks/lmarena-latest.json` — the committed snapshot.
- `src/app/api/benchmarks/route.ts` — Edge read route.
- `src/app/api/benchmarks/ingest/route.ts` — Node route gated by `x-ingest-secret` (same pattern as `/api/wire/ingest-hn`). Unlike HN, the write path is actually a GH Action commit; this route is for manual testing.
- `src/components/benchmarks/BenchmarksPanel.tsx` — the panel body (20-row table + footer caveat + staleness banner).
- `src/components/benchmarks/__tests__/benchmarks-lmarena.test.ts` — delta logic, `NEW` badge, sanity-range guard.
- `.github/workflows/benchmarks-ingest.yml` — daily cron workflow.

**Files modified:**

- `src/lib/data-sources.ts` — register `LMARENA_LEADERBOARD` with sanity ranges.
- `public/data-sources.md` — mirror the entry.
- `src/components/chrome/LeftNav.tsx` — new `Benchmarks` tab (icon: `Trophy` or `BarChart3` from lucide).
- `src/components/dashboard/Dashboard.tsx` — add `benchmarks` to `PanelId` union, mount `<BenchmarksPanel />`, position default, add to `panels`/`zorder`.

**Data flow:**

```
GH Actions daily 03:15 UTC
  → fetchLatestSnapshot(HF Datasets Server)
  → fetchPreviousSnapshot(HF Datasets Server, prev publish date)
  → computeDeltas()
  → write data/benchmarks/lmarena-latest.json (if publishDate changed)
  → commit + push

Browser
  → GET /api/benchmarks (Edge)
  → reads data/benchmarks/lmarena-latest.json (static import or fs read)
  → returns JSON + meta
  → BenchmarksPanel renders 20 rows + caveat footer
```

## Architectural constraint test

**Non-negotiable:** Every row displayed in the Benchmarks panel must be verifiable by a user who (a) opens `https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset`, (b) selects subset `text`, split `latest`, filters `category == "overall"`, and (c) reads the first 20 rows sorted by `rank`. The rank, model name, org, Elo rating, vote count, and confidence bounds in our panel must match that dataset's values **exactly**, character-for-character where strings, integer-rounded where floats. AI Pulse performs no recomputation of Elo, no re-ranking, no filtering beyond the declared top-20 cap, no renaming, no merging of model variants into families.

Violations of this test are not tolerated: if the dataset publishes a row we find objectionable (e.g. a deprecated model checkpoint still ranking high), we display it as-is. The panel is a mirror, not an editorial surface.

**Checks against this test:**

- The ingest code path touches only: `fetch → parse → filter (category == "overall") → sort (rank asc) → take (20) → delta computation → write`. No transformations of `model_name`, `organization`, or `rating`.
- Unit test: given a captured HF fixture, the output JSON equals a hand-verified expected JSON row-for-row.
- Visual diff test (manual, one-time on first deploy): load lmarena leaderboard UI in a browser, side-by-side with the panel, confirm top 20 match.

## Out of scope for v1

- Category dropdown (Coding / Hard Prompts / Vision / Style Control). v2.
- Multi-source cross-check (Artificial Analysis, Vellum, BenchLM). v2+.
- Model logos / org icons.
- Row click-through to HF model card or Arena page.
- In-panel search / filter.
- Historical Elo sparkline per model.
- Arrival animations on delta changes.
- Mobile-specific layout (uses existing floating-panel responsive pattern).
- LLM-assisted "what changed this week" summary.

## Dependencies

- **HF Datasets Server** must be reachable from GitHub Actions runners. Public endpoint, no auth — verified functional in this session's grill (webfetched the dataset card successfully).
- **No Redis dependency.** Static JSON + Edge route, same pattern as `registry-*`.
- **No new npm dependencies.** `fetch` is built-in; no parquet parser needed; no parsing library.
- **Existing floating-panel infra** (LeftNav, PanelId union, Dashboard mount points) is the integration surface.
- **Current date (2026-04-20) vs dataset publish date (2026-04-17):** 3-day gap at start = healthy staleDays. Banner would fire only if no publish for >14d.

## Estimated complexity

**S** (small). Breakdown:

- Ingest + delta logic: ~150 LOC pure functions, fully unit-tested.
- API route: ~30 LOC, mirrors existing edge pattern.
- Panel component: ~120 LOC table + caveat + banner; no new design primitives.
- GH Action workflow: ~40 LOC YAML.
- LeftNav + Dashboard wiring: ~20 LOC.
- Tests: ~80 LOC.
- `data-sources.ts` + transparency mirror: ~25 LOC diff.

Total ~465 LOC. Single feature branch, 5–6 commits (TDD rhythm), single PR.

## Sanity ranges (pre-committed)

To be added to `src/lib/data-sources.ts` `LMARENA_LEADERBOARD` entry:

```ts
sanity: {
  top1_rating: [1300, 1500],
  rank20_rating: [1100, 1400],
  row_count: [20, 20],
  publish_age_days: [0, 14],
  top1_vote_count: [5000, Infinity],
}
```

Values outside range → log line, flag in HANDOFF; do not block write (per existing pattern).

## AUDITOR-REVIEW: PENDING items

1. **Dataset license.** `lmarena-ai/leaderboard-dataset` has no declared license on the dataset card. Builder's read: the numbers are citeable facts (fair use for reporting / aggregation), analogous to citing published rankings. Mitigation: attribute clearly in `public/data-sources.md` and panel footer, link back to the dataset page, never redistribute the parquet itself (we only fetch the numbers at ingest time, never serve or cache the underlying file).
2. **Sanity ranges.** Numbers derived from current observed Chatbot Arena distribution (early 2026). First-live run validates — tune after 2–3 ingests if ranges are too tight/loose.
3. **Caveat wording.** Specifically the "known critiques" line — stated plainly but not exhaustively. Other known critiques exist (language bias, prompt-quality bias, time-of-day voting bias). Builder chose three that are most widely-cited. User may want to expand or pare.
4. **Panel placement order.** Builder proposes `Benchmarks` tab immediately right of `THE WIRE` in LeftNav. Alternative orderings possible.
5. **Delta against "previous publish date" vs "7 days ago".** Current design uses previous-distinct-publish-date which may be 2 days or 14 days ago depending on lmarena's cadence. Alternative: fix a 7-day window by scanning `full` split. Tradeoff: consistency vs. granularity. Builder chose previous-publish because it matches how lmarena itself frames updates.

## Issue decomposition (preview — full file in `docs/issues-chatbot-arena.md` after PRD approval)

1. **BENCH-01** — Types + pure-logic layer + failing tests (delta computation, `NEW` badge, sanity range guard).
2. **BENCH-02** — HF Datasets Server fetcher + runIngest orchestration (make tests pass).
3. **BENCH-03** — `LMARENA_LEADERBOARD` in `data-sources.ts` + transparency mirror in `data-sources.md`.
4. **BENCH-04** — `/api/benchmarks` edge route + `/api/benchmarks/ingest` Node route.
5. **BENCH-05** — GH Actions daily cron workflow.
6. **BENCH-06** — `BenchmarksPanel` component + LeftNav tab + Dashboard wiring.
7. **BENCH-07** — First live ingest + verify snapshot + HANDOFF update.

Each issue scoped to 3–5 files, independently testable, dependency-ordered (BENCH-01 before 02 before 06 etc.).
