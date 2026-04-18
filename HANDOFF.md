# HANDOFF — AI Pulse

## Current state (2026-04-18)

### Session 1 — scaffolding + Checkpoint 1

**Done:**
- Relocated project from `/Users/srinathprasannancs/CodePulse/aipulse/` to `~/aipulse/` (npm package name requires lowercase).
- `git init -b main` — repo initialised, zero commits yet.
- Next.js 16.2.4 scaffolded (App Router, Turbopack, TypeScript, Tailwind 4, ESLint, `src/` layout, `@/*` import alias).
- `npm run build` green on darwin-arm64 (reinstalled `@next/swc-darwin-arm64` after ENOSPC-corrupted binary).
- `docs/AI_PULSE_V3_SPEC.md` preserved.
- `CLAUDE.md` written — dual-model protocol, non-negotiables, rate limits, what-not-to-do.

**Pending (this session):**
- Install shadcn/ui + react-globe.gl + three.
- `src/lib/data-sources.ts` — typed endpoint registry.
- `public/data-sources.md` — transparency doc.
- Globe component stub (dynamic, ssr=false).
- 4 tool health card components.
- Initial + Checkpoint 1 commits.

## Auditor checkpoints

`/advisor` is not available in this workspace. Per the agreed interim protocol:
- Every checkpoint below is committed with `AUDITOR-REVIEW: PENDING` in the trailer.
- Nothing merges to a remote `main` until the user has reviewed. PRs are the review surface.
- HANDOFF.md tracks the current pending checkpoint.

| # | Checkpoint | Status |
|---|------------|--------|
| 1 | data-sources.ts + Globe stub committed | IN PROGRESS |
| 2 | Globe renders with real data + health cards show live status | NOT STARTED |
| 3 | Pre-launch review | NOT STARTED |

## Decisions made (without Auditor sign-off — flag for review)

1. **Project location:** `~/aipulse/` (lowercase, matches npm package naming).
2. **Stack versions:** Next.js 16.2.4 instead of spec'd 15 (create-next-app latest). React 19, Tailwind 4. **Auditor note:** Verify that react-globe.gl supports React 19.
3. **Turbopack on:** `--turbopack` flag enabled; darwin-arm64 native SWC binary required (already installed and verified).
4. **Spec stored at `docs/AI_PULSE_V3_SPEC.md`**, not repo root.

## Environment notes
- Disk is tight (5.6 GB free at session start after user cleaned). Keep an eye on it.
- GH_TOKEN not yet set as Vercel env var or repo secret — required before Actions pipeline.
- Upstash Redis not yet provisioned.
- Vercel project not yet created.

## Next action (on resume)
Install shadcn/ui, react-globe.gl, three. Then build `src/lib/data-sources.ts` with the Phase 0 validated sources.

## Files changed this session
- Created: `~/aipulse/` (new repo)
- Created: `~/aipulse/CLAUDE.md`
- Created: `~/aipulse/HANDOFF.md`
- Created: `~/aipulse/docs/AI_PULSE_V3_SPEC.md` (moved from old location)
- Created: Next.js scaffold (package.json, src/, public/, config files)
- Deleted: `/Users/srinathprasannancs/codepulse/aipulse/` (the original empty dir)
