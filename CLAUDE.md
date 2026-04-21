# AI Pulse — Project Instructions

The real-time observatory for the global AI ecosystem. Aggregates publicly verifiable data. Editorialises nothing. Every number on the dashboard traces to a source.

## Where the intelligence lives (public vs private)

Code is public. Editorial intelligence is private. The split matters for every file you touch.

- **Public (this repo):** framework code, API routes, cron workflows, data-source _types_ (`src/lib/data-sources.ts`), the curated labs JSON shipped at build time (`data/ai-labs.json`), the public transparency summary (`public/data-sources.md`), the shipped spec principles (`docs/AI_PULSE_V3_SPEC.md`).
- **Private (`~/Obsidian/agent-vault/projects/aipulse/`, gitignored here):** session handoffs (`HANDOFF.md`, `docs/handoff-archive.md`), design spec v2 (`docs/design-spec-v2.md`), per-feature PRDs (`docs/prd-*.md`), research findings (`docs/research-*.md`). These contain curation rationale, roadmap, and dead-end evaluations — not code.

## First read, in order
1. `docs/AI_PULSE_V3_SPEC.md` — the north-star spec (Parts 0–12). Non-negotiables in Part 0 and Part 1.
2. `~/Obsidian/agent-vault/projects/aipulse/HANDOFF.md` — where the last session ended. (Lives in the agent vault, not this repo — see "Where the intelligence lives" above.)
3. `src/lib/data-sources.ts` — typed endpoint registry with sanity ranges and caveats. This is the source of truth.
4. `public/data-sources.md` — the public transparency summary (source names + governance only; endpoint URLs and sanity ranges stay in `data-sources.ts`).

## Non-negotiables (architectural constraint tests)
- **Every displayed number has a verifiable public source.** If it can't be cited, it doesn't ship.
- **AI Pulse aggregates, it does not score.** No invented rankings, no LLM-generated "trust scores". The only scoring engine is `/audit` (CLAUDE.md checker ported from CodePulse) and it is clearly labelled as deterministic pattern matching.
- **No synthetic or simulated data on the globe.** Every dot is a real, verifiable event from a public API.
- **Graceful degradation is mandatory.** If a source is down, show grey card + "last known value" + timestamp. Never fabricate.
- **Deterministic AI config detection only.** File existence checks (`CLAUDE.md`, `.cursorrules`, etc.) — never an LLM inferring "looks AI-generated".
- **No per-audit LLM calls by default.** Deep scan is opt-in with the user's own key.
- **Sanity checks are pre-committed.** Each metric has an expected range (declared in `data-sources.ts`). If data falls outside, investigate the source before shipping the number.

## Dual-model build protocol

This project runs Builder / Auditor. Builder (me, Claude Code) implements. Auditor (Opus via `/advisor` or human review) challenges every checkpoint.

Checkpoints where Auditor review is mandatory:
1. Before adding any new data source to `data-sources.ts`.
2. Before displaying any metric on the dashboard.
3. Before designing any visual representation.
4. Before making any claim in UI copy.
5. Before each phase gate (phases defined in spec Part 8).

**While `/advisor` is unavailable in this workspace:** Builder proceeds solo, flags every checkpoint explicitly in the vault `HANDOFF.md` and commit messages with `AUDITOR-REVIEW: PENDING`. Nothing merges to `main` until the user has reviewed. PRs are the review surface.

## Stack (locked, decided 2026-04-18)
- **Framework:** Next.js 16.2 (App Router, Turbopack). Scaffolded with React 19.
- **Styling:** Tailwind 4 + shadcn/ui.
- **Globe:** react-globe.gl + three.js, loaded via `next/dynamic` with `ssr: false`.
- **Edge:** Vercel Edge Functions for polling proxies (CORS, auth key injection).
- **Cache:** Upstash Redis free tier (10k cmd/day, 24h TTL for GH Events, 5-min TTL for status pages).
- **Workers:** GitHub Actions cron for scheduled aggregation (writes static JSON to `data/`).
- **Data layer:** Static JSON in `data/` + Redis for live events. No Postgres.
- **LLM:** Gemini 2.5 Flash only for `/audit` deep scan, opt-in with user's own key.
- **Tests:** Vitest for unit, Playwright for e2e (to be added when first real logic lands).

## Out of scope for Phase 1 (MVP, see spec Part 8)
Everything beyond: Globe + 4 tool health cards + live event feed + 6-metric ticker + `/audit` page. No agents layer, no market layer, no regulation layer, no community sentiment until Phase 1 ships with Auditor sign-off.

## Build discipline
- **One checkpoint per PR.** Don't merge multiple checkpoints in one PR.
- **TDD when logic has branching behaviour.** Component stubs don't need tests; polling/caching/filter logic does.
- **Commit after every successful step.** Never commit broken code. Build + typecheck before every commit.
- **`data-sources.ts` is the source of truth.** A new source means: (a) full entry in `src/lib/data-sources.ts` with sanity check + verifiedAt, (b) a name-only line in `public/data-sources.md` under the right category. The public summary never exposes endpoint URLs, sanity bounds, or caveats — those stay in the typed registry.
- **Update the vault `HANDOFF.md` at session end** (`~/Obsidian/agent-vault/projects/aipulse/HANDOFF.md`). State + next action + Auditor-pending items. Commit both the aipulse repo and the vault repo before the session ends.

## Rate limits to respect
- GitHub Events API: **5000 req/hr authenticated** (via `GH_TOKEN` repo secret), 60 req/hr unauthenticated.
- Anthropic status page: no documented limit — poll every 5 min max.
- OpenAI status page: no documented limit — poll every 5 min max.
- Upstash Redis free tier: 10k commands/day → budget polling + cache reads accordingly.

## Secrets
- `GH_TOKEN` — GitHub personal access token, repo secret for Actions + Vercel env var. Never in client code.
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — Vercel env vars only.
- `GEMINI_API_KEY` — only used by `/audit` deep scan, and that call is server-side from the user's session, never bundled.
- Read from macOS Keychain via `security find-generic-password` when populating `.env.local` locally.

## What NOT to do
- Never call an LLM to detect AI tool usage — use file presence only.
- Never synthesise globe events. If the GH Events API is empty/down, show empty + timestamp.
- Never display a number without a `source` field in the underlying data.
- Never recalibrate a metric to make the narrative look better. If the data disproves the thesis, ship the data honestly (CodePulse V1 lesson).
- Never bypass the Auditor checkpoints, even when no Auditor is available — flag it, don't skip it.
