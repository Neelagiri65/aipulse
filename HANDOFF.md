# HANDOFF — AI Pulse

## Current state (2026-04-18)

### Session 1 — Checkpoint 1 REACHED · awaiting user check-in

**Done this session:**
- Relocated project from `/CodePulse/aipulse/` to `~/aipulse/` (npm package name requires lowercase).
- `git init -b main`.
- Scaffolded Next.js 16.2.4 (App Router, Turbopack, TypeScript, Tailwind 4, ESLint, `src/` layout, `@/*` alias). Rebuilt `@next/swc-darwin-arm64` native binary after ENOSPC-corrupted install.
- Installed: `shadcn/ui` (card, badge, skeleton, button), `react-globe.gl` 2.37.1, `three`, `@types/three`, `@upstash/redis`.
- **CLAUDE.md** — dual-model protocol, non-negotiables, rate limits, what-not-to-do.
- **HANDOFF.md** — (this file).
- **src/lib/data-sources.ts** — typed data-source registry. Four sources verified (`gh-events`, `gh-contents`, `anthropic-status`, `openai-status`); three sources pending (`gh-issues-claude-code`, `github-status`, `cursor-status`).
- **public/data-sources.md** — human-readable mirror of the registry (transparency contract).
- **src/components/globe/Globe.tsx** — client-only Globe via `next/dynamic(..., { ssr: false })`. Legend overlay. "Awaiting data" overlay until Checkpoint 2 wires the poller.
- **src/components/health/ToolHealthCard.tsx** + `HealthCardGrid.tsx` + `tools.ts` — four tool cards (Claude Code, Cursor, Copilot, OpenAI API). Three-state rendering: `pending` (grey, source unverified), `awaiting` (amber, source verified but no data yet), `live` (green/amber/red based on status).
- **src/app/layout.tsx** — forced dark class, updated metadata.
- **src/app/page.tsx** — full shell layout: header with verified/pending source counts + methodology link, 3-column grid (Live feed placeholder · Globe · Health cards), footer.
- Build + typecheck + lint all green.

**No data is synthesised.** Globe renders empty. Health cards render the pending/awaiting states honestly. This is the trust contract.

## Auditor checkpoints

`/advisor` is not available. Every checkpoint carries `AUDITOR-REVIEW: PENDING` in the commit trailer. Nothing pushed to remote `main` yet.

| # | Checkpoint | Status | Notes |
|---|------------|--------|-------|
| 1 | data-sources.ts + Globe stub + health cards committed | **REACHED — awaiting user review** | First user check-in point per original brief. |
| 2 | Globe renders with real data + health cards show live status | NOT STARTED | Requires: Vercel Edge function for status polling, Upstash Redis provisioning, GH_TOKEN secret, GitHub Events poller, geolocation pipeline. |
| 3 | Pre-launch review | NOT STARTED | |

## Decisions made without Auditor sign-off — flag for review

1. **Project lives at `~/aipulse/`** (lowercase — npm requirement).
2. **Next.js 16.2.4 instead of spec'd 15.** create-next-app latest; App Router APIs unchanged; React 19.
3. **react-globe.gl peer dependency is `react: '*'`** — treated as compatible with React 19. No runtime failures in static gen.
4. **Globe uses Earth dark texture from unpkg** (`//unpkg.com/three-globe/example/img/earth-dark.jpg`). External dependency; consider self-hosting before launch.
5. **Three "pending" sources left in registry** (`gh-issues-claude-code`, `github-status`, `cursor-status`) rather than omitted. Dashboard shows them greyed with explicit "source pending verification" copy. Auditor: is this the right honesty framing, or should they be excluded entirely until verified?
6. **Cursor status page may not exist.** Currently registered speculatively at `status.cursor.com`. Needs investigation before Checkpoint 2.

## Environment notes
- Disk very tight (5.6 GB free at session start, cleaned mid-session).
- `GH_TOKEN` not yet set — required for Checkpoint 2 polling.
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — not yet provisioned.
- `GEMINI_API_KEY` — in Keychain, only used by `/audit` deep scan (not yet built).
- Vercel project not yet created. No remote git yet — `git remote -v` returns nothing.

## Next action (on resume — Checkpoint 2)
1. Verify the three pending sources manually (`gh-issues-claude-code`, `github-status` Copilot component, `cursor-status` existence). Commit the verification date into `data-sources.ts` for any that pass.
2. Provision Upstash Redis (free tier), set Vercel env vars.
3. Create `src/app/api/status/[tool]/route.ts` edge function — fetches status page JSON, caches in Redis 5 min, returns normalised `ToolHealthData`.
4. Create `src/app/api/globe-events/route.ts` edge function — fetches GitHub Events, runs AI-config probe via Contents API (24h Redis cache per repo), geocodes authors, returns `GlobePoint[]`.
5. Client-side `useSWR` or equivalent hook at 30s interval for events, 5-min interval for status.
6. Wire into `Globe` and `HealthCardGrid`.

## Files changed this session
Created (16): `CLAUDE.md`, `HANDOFF.md`, `docs/AI_PULSE_V3_SPEC.md`, `src/lib/data-sources.ts`, `src/lib/utils.ts` (shadcn), `public/data-sources.md`, `src/components/globe/Globe.tsx`, `src/components/health/ToolHealthCard.tsx`, `src/components/health/HealthCardGrid.tsx`, `src/components/health/tools.ts`, `src/components/ui/{button,card,badge,skeleton}.tsx`, `components.json`, `next.config.ts`, `tsconfig.json`, all scaffold files.
Modified (2): `src/app/layout.tsx` (dark + metadata), `src/app/page.tsx` (full shell layout).
Deleted (1): `/Users/srinathprasannancs/codepulse/aipulse/` stub dir (the stranded CWD).
