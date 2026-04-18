# HANDOFF — AI Pulse

## Current state (2026-04-18)

### Session 4 — geocoder expansion + `/audit` page shipped · awaiting user review

**Done this session:**
- **Geocoder dictionary 95 → ~225 entries.** Added second-tier cities globally (NA/EU/UK/Asia/Oceania/MEA/SA) + ~60 country-level centroids as fallbacks ("Germany" → [51.17, 10.45], "India" → [20.59, 78.96], "USA" → [39.5, -98.35], etc.). Longest-needle-wins tiebreak kept, so "san francisco" still beats "usa" for the same string.
  - **Live result: coverage 5% → 15%** (fresh prod snapshot: 78 received / 12 placeable). Hits the 15-25% target band on the low end; more aggressive uplift would require fuzzy matching or an actual gazetteer.
  - Commit `75d5e12`.
- **`/audit` page shipped.** Ported CodePulse scoring engine verbatim (framework-agnostic `score(content, catalogue)`) to `src/lib/audit/score.ts`. 82-pattern catalogue v3 served from `public/audit/catalogue.json` and fetched client-side on mount.
  - Page: paste CLAUDE.md → redundancy score (0-100), bucket label (clean/mostly clean/some redundancy/notable redundancy/severe), matched patterns sorted by weight with public source citations per match, estimated token cost (ceil(chars/4)), skipped-regex count.
  - Labelling hammered three ways — page copy, header chips ("deterministic pattern matching · no LLM calls · runs in your browser"), and per-match source links. No editorial judgement per CLAUDE.md non-negotiables.
  - Nav link added from main header.
  - Commit `75d5e12`.

**Live prod verification (2026-04-18):**
- `https://aipulse-pi.vercel.app/audit` — 200, renders, catalogue v3 loads.
- `/api/globe-events` — `eventsReceived: 78, eventsWithLocation: 12, locationCoveragePct: 15, windowSize: 12/15m` (cold-start building after deploy).
- `/api/status` — unchanged, three tools still operational.

**Honesty audit:** score engine is deterministic bytes-in/bytes-out (verifiable by reading `score.ts`); catalogue patterns each cite a public URL; no LLM is called anywhere on the page.

## Auditor checkpoints

| # | Checkpoint | Status | Notes |
|---|------------|--------|-------|
| 1 | data-sources.ts + Globe stub + health cards committed | REACHED (session 1) | |
| 2 | Globe renders with real data + health cards show live status | REACHED (session 2) | |
| 2.1 | OpenAI fix · rolling window · 6-metric ticker · lean cards | REACHED (session 3) | |
| 2.2 | Geocoder expansion (5% → 15% coverage) · `/audit` page with CodePulse engine | **REACHED — awaiting user review** | Prod live |
| 3 | Pre-launch review | NOT STARTED | |

## Open items — for review or next session

1. **Coverage is 15%, not 25%.** Substring match on free-text profile strings caps out without fuzzy matching. Next lever (when traffic warrants): add ISO-3166 code matching ("DE" → Germany centroid), diacritic-insensitive normalisation, and a small hand-curated alias list for common metros ("Bay Area", "NCR", "DMV"). Not hard; discrete PR.
2. **`/audit` is client-side only.** The catalogue JSON is fetched from the same origin; no user content ever leaves the browser. Worth a small note in the page copy before public launch for privacy-conscious users.
3. **`/audit` has no share / permalink.** Paste-only is fine for MVP but a `?content=` or `#gist=` mode would help when users want to cite a score.
4. **Cold-start globe sparsity.** Unchanged from session 3 — module cache resets on new Node serverless instances. First ~5 min after a redeploy shows fewer dots. Fix options: (a) Upstash Redis, (b) pre-seed on cold start, (c) relax relevance filter.
5. **Preview env still missing `GH_TOKEN`** — set before the first PR preview is relied on.
6. **`~/.secrets/populate-env.sh` doesn't know about `aipulse`** — extend with a branch that writes `GH_TOKEN=$(security find-generic-password -a neelagiri -s github-pat -w)` to `~/aipulse/.env.local`.
7. **Globe texture still on unpkg** — self-host before public launch.
8. **`GEMINI_API_KEY` not yet on Vercel** — only needed if `/audit` ever gets a deep-scan opt-in (not in Phase 1).
9. **Upstash Redis not provisioned** — current design uses Vercel Data Cache + module-scoped memory.

## Decisions made without Auditor sign-off — flag for review

- **Audit catalogue bundled as a static asset, not in `data-sources.ts`.** It's an internal dictionary ported from CodePulse, not a polled external feed, so it doesn't belong in the source registry. The patterns themselves each cite an external URL — that's the verification surface. If this is wrong, the fix is to add `audit-catalogue` as a self-referential source like `registry`.
- **Audit runs client-side.** Faster, cheaper, private by default. Trade-off: the pattern catalogue is public (anyone can read it by fetching `/audit/catalogue.json`). That's fine — the patterns are derived from a public system prompt repo anyway.
- **Geocoder country-level centroids.** A commit pinned to a country centroid is editorial ("this commit happened in Germany") when the profile only says "Germany". Accepted the trade because the globe was reading empty; the alternative of continuing to drop 95% of events was worse. UI copy doesn't claim city precision, only "placeable".

## Environment notes
- Prod URL: **https://aipulse-pi.vercel.app**
- Deploy: push to `main` via connected GitHub integration.
- `GH_TOKEN` on Vercel: Production + Development.
- Latest commit on main: `75d5e12 feat(audit): /audit page + geocoder dictionary expansion`.

## Next action (on resume)
1. Sanity-check `/audit` with a real CLAUDE.md paste — does the score feel right? Do the excerpts land where you expect?
2. Spot-check globe visual density now that coverage is 15% — with ~12 placeable / poll the globe should feel noticeably more alive than session 3.
3. Populate `.env.local` via extended `populate-env.sh` branch (open item #6) — still blocking local API-route dev.
4. If `/audit` and the globe both look right, next milestone is Phase 1 closeout: self-host globe texture, add `audit-catalogue` to the source registry if needed, then stamp Checkpoint 3 (pre-launch review).

## Files changed this session (session 4)
Modified (2):
- `src/lib/geocoding.ts` — dictionary 95 → ~225 entries, country centroids.
- `src/app/page.tsx` — header nav link to `/audit`.

New (4):
- `src/lib/audit/score.ts` — ported scoring engine (Pattern, Match, Scorecard, `score()`, `bucketForScore()`).
- `src/app/audit/page.tsx` — server component with metadata + layout shell.
- `src/components/audit/AuditClient.tsx` — client component: textarea, score pill, match list, source links.
- `public/audit/catalogue.json` — 82 patterns, v3 (copied from CodePulse).

Commit: `75d5e12`.
