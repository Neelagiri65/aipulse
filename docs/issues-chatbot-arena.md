# Issues — Chatbot Arena benchmarks (BENCH-01 … BENCH-07)

**Parent PRD:** [`docs/prd-chatbot-arena.md`](./prd-chatbot-arena.md)
**Feature branch:** `feature/benchmarks-arena`
**Target PR:** single bundled PR `BENCH: Chatbot Arena benchmarks panel`
**AUDITOR-REVIEW: PENDING** — user is the review surface until `/advisor` lands.

Each issue below is scoped to 3–5 files, dependency-ordered, independently testable. Commits follow TDD rhythm: failing test first (BENCH-01), then the implementation that turns them green (BENCH-02), then wiring (03–06), then live verification (07).

---

## BENCH-01 — Types + pure-logic layer + failing tests

**Goal:** land the shape-verified row parser, the delta computation, the sanity-range guard, and a failing test suite for each. No network, no file I/O — pure functions.

**Files added:**
- `src/lib/data/benchmarks-lmarena.ts` — types (`ArenaRow`, `ArenaRowWithDelta`, `BenchmarksPayload`, `BenchmarksMeta`, `SanityReport`) + pure functions (`parseHfRow`, `computeDeltas`, `buildPayload`, `runSanityCheck`).
- `src/lib/data/__tests__/benchmarks-lmarena.test.ts` — ≥ 12 cases covering: happy-path parse, reject missing required fields, reject wrong `category`, reject wrong `subset`, delta rank ▲/▼/— / NEW, delta Elo +/−/— / NEW, sanity-range pass, sanity-range fail each of the 5 ranges.

**Acceptance criteria:**
1. `parseHfRow(unknown): ArenaRow | null` — returns null on any shape mismatch; no exceptions.
2. `computeDeltas(current, previous)` — previous may be `null`. Absence of a model in previous → `NEW`. Identical → `—`.
3. `runSanityCheck(rows, meta)` — returns `SanityReport` with `{ ok: boolean, warnings: string[] }`. Never throws. Warnings log but do not block writes.
4. `buildPayload(rows, meta, sanityReport)` — returns the exact shape the API serves: `{ ok, rows, meta }`, Elo integer-rounded, CI bounds integer-rounded, vote counts preserved.
5. Tests fail on first run (no implementation yet). Commit: `test: BENCH-01 benchmarks pure-logic failing tests`.

---

## BENCH-02 — HF Datasets Server fetchers + `runIngest` orchestration

**Goal:** implement the real fetchers and make BENCH-01's tests go green.

**Files added:**
- `src/lib/data/benchmarks-ingest.ts` — `fetchLatestSnapshot`, `fetchPreviousSnapshot`, `runIngest`. All I/O isolated here; pure helpers stay in `benchmarks-lmarena.ts`.
- `scripts/ingest-benchmarks.mts` — thin CLI wrapper invoked by the GH Action. Calls `runIngest`, writes `data/benchmarks/lmarena-latest.json` iff `leaderboardPublishDate` changed vs the on-disk file.
- `data/benchmarks/lmarena-latest.json` — bootstrap file (`{ ok: false, reason: "not_yet_ingested" }` shape) so the API route's static import resolves on first deploy.

**Acceptance criteria:**
1. `fetchLatestSnapshot()` — `GET datasets-server.huggingface.co/rows?dataset=lmarena-ai/leaderboard-dataset&config=text&split=latest&offset=0&length=100`; filters `category == "overall"`; sorts by `rank` asc; returns top 20 parsed rows + their publish date.
2. `fetchPreviousSnapshot(latestPublishDate)` — paginates `split=full` (≤ 5 pages × 100 rows = 500) looking for the newest publish date strictly `<` latest. Returns `{ rows, publishDate } | null` if not found.
3. `runIngest()` — orchestrates fetch → delta → sanity → buildPayload. Never throws; on failure returns `{ ok: false, reason, error }`. Fetch timeout 10 s.
4. Idempotency: rerunning with unchanged upstream data produces byte-identical JSON (stable key order, no timestamps inside `rows[]`).
5. All BENCH-01 tests go green. Commit: `feat: BENCH-02 HF fetchers + runIngest orchestration`.

---

## BENCH-03 — `LMARENA_LEADERBOARD` in source registry + transparency mirror

**Goal:** register the source per the transparency contract. Two files must move in one commit.

**Files modified:**
- `src/lib/data-sources.ts` — new exported `LMARENA_LEADERBOARD: DataSource`, add to `ALL_SOURCES`. Sanity-range description covers all five ranges (top1_rating 1300–1500, rank20_rating 1100–1400, row_count exactly 20, publish_age_days 0–14, top1_vote_count ≥ 5000); `expectedMin`/`expectedMax` captures `row_count` as the hard gate. `verifiedAt: ""` until BENCH-07 lands, at which point it flips to the live-verify date in the same commit.
- `public/data-sources.md` — mirror entry, including the no-declared-license disclosure verbatim from the PRD.

**Acceptance criteria:**
1. `data-sources.ts` typechecks; `ALL_SOURCES` length increases by exactly 1.
2. The two files carry the same: id, apiUrl, measures summary, sanity-check description, caveat, powersFeature.
3. Commit: `feat: BENCH-03 LMARENA_LEADERBOARD source registry + transparency mirror`.

---

## BENCH-04 — API routes

**Goal:** edge read + Node ingest routes.

**Files added:**
- `src/app/api/benchmarks/route.ts` — Node runtime, reads the committed JSON via static import. Headers: `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`. Returns the static payload as-is.
- `src/app/api/benchmarks/ingest/route.ts` — Node runtime. Gated by `x-ingest-secret`. Calls `runIngest()` and returns the payload JSON (without writing to disk — Vercel FS is read-only). Useful for manual dev + smoke tests; the canonical write path is the GH Action.

**Acceptance criteria:**
1. Unauth request to `/api/benchmarks/ingest` → 401.
2. `/api/benchmarks` returns `{ ok: false, reason: "not_yet_ingested" }` before BENCH-07 lands, and the BENCH-02-shaped payload after.
3. Commit: `feat: BENCH-04 /api/benchmarks read + ingest routes`.

---

## BENCH-05 — GH Actions daily cron

**Goal:** daily commit-back cron at 03:15 UTC.

**Files added:**
- `.github/workflows/benchmarks-ingest.yml` — on `schedule: "15 3 * * *"` + `workflow_dispatch`. Steps: checkout → setup-node 22 → run `npx --yes tsx scripts/ingest-benchmarks.mts` → `git diff --exit-code data/benchmarks/lmarena-latest.json || (git add … && git commit … && git push)`. Uses `GITHUB_TOKEN` with `contents: write`.

**Acceptance criteria:**
1. Cron slot does not collide with existing crons (`globe-ingest` every 10 min, `wire-ingest-hn` at `:05/:20/:35/:50`, `registry-backfill-events` at `:15`, `registry-discover*` hourly). 03:15 UTC daily is free.
2. No commit is produced when the fetched JSON equals the committed JSON (idempotency from BENCH-02).
3. `workflow_dispatch` supported so BENCH-07 can trigger a live run manually.
4. Commit: `feat: BENCH-05 benchmarks-ingest daily cron`.

---

## BENCH-06 — Panel + LeftNav tab + Dashboard wiring

**Goal:** the user-visible surface.

**Files added:**
- `src/components/benchmarks/BenchmarksPanel.tsx` — 20-row table, 95 % CI tooltip on hover, staleness banner when `staleDays > 14`, source-footer caveat (verbatim from PRD AC 6), "Awaiting first ingest" empty state.

**Files modified:**
- `src/components/chrome/LeftNav.tsx` — `NavIconName` gains `"benchmarks"`; new SVG (Trophy-like glyph). No `soon` flag.
- `src/components/dashboard/Dashboard.tsx` — `PanelId` union gains `"benchmarks"`; polled via `usePolledEndpoint<BenchmarksResult>("/api/benchmarks", 10 * 60 * 1000)`; panel mounted in the floating-win layout, positioned down-left of Research so the default open state of Wire + Tools doesn't collide.
- LeftNav item ordering: Wire → Tools → Models → Agents → Research → **Benchmarks** → Audit (per PRD placement note; Auditor-pending).

**Acceptance criteria:**
1. Clicking `Benchmarks` opens the panel; clicking again closes it.
2. Panel renders 20 rows at the right column widths with rank, model, org, Elo, votes, Δ rank, Δ Elo. Tooltip on row hover surfaces the 95 % CI.
3. When `/api/benchmarks` returns `{ ok: false, reason: "not_yet_ingested" }`, the panel shows a single "Awaiting first ingest" row — not a blank.
4. When `staleDays > 14`, the amber banner appears; under 14 no banner.
5. Commit: `feat: BENCH-06 benchmarks panel + LeftNav + Dashboard wiring`.

---

## BENCH-07 — First live ingest + verify row-for-row + ship

**Goal:** exercise the architectural constraint test — the panel mirrors lmarena.ai's top 20 exactly, end-to-end.

**Steps:**
1. Trigger the cron via `gh workflow run benchmarks-ingest.yml` (or local `npx tsx scripts/ingest-benchmarks.mts`).
2. Verify the committed `data/benchmarks/lmarena-latest.json`: `meta.leaderboardPublishDate` is recent, `rows.length === 20`, sanity ranges pass.
3. Open lmarena.ai leaderboard in a browser → subset `text`, category `Overall` → compare row-for-row (rank, model name, org, Elo rating, 95 % CI, vote count) against the committed JSON. Document the side-by-side check in HANDOFF.md.
4. Flip `LMARENA_LEADERBOARD.verifiedAt` in `data-sources.ts` and `public/data-sources.md` to today's date in the same commit.
5. Update `HANDOFF.md`: session 18 entry + `AUDITOR-REVIEW: PENDING` list.
6. Open the PR (single bundled) via `gh pr create`.

**Acceptance criteria:**
1. Live JSON exists on main, committed by the cron or the dispatch run.
2. The panel, when loaded on a local `next dev`, displays the 20 rows matching the lmarena.ai leaderboard — character-for-character where strings, integer-rounded where floats.
3. Build + typecheck + test suite are all green.
4. PR body lists: PRD link, the 7 AUDITOR-PENDING items from the PRD, the commit chain, the live-verification note.
5. Commits: `feat: BENCH-07 first live ingest + verify vs lmarena.ai top 20`, `docs: HANDOFF — session 18 (Chatbot Arena benchmarks shipped)`.

---

## Dependency graph

```
BENCH-01 ─┐
          ├─ BENCH-02 ─┐
          │            ├─ BENCH-04 ─┐
          │            │            ├─ BENCH-06 ─── BENCH-07
          │            └─ BENCH-05 ─┘
          └─ BENCH-03 ──────────────┘
```

01 → 02 is tight (TDD). 03 / 04 / 05 can overlap once 02 is green but are kept sequential in the PR for a clean commit chain. 06 needs 04. 07 needs everything.

---

## AUDITOR-PENDING checklist (carried from PRD)

1. Dataset license — no declared license on `lmarena-ai/leaderboard-dataset`. Mitigation: attribution-only, never redistribute parquet.
2. Sanity-range calibration after 2–3 ingests.
3. Caveat wording — three cited critiques; user may want to expand.
4. Panel placement order in LeftNav.
5. Delta window — previous-publish-date vs fixed 7-day window.
6. (new) HF Datasets Server availability / rate tolerance from a GitHub Actions runner IP range.
7. (new) Bootstrap JSON shape — whether the "not_yet_ingested" empty state survives the first deploy cleanly (caught in BENCH-04 AC 2).
