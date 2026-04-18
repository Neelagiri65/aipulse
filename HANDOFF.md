# HANDOFF — AI Pulse

## Current state (2026-04-18)

### Session 3 — Checkpoint 2 polish + ticker shipped · awaiting user review

**Done this session:**
- **Fixed OpenAI `unknown` status** (open item #1 from session 2).
  - Root cause: edge-runtime fetch to `status.openai.com/api/v2/summary.json` on Vercel returned a shape that bypassed the indicator map (no failure raised; summary parsed but the field didn't match the enum).
  - Fix: switched `/api/status` from `edge` to `nodejs` runtime to match `/api/globe-events`. Post-deploy: `operational` returns correctly.
  - Also added a diagnostic — when `overallStatus` falls through to `unknown` for OpenAI, the raw indicator + page name is pushed into `failures` so any future upstream drift is visible in the response instead of silently unknown.
  - Commit `ec9c915`.
- **Rolling 15-minute event window** (feedback: "5 dots looks empty").
  - Module-scoped `Map<eventId, CachedPoint>` on each warm Node serverless instance. Each poll merges fresh placeable events, prunes >15m, caps at 1000 entries. Single-threaded JS guarantees no write races.
  - Coverage diagnostics split: `eventsReceived` / `eventsWithLocation` / `locationCoveragePct` are last-poll metrics; `windowSize` / `windowAiConfig` / `windowMinutes` describe the accumulated view.
  - Cold-start instances rebuild the window over ~5 min of polling. Within a single warm instance the globe shows accumulated dots, not just the latest 30.
  - Commit `2284be6`.
- **6-metric bottom ticker** (`src/components/dashboard/MetricTicker.tsx`).
  - Every cell cites source IDs via links to the verified public endpoint. Metrics: Claude Code open issues (gh-issues-claude-code) · Placeable events 15m window (gh-events) · Repos with AI config + % (gh-contents) · Tools operational ratio (anthropic/openai/github-status) · Geocoder coverage % last poll (gh-events) · Sources verified (registry).
  - Tone (emerald/amber/rose) reflects status for tools-operational and coverage cells. Others stay neutral to avoid implied editorial.
  - Commit `2284be6`.
- **Leaner health cards** (feedback: "lots of — dashes read as broken").
  - Dropped placeholder rows for uptime, version, sentiment. Cards now render status dot + source citation by default; Open Issues row only appears when a value is present (Claude Code only right now).
  - `ToolHealthData` type retains the fields for future use — change is render-side only.
  - Commit `2284be6`.
- **Per_page bump to 100** (GitHub /events max) — commit `58047cf`.
  - ~3x wider funnel to the geocoder. Observed: `eventsReceived` rose from 30 → 86-89 per snapshot. Placeable events rose from ~1 per poll to ~5 per fresh snapshot.
  - Rate-budget impact is minor: unique-repo dedupe + 24h Contents API cache keeps us well under 5000/hr authenticated.

**Live prod verification (2026-04-18 15:09-15:17 UTC):**
- `/api/status` — all three tools `operational`, Claude Code `openIssues: 9653`. No failures.
- `/api/globe-events` — window builds to ~40-60 dots after ~15 min (cold start → 6 dots after ~3 min observed, growing linearly).

**Honesty audit:** no synthetic data; OpenAI fixed without faking; ticker cites every number; health cards no longer pretend to have fields they don't. Trust contract intact.

## Auditor checkpoints

| # | Checkpoint | Status | Notes |
|---|------------|--------|-------|
| 1 | data-sources.ts + Globe stub + health cards committed | REACHED (session 1) | |
| 2 | Globe renders with real data + health cards show live status | REACHED (session 2) | |
| 2.1 | OpenAI fix · rolling window · 6-metric ticker · lean cards | **REACHED — awaiting user review** | Prod live at aipulse-pi.vercel.app |
| 3 | Pre-launch review | NOT STARTED | |

## Open items — for review or next session

1. **Cold-start globe sparsity.** Module cache resets on new Node serverless instances. First ~5 min after a redeploy or cold start show fewer dots. Fixes (pick one when traffic warrants): (a) move the window to Upstash Redis so it survives across instances, (b) pre-seed the cache during module init with a synchronous first poll, (c) expand the geocoder dictionary to include country-level matches so more raw events become placeable.
2. **Geocoder hit rate is ~5-6%** (95-city dictionary · substring match against GitHub profile free-text). A pragmatic uplift would be country-level fallbacks ("Germany" → centroid; "USA" → centroid) and ~50 more cities. Not hard; just a discrete PR.
3. **Preview env still missing `GH_TOKEN`** — set via https://vercel.com/srinaths-projects-49f63f3c/aipulse/settings/environment-variables before the first PR preview is relied on.
4. **`~/.secrets/populate-env.sh` doesn't know about `aipulse`** — extend with a branch that writes `GH_TOKEN=$(security find-generic-password -a neelagiri -s github-pat -w)` to `~/aipulse/.env.local`. Blocks local dev of the API routes until done.
5. **Globe texture still on unpkg** — self-host before public launch.
6. **`GEMINI_API_KEY` not yet on Vercel** — only needed when `/audit` deep scan lands.
7. **Upstash Redis not provisioned** — current design uses Vercel Data Cache. Revisit when Phase 2 adds features needing shared state.

## Decisions made without Auditor sign-off — flag for review

- **Status route moved from edge to nodejs.** Consistency with globe-events, avoids an unexplained edge-fetch quirk. Latency impact negligible behind the 5-min Data Cache.
- **Rolling window lives in module-scoped memory, not Redis.** Cheap, stateless, rebuilds within 5 min of polling on any warm instance. If multi-instance density becomes a problem, item #1 above has three escape hatches.
- **Ticker includes a "registry" citation for sources-verified.** Self-referential but honest — the count comes from `data-sources.ts`, not an external feed.
- **Per_page bumped to 100.** Within the documented API limits. Adds maybe 10-20 extra Contents-API probes per fresh snapshot, dominated by the 24h cache.

## Environment notes
- Prod URL: **https://aipulse-pi.vercel.app**
- Deploy: push to `main` via connected GitHub integration.
- `GH_TOKEN` on Vercel: Production + Development.
- Latest commit on main: `58047cf feat(events): bump per_page to 100 (GitHub max)`.

## Next action (on resume — Phase 1 closeout lead-in)
1. Expand geocoder dictionary to lift coverage from ~5% → ~15-25% (open item #2).
2. Populate `.env.local` via extended `populate-env.sh` branch (open item #4) to enable local API route testing.
3. Spot-check the live UI — ticker rendering, coverage growth, feed animation smoothness — before moving to `/audit`.
4. Once the above is clean, `/audit` page (spec Part 7): CLAUDE.md/Cursor/Copilot config file detection against a user-submitted GitHub URL. Deterministic pattern matching only — no LLM unless the user opts into deep scan with their own Gemini key.

## Files changed this session (session 3)
Modified (3):
- `src/app/api/status/route.ts` — runtime nodejs.
- `src/lib/data/fetch-status.ts` — raw-indicator diagnostic for OpenAI.
- `src/lib/data/fetch-events.ts` — rolling 15-min window + coverage split.
- `src/components/dashboard/Dashboard.tsx` — ticker wired in, coverage badge updated.
- `src/components/health/ToolHealthCard.tsx` — dropped placeholder rows.
- `src/lib/github.ts` — per_page 30 → 100.

New (1):
- `src/components/dashboard/MetricTicker.tsx` — 6-metric cited ticker.

Commits: `ec9c915`, `2284be6`, `58047cf`.
