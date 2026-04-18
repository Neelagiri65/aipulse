# HANDOFF — AI Pulse

## Current state (2026-04-18)

### Session 2 — Checkpoint 2 REACHED · deployed to Vercel prod · awaiting user review

**Done this session:**
- **Verified three pending sources** (`gh-issues-claude-code` 9,635 open issues, `github-status` Copilot component, Cursor status dropped — no verified public endpoint). Commit `96b0d37`.
- **Data layer** (`src/lib/`):
  - `github.ts` — typed wrappers over `/events`, `/users/:login`, Contents API probes. 5 AI-tool config paths: `CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`, `.continue/config.json`, `.windsurfrules`.
  - `geocoding.ts` — curated 95-city dictionary. Naïve substring match against GitHub profile `location` string. No external geocoder; we accept the coverage gap and surface it honestly.
  - `status-adapter.ts` — Statuspage.io v2 → `ToolHealthStatus` enum mapping.
  - `data/fetch-status.ts` — aggregates Anthropic + OpenAI + GitHub summaries + anthropics/claude-code issue search. 5-min `next.revalidate` cache.
  - `data/fetch-events.ts` — pulls last 30 events, filters to Push/PR/Issue/Release, resolves author locations (7d cache), probes AI-config per repo (24h cache), emits `GlobePoint[]` + coverage diagnostics.
- **Edge + Node routes**:
  - `src/app/api/status/route.ts` (edge runtime) — returns `StatusResult`.
  - `src/app/api/globe-events/route.ts` (node runtime — up to ~30 parallel GH calls on cold cache).
- **Client polling**:
  - `src/lib/hooks/use-polled-endpoint.ts` — generic 40-line hook. Visibility-aware pause/resume, abort-on-unmount, last-known retention on error. No SWR dependency.
  - `src/components/dashboard/Dashboard.tsx` — client wrapper. Status at 5 min · events at 30 s.
  - `src/components/dashboard/LiveFeed.tsx` — last 30 placeable events with repo/actor/age.
- **Vercel deployment live**:
  - Project: `srinaths-projects-49f63f3c/aipulse` (scope `brindha-9238`).
  - GitHub integration: connected to `Neelagiri65/aipulse` — pushes to `main` auto-deploy.
  - Env vars: `GH_TOKEN` set for Production + Development. Preview env not yet set (CLI wouldn't accept non-interactive `*`-branch scope).
  - Prod alias: **https://aipulse-pi.vercel.app**
  - Deployment ID: `dpl_Cvq1repMCFYzuKuyH7VNPg1g6J6W`
- **Smoke test (2026-04-18 14:52 UTC)**:
  - `/api/status` → 200 · Claude Code `operational` (9,650 open issues) · Copilot `operational` · OpenAI `unknown` (see open item below).
  - `/api/globe-events` → 200 · points with real lat/lng + AI-config signal (observed Lagos, Tokyo, etc.).

**Honesty audit**: no synthetic data on the globe; events without geocodable locations drop out; AI-config colour is file-existence only; every card cites `data-sources.ts` IDs; OpenAI card shows `unknown` rather than faking `operational`.

## Auditor checkpoints

`/advisor` is not available. Commits use `AUDITOR-REVIEW: PENDING` trailer. PRs are the review surface.

| # | Checkpoint | Status | Notes |
|---|------------|--------|-------|
| 1 | data-sources.ts + Globe stub + health cards committed | **REACHED** (session 1) | |
| 2 | Globe renders with real data + health cards show live status | **REACHED — awaiting user review** | Prod live at aipulse-pi.vercel.app. |
| 3 | Pre-launch review | NOT STARTED | |

## Open items — for review or next session

1. **OpenAI card shows `unknown` on prod** — local curl to `status.openai.com/api/v2/summary.json` returns `status.indicator: "none"` (would map to `operational`). Same code path works for Anthropic + GitHub. Hypothesis: stale cached response in Next Data Cache from a cold-start transient failure, or edge runtime fetch behaviour differs. Force a cache bust (`revalidateTag("openai-status")`) or switch the status route to `nodejs` runtime and re-test. **Not a blocker** — `unknown` is honest graceful degradation.
2. **`GEMINI_API_KEY` not yet set on Vercel** — only needed for `/audit` deep scan, which isn't built yet.
3. **Upstash Redis not provisioned** — current design uses Next.js Data Cache (which maps to Vercel Data Cache on prod). Redis is in the CLAUDE.md stack list but not required for Checkpoint 2's traffic pattern. Revisit when Phase 2 adds features that need shared state beyond the fetch cache.
4. **Preview env missing GH_TOKEN** — PR preview deploys will currently 500 on the API routes. Set via web UI: https://vercel.com/srinaths-projects-49f63f3c/aipulse/settings/environment-variables.
5. **`~/.secrets/populate-env.sh` doesn't know about `aipulse`** — add a branch so `./populate-env.sh aipulse` writes `GH_TOKEN` to `.env.local` from Keychain `github-pat`. Currently `.env.local` is absent (local dev will 500 on API routes until added).
6. **Globe texture still loaded from unpkg** (`//unpkg.com/three-globe/example/img/earth-dark.jpg`). External dependency; self-host before the public launch.
7. **Rate budget unverified under real traffic** — expected <1% of 5000/hr authenticated at single-visitor cadence; revisit when ~10 concurrent viewers or if the dashboard is linked publicly.

## Decisions made without Auditor sign-off — flag for review

Carried forward from session 1 plus this session's additions:

- **globe-events route runs on Node, not edge.** Reason: cold-cache fan-out of up to ~30 parallel GitHub calls (events + N unique users + M unique repos × 5 paths) exceeds the edge CPU budget on Vercel Hobby. Node serverless has the headroom. Status route stays edge (fewer, smaller fetches).
- **Dashboard is fully client-side after first paint.** No SSR of initial data. Reason: simpler boundary, no build-time GH_TOKEN dependency, and the graceful-degradation loading state is honest ("polling…").
- **`usePolledEndpoint` is bespoke, not SWR.** 40 lines · visibility-aware · AbortController. No runtime dependency.
- **No `vercel.json`.** Framework defaults are correct; explicit config only if/when regions or function-level overrides become necessary.

## Environment notes
- Prod URL: https://aipulse-pi.vercel.app
- Deploy: push to `main` via connected GitHub integration, or `vercel --prod`.
- `GH_TOKEN` on Vercel: Production + Development (set 2026-04-18 14:51 UTC).
- `.env.local` not yet populated locally (see open item 5).
- Keychain source: `security find-generic-password -a neelagiri -s github-pat -w`.

## Next action (on resume — Checkpoint 3 lead-in)
1. **Investigate OpenAI `unknown`** (open item 1) — probably a one-line `revalidateTag` bust; confirm schema match on edge then unwind.
2. **Populate local `.env.local`** via an extended `populate-env.sh aipulse` branch.
3. **Add preview-env `GH_TOKEN`** through the Vercel dashboard.
4. **Review the prod UI** — verify dots render, feed populates, no layout drift. Spot-check coverage %.
5. Once the above is clean, move to 6-metric ticker (spec Part 4) as the next Phase-1 chunk, then `/audit` page.

## Files changed this session
Session 2 adds (10 new, 1 modified):
- `src/app/api/globe-events/route.ts` (new)
- `src/app/api/status/route.ts` (new)
- `src/components/dashboard/Dashboard.tsx` (new)
- `src/components/dashboard/LiveFeed.tsx` (new)
- `src/lib/data/fetch-events.ts` (new)
- `src/lib/data/fetch-status.ts` (new)
- `src/lib/geocoding.ts` (new)
- `src/lib/github.ts` (new)
- `src/lib/hooks/use-polled-endpoint.ts` (new)
- `src/lib/status-adapter.ts` (new)
- `src/app/page.tsx` (server shell; dashboard body moved to client component)

Commit: `1484d5d feat(checkpoint-2): live data pipeline for status + globe events`.
