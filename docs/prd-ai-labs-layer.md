# PRD — AI Labs Layer

**Feature:** Geographic layer on the globe / flat map plotting ~33 curated top AI research organisations at their HQ coordinates, sized by public GitHub activity across their verified AI repositories in the last 7 days.

**Date:** 2026-04-20
**Author:** session 20 (Builder)
**Status:** Awaiting Auditor/user approval before decomposition.
**Predecessor research:** `docs/research-openalex-integration.md`, `docs/research-semantic-scholar.md` — ruled out paper-level geocoding via OpenAlex, Semantic Scholar, ORCID.

---

## 1. Problem Statement

The AI Pulse globe currently plots two signals: (a) public GitHub events from repos with AI-tool config (the 4-hour pulse), (b) the persistent AI-config registry (dim base layer). Neither layer cleanly answers the question *"where in the world is frontier AI research actually being built?"*.

Two attempts to fix this via academic-paper geocoding (OpenAlex, Semantic Scholar) failed empirically: the upstream data doesn't carry structured author affiliations for AI preprints. Any paper-sourced geographic layer would either be 98.7% empty or visually dominated by institutional-repo-metadata hygiene (Zenodo, HAL) rather than actual AI research.

The honest alternative: maintain a curated list of the world's most active AI research labs with verified HQ coordinates and public GitHub presence. Plot each lab at its real location. Size the dot by the lab's public AI-repo activity this week. Every dot is 100% accurate by construction — no upstream data-quality risk, no inference, no guessing.

## 2. User Story

> As a visitor to AI Pulse, I want to see at a glance **where** in the world AI research labs are based and **which ones are most active this week**, so that I can build a mental map of the global AI research ecosystem without needing to trust an editorialised ranking.

## 3. Acceptance Criteria

1. **Curated lab registry exists.** A new file `data/ai-labs.json` contains ~33 entries covering US, UK, France, Canada, China, Japan, Israel, India, South Korea, Germany, Switzerland. Each entry has: id, display name, city, country code, HQ lat/lng (verified from Wikipedia or the org's own site), category (industry | academic | non-profit), tracked GitHub org(s), curated flagship repos (1–3), HQ source URL.
2. **Activity signal is real.** A fetch pipeline queries `/repos/{owner}/{repo}/events?per_page=100` for each tracked repo, counts public events in the last 7 days (PushEvent + PullRequestEvent + ReleaseEvent + IssuesEvent + WatchEvent + ForkEvent), sums by lab.
3. **Globe + flat map plot labs.** Each lab appears as a distinct-coloured dot at its HQ coordinates. Dot size scales with weekly activity count (log-scaled, min cap for dim "present, quiet" state, max cap so hyperactive labs don't dominate). Zero-activity labs render dim (grey, low opacity) — never hidden.
4. **Distinct visual identity.** Labs layer uses a new colour (proposed: `#a855f7` / violet) so it reads separately from gh-events (teal), registry (slate), and HN (orange). Legend in overlay is updated.
5. **Filter toggle.** The globe filter panel gains an "AI Labs" toggle, default **on**. Toggling off removes the layer instantly.
6. **Click behaviour.** Clicking a lab dot opens a panel (reusing the EventCard pattern) showing: lab name + kind badge, city / country, 7-day activity count broken down by event type, list of tracked repos with per-repo activity counts and direct GitHub links, HQ source link.
7. **Source registry.** `data/ai-labs.json` is registered in `src/lib/data-sources.ts` and documented in `public/data-sources.md` per the project's invariant — it counts as a source because the curation choices affect what users see.
8. **Graceful degradation.** If GitHub's `/repos/{o}/{r}/events` endpoint fails, labs still render (with stale activity counts + a staleness badge); they never disappear from the map. If the cron hasn't run yet (cold start), all labs render at minimum-size dim dots — the map is never blank.
9. **Rate-limit safe.** The activity fetch uses `GH_TOKEN` (5000 req/hr authenticated) and runs every 6 hours. Per run: max ~80 req (33 labs × ~2.5 avg repos). Daily budget: ~320 req, < 0.2% of the 5000/hr cap. Zero impact on the existing gh-events / HN / registry pipelines' rate-limit headroom.
10. **Top-Labs Panel (list view).** The Research panel gains a sibling panel "AI Labs" in the LeftNav, showing the same 33 labs as a list sorted by 7-day activity count desc, with the same per-lab breakdown as the click-card. Same data, two presentations (globe + list).
11. **Unit tests (Vitest).** (a) JSON schema validator for `ai-labs.json` entries — catches malformed lat/lng, invalid ISO country codes, duplicate IDs. (b) Activity-bucketing function — tests window boundary, event-type filtering, multi-repo aggregation. (c) Dot-size scaling — tests min/max clamps and log scaling.
12. **Visual smoke test (Playwright).** New spec `06-ai-labs.spec.ts` asserts: (a) labs layer renders on the Map view, (b) AI Labs nav button opens the panel, (c) the panel lists ≥ 20 labs, (d) clicking a lab dot opens a card with the expected structure.

## 4. Technical Approach

### Files to create

- `data/ai-labs.json` — curated registry. Schema: `{ id, displayName, kind, city, country, lat, lng, hqSourceUrl, orgs: string[], repos: { owner, repo, sourceUrl }[], notes?: string }[]`.
- `src/lib/data/fetch-labs.ts` — fetcher. Reads `data/ai-labs.json`, hits `/repos/{o}/{r}/events` for each repo with `GH_TOKEN`, buckets events by lab by type by 7d window, returns `LabsResult`.
- `src/app/api/labs/route.ts` — Node runtime, `force-dynamic`, CDN `s-maxage=1800`. Calls `fetchLabActivity()`.
- `src/components/globe/labs-layer.ts` — pure helper that converts `LabActivity[]` into `GlobePoint[]` with `meta.kind = "lab"`, size scaling, colour, zero-activity dim state.
- `src/components/labs/LabsPanel.tsx` — list view analogue.
- `src/components/labs/LabCard.tsx` — the click-card (or extend EventCard's switch to handle `meta.kind === "lab"`).
- `src/lib/data/__tests__/fetch-labs.test.ts` — schema + bucketing + scaling tests.
- `tests/visual/06-ai-labs.spec.ts` — Playwright smoke.

### Files to modify

- `src/lib/data-sources.ts` — add `AI_LABS_REGISTRY` and `GITHUB_REPO_EVENTS` (if not already typed) entries. Declare expected ranges on activity counts.
- `public/data-sources.md` — mirror the new source rows.
- `src/components/globe/Globe.tsx` — accept lab points, extend bucketing to recognise `meta.kind === "lab"`, new colour, legend update, filter-panel toggle wiring.
- `src/components/map/FlatMap.tsx` — same additive change for the leaflet variant.
- `src/components/dashboard/Dashboard.tsx` — register the new "AI Labs" panel + nav entry.
- `src/components/chrome/LeftNav.tsx` — 8th button: AI Labs (labs count badge).
- `src/components/globe/event-detail.tsx` — extend to render a lab card when the clicked cluster contains lab points.
- `.github/workflows/` — add or extend a cron that calls `/api/labs` every 6h (matches existing registry cadence).

### Data flow

```
data/ai-labs.json  ──┐
                     ├──▶ fetchLabActivity()
GH_TOKEN ───┐        │   · iterate labs
            ├──▶ /repos/{o}/{r}/events ──▶ 7d window filter ──▶ sum by lab ──▶ LabActivity[]
            │   (1 req per tracked repo)
            ▼
   (optional) Upstash Redis cache with 6h TTL (if provisioned)
                     │
                     ▼
             /api/labs ──▶ Dashboard ──▶ Globe dots (violet layer) + LabsPanel list
```

### Why no Redis dependency

Upstash is still not provisioned (session 7 carryover). The fetch path should work fully on the Next.js Data Cache (`fetch` with `revalidate: 21600` = 6h) + the CDN `s-maxage=1800`. Redis becomes an optional acceleration later, not a prerequisite.

## 5. Architectural Constraint Test

Non-negotiables from `CLAUDE.md`:

| Constraint | How this design satisfies it |
|---|---|
| Every displayed number has a verifiable public source | Lab coords cite a `hqSourceUrl` field. Activity counts trace to `https://github.com/{o}/{r}/commits` (public). |
| AI Pulse aggregates, does not score | Dot size is a raw event count with documented bucketing — not an invented "impact score". Legend explicitly labels what the size represents. |
| No synthetic / simulated data | Every dot = a real, curated lab at its verifiable HQ. Every size value = real GitHub events. Zero-activity = dim, never hidden with fake data. |
| Graceful degradation | API fails → last-known counts + staleness badge. Cold start → all dots at min-size. JSON malformed → schema validator rejects in CI, never reaches prod. |
| Deterministic detection only | No LLM, no inference. Curated list + deterministic event counting. |
| No per-request LLM calls | None. |
| Sanity checks pre-committed | `data-sources.ts` declares expected activity ranges (e.g. 10–5000 events / lab / week). Values outside → flagged in `/audit`, not silently accepted. |

**Potential failure mode this design still has:** a curated list is editorial. The choice of which 33 labs to include is a judgement call that affects what users see. Mitigation: (a) the list is committed to the repo — every change is a reviewable PR diff, (b) `public/data-sources.md` documents the curation criteria ("must have public GitHub org + ≥1 flagship AI repo + verifiable HQ location"), (c) inclusion/exclusion decisions are logged in the commit message so the history is auditable.

## 6. Out of Scope

- **Per-paper or per-researcher geocoding** — decisively ruled out by the two research briefs.
- **Automatic lab discovery.** The list is hand-curated. A future v2 might auto-surface new candidates based on AI-config repo activity, but that's not this session.
- **Activity weighting by event type** — beyond the initial event-type filter. All relevant events count 1; we don't weight a Release over a Push. Simpler, honest. Re-visit if users ask.
- **Historical time series** of lab activity. This session ships "last 7 days" only. Sparklines or longer windows: later.
- **Lab logos, branding, or photos** in the card. Text + counts only, matching the project's spare aesthetic.
- **Lab-to-lab arcs** (e.g. "DeepMind ↔ Meta FAIR researcher movement"). Separate feature, probably never.
- **"Top repos" rankings** inside a lab. The lab card lists the tracked repos with counts; no scoring.

## 7. Dependencies

- `GH_TOKEN` — already a Vercel env var, already used by the gh-events pipeline. No new secrets.
- Existing `fetch-events.ts` helpers (`fetchUser`, etc.) — reusable for the events fetch via a thin wrapper.
- Existing `Globe.tsx` bucket-plus-colour pipeline — extend, don't replace.
- Existing filter-panel component — one new checkbox.
- Existing LeftNav — one new button.
- No new external API beyond GitHub's public `/repos/{o}/{r}/events`.
- Curation work: 33-lab list with verified coords. ~60 minutes of one-time effort.

## 8. Estimated Complexity

**M** (medium).

Rationale:
- Data layer: new fetcher + new JSON + schema validator. **S**.
- Globe + FlatMap rendering: additive layer, no refactor of existing cluster logic. **S–M**.
- Panel + LeftNav + filter toggle: three small touches following existing patterns. **S**.
- LabCard: one new card type, reuses the EventCard frame. **S**.
- Tests: unit + Playwright smoke. **S**.
- Curation: finding verified HQ coords for 33 labs, confirming each has a public AI flagship repo. **S but detail-heavy**.

Total: ~4–6 implementation commits on a feature branch, fits within one session per the TDD protocol. No novel infrastructure, no new external services, no new secrets.

---

## Auditor checkpoint (pending)

Per `CLAUDE.md` dual-model build protocol, this PRD is the gate before `data-sources.ts` is touched and before any visual is designed. Human review (this conversation) is the Auditor surface.

**Specific review requests:**

1. **The editorial line.** Is "curated list of ~33 labs" a defensible product claim given AI Pulse's "aggregates, does not score" constraint? My position: yes, because the curation criteria are pre-committed and every dot has a traceable source. But if you read it as scoring-by-inclusion, we should tighten the source-registry copy.
2. **Violet / `#a855f7` as the new layer colour.** Works against the dark stage but cross-check against the existing legend (teal / slate / orange). Swap if it clashes.
3. **6h cron cadence.** Conservative to stay budget-safe. If you want near-real-time labs activity, revisit post-ship.
4. **List inclusion/exclusion from the grill:** IBM Research, Apple ML Research **dropped** (low public GH presence). Added: Mistral, DeepSeek, Alibaba Qwen, Stability AI, Sakana AI, AI21 Labs, Hugging Face, Allen AI / AI2, BAAI, IIT Bombay / IISc, xAI. Confirmed OK.

If any of the above want revision, flag now — cheaper than after the issues land.

---

## Next step on approval

Decompose into 5 issues at `docs/issues-ai-labs-layer.md`, ordered by dependency: curated JSON → activity fetcher → API route → globe/map layer → panel + nav + card. TDD per issue. Each issue lands as one commit on `feature/ai-labs-layer`, PR to `main` at the end.
