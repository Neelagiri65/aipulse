# HANDOFF — AI Pulse

## Current state (2026-04-18)

### Session 5 — globe density + calmer dots · awaiting user review

**User report going in:**
> Only 20-25 dots visible; the globe looks broken. Dots pulsing is causing eye strain — want something like a World Monitor style, calm but alive.

**Done this session:**
- **4× rolling window + near-zero steady-state probe cost.**
  - `WINDOW_MINUTES` 15 → 60, cap 1000 → 5000. With a sustained ~10 placeable events per 30s poll, the window now accumulates ~200-400+ unique points at steady state instead of ~12-25.
  - New module-scoped `aiConfigCache` (`Map<owner/repo, boolean>`) that persists for the serverless instance lifetime. Every subsequent poll skips the Contents-API probe for any repo already classified. Probing cost after warm-up is dominated by brand-new repos only.
  - Contents-API `next.revalidate` 24h → 30d. Repos don't toggle `CLAUDE.md` / `.cursorrules` hourly.
  - Backfill pass on every poll recolours any cached point whose repo has since been classified as AI-configured. Covers (a) events emitted before their probe resolved, (b) repos that 403'd transiently and succeeded later.
  - Commit `d2a75c1`.
- **Calmer dots.**
  - `pointRadius` halved (0.4× → 0.18× multiplier); default sizes 0.5/0.8 → 0.35/0.7.
  - `pointAltitude` 0.02 → 0.005 — dots sit flush with the globe surface, no longer float.
  - `atmosphereAltitude` 0.15 → 0.12.
  - White dots softened to slate `#cbd5e1` — readable on dark globe, no harsh glare.
  - `pointsTransitionDuration={2500}` — dots fade in smoothly instead of popping on each poll.
  - Legend swatch halo halved + 60% alpha to match.
  - Commit `d2a75c1`.

**Live prod verification (fresh instance, 1 poll after deploy):**
- `/api/globe-events` returned `coverage.windowMinutes: 60`, `windowSize: 10`, `eventsReceived: 88`, `locationCoveragePct: 11%`, failures `0`.
- 10 points: 2 teal, 8 slate. Expect window to grow to 200+ over ~10-20 min of continuous polling.

**Honesty audit:** no data fabricated; dots that can't be classified still render as white (slate) instead of being dropped; cache is a cost optimisation not a signal change.

## Auditor checkpoints

| # | Checkpoint | Status | Notes |
|---|------------|--------|-------|
| 1 | data-sources.ts + Globe stub + health cards committed | REACHED (session 1) | |
| 2 | Globe renders with real data + health cards show live status | REACHED (session 2) | |
| 2.1 | OpenAI fix · rolling window · 6-metric ticker · lean cards | REACHED (session 3) | |
| 2.2 | Geocoder expansion + `/audit` page | REACHED (session 4) | |
| 2.3 | 60m window · permanent config cache · calmer visuals | **REACHED — awaiting user review** | Density uplift verifiable at next poll snapshot |
| 3 | Pre-launch review | NOT STARTED | |

## Open items — for review or next session

1. **Cold-start density.** The `aiConfigCache` and `eventCache` both reset on a new serverless instance. A cold globe will look thin for ~10-20 min of polling. When traffic justifies it: move these to Upstash Redis (free tier: 10k cmd/day, shared across instances) or pre-seed on module init with a synchronous first poll.
2. **Staleness trade-off for 30-day Contents cache.** A repo that adds `CLAUDE.md` mid-window won't reflect until the next cold start (or until it's manually invalidated). Acceptable for an aggregator; not acceptable for a per-repo audit timeline if that ever ships.
3. **Coverage still ~11-15%.** Session 4 geocoder expansion took us off the floor; the next lever is ISO country-code matching ("DE" → Germany), diacritic normalisation, and a hand-curated alias list ("Bay Area", "NCR"). Discrete PR.
4. **Event-type filter still excludes stars/forks/watches.** Deliberate (they spam without signal), but if density still feels thin after 60-min steady state, relaxing to include `ForkEvent`/`WatchEvent` would roughly double the raw funnel.
5. **Preview env still missing `GH_TOKEN`** — set before the first PR preview is relied on.
6. **`~/.secrets/populate-env.sh` doesn't know about `aipulse`** — extend with a branch that writes `GH_TOKEN` to `~/aipulse/.env.local`. Blocks local API-route dev.
7. **Globe texture still on unpkg** — self-host before public launch.
8. **`GEMINI_API_KEY`** — not needed unless `/audit` deep scan opt-in ships.
9. **Upstash Redis not provisioned** — see item #1.

## Decisions made without Auditor sign-off — flag for review

- **30-day Contents-API revalidate.** Trade-off documented above. The counter-argument is that an aggregator that lags real-world tool adoption by up to 30 days can no longer be called "real-time" — but since the dashboard's actual claim is event-level recency (per-poll refresh), and AI-config classification is a secondary layer, 30d feels safe. Reverting to 24h is a one-line change if needed.
- **Process-lifetime `aiConfigCache`.** Same trade-off; same one-line revert.
- **Slate (`#cbd5e1`) for "no AI config".** Technically editorialises by making the non-AI signal visually subordinate to the AI signal (which is brighter teal). Counter-argument: pure-white dots on a dark globe were causing actual eye strain per user report, so the call is readability-first.

## Environment notes
- Prod URL: **https://aipulse-pi.vercel.app**
- Deploy: push to `main` via connected GitHub integration.
- `GH_TOKEN` on Vercel: Production + Development.
- Latest commit on main: `d2a75c1 feat(globe): 60m window + permanent repo-config cache + calmer dots`.

## Next action (on resume)
1. Open the live dashboard after ~10-20 min of warm polling and visually confirm: (a) 200+ dots, (b) they no longer feel jarring, (c) teal-vs-slate ratio feels honest.
2. If density still looks thin, pull open item #4 (include `ForkEvent`/`WatchEvent`) or item #1 (Upstash-backed shared window).
3. Populate `.env.local` via extended `populate-env.sh` branch (item #6).
4. Phase 1 closeout: self-host globe texture (item #7), decide whether `audit-catalogue` needs a registry entry, then Checkpoint 3 (pre-launch review).

## Files changed this session (session 5)
Modified (3):
- `src/lib/data/fetch-events.ts` — 60m window, aiConfigCache, probe skip, colour backfill.
- `src/lib/github.ts` — pathExists revalidate 24h → 30d.
- `src/components/globe/Globe.tsx` — smaller/softer dots, slower transitions, legend glow halved.

Commit: `d2a75c1`.
