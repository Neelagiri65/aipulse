# PRD — Hacker News integration into THE WIRE

**Status:** AUDITOR-REVIEW: PENDING (no Auditor available; user is the review surface).
**Author:** Builder (Claude Code, session 16).
**Date:** 2026-04-20.
**Source approval:** APPROVED in session 14 (HANDOFF L212–223).

---

## Problem statement

THE WIRE is currently a GitHub commit log, not an observatory. A viewer
sees what is being **built** in real time but nothing about what is
being **discussed**. The GitHub event stream alone is half the AI
ecosystem signal — code activity without discourse.

Hacker News is the highest-signal English-language venue for AI
ecosystem discussion (launches, controversies, paper reactions,
contrarian takes). Two free unmetered APIs (Algolia search + Firebase
user endpoint) make it cheap to ingest. Adding HN stories into THE
WIRE — chronologically interleaved with GitHub events, distinctly
badged, click-through to the comments — turns the panel from a commit
log into a unified intelligence feed.

The map already plots GitHub events and registry repos; HN stories
whose author has a resolvable profile location should appear as a
third dot kind in the same flat-map view. Same data, two lenses.

## User story

> **As an** AI-watcher / dev / founder scanning the ecosystem,
> **I want** HN stories about AI tools, models, papers, and discourse
> to appear in THE WIRE alongside GitHub commits — chronologically
> interleaved, with a distinct `[HN · 342]` badge that links straight
> to the HN comments — and to see HN dots on the map wherever the
> author's profile resolves to a known location,
> **so that** I can monitor what's being built AND what's being
> discussed in one glance, with provenance preserved at every step.

## Acceptance criteria

1. **HN ingest cron runs every 15 min** at `:05/:20/:35/:50` past
   the hour. No collision with the four existing crons.
2. **Algolia search returns top 20 most-recent AI-relevant stories**
   per poll. AI relevance = deterministic keyword match against the
   curated allow-list (§Technical Approach), plus domain match.
   Soft-blacklist drops `crypto`, `girlfriend`, `nsfw` substrings.
3. **For each story, Firebase `/v0/user/{author}.json` is fetched
   exactly once** (results cached 7 days in `hn:author:{username}`)
   to extract `about` field; the existing `geocode()` is applied to
   that string.
4. **Each story written to Redis** as `hn:item:{objectID}` with EX
   86400 (24h), and added to the sorted set `hn:wire` with score =
   `created_at_i`. ZSET pruned to 24h on every poll
   (`ZREMRANGEBYSCORE`).
5. **Score refresh policy:** every poll re-fetches the same 20
   stories from Algolia; if an item already exists in `hn:item:*`,
   its `points`, `num_comments`, and `last_refresh_ts` are
   overwritten; `first_seen_ts` is preserved. Story climbing from 12
   → 500 points must visibly update.
6. **Stories deleted upstream** (Algolia returns no row, but Firebase
   would still 200) are dropped from `hn:wire` ZSET on the next
   reconciliation pass.
7. **Story without resolvable author location** appears in WIRE
   panel; **does not** appear on the map. Never approximated.
8. **HN row in WIRE** renders as
   `[HN · 342] Show HN: I built X with Claude Code   @author · 2h ago`
   — orange `HN` badge (HN brand), points inside the badge, no
   geotag glyph in the row, click-anywhere opens
   `news.ycombinator.com/item?id={objectID}` in a new tab.
9. **WIRE order** is strictly chronological by `created_at`/
   `created_at_i`, mixing GH and HN. No weighting, no grouping.
10. **HN map dot** is orange (visually distinct from GH event dots
    and registry dots). Hover card shows: title, points, comment
    count, author handle, resolved location label. Click opens HN
    comments page (same target as the WIRE row).
11. **Staleness indicator:** when last successful Algolia fetch is
    > 30 min old, the WIRE header shows
    `HN: last fetched Nm ago` in muted text. Below 30 min, no
    indicator. (GH side keeps its own `live · …` stamp unchanged.)
12. **Empty AI poll** (zero matches) is silent — no banner, no
    error, WIRE keeps showing whatever items remain in window.
13. **Source registry diff:** `HN_AI_STORIES` added to BOTH
    `src/lib/data-sources.ts` (with sanity ranges) and
    `public/data-sources.md` in the same commit. Two endpoints
    documented under one logical source. The two files must never
    drift (CLAUDE.md non-negotiable).
14. **Sanity ranges declared:** stories per 15-min window after AI
    filter ∈ `[0, 20]`; geocode resolution rate over 24h ∈
    `[15%, 35%]`. Out-of-range values flagged in commit history /
    HANDOFF, not silently absorbed.
15. **Privacy:** Redis stores only HN `username`, raw `location`
    string, and resolved `lat/lng`. Never the full `about` body, no
    other profile fields, no karma, no submission history.
16. **No LLM in the ingest path.** Filter is pure deterministic
    keyword + domain match. No sentiment scoring, no launch
    detection, no editorial classification.
17. **All endpoints fail soft.** Algolia 5xx → cached items remain
    visible. Firebase user 5xx → row appears, no map dot. Geocoder
    miss → row appears, no map dot. Upstash unreachable → WIRE
    panel renders GH-only with the staleness indicator showing the
    HN gap.
18. **Build + typecheck pass before merge.** `npm run build` clean.
19. **`HN_AI_STORIES` source counts as the 10th verified source**
    (was 9 at end of session 14).

## Technical approach

### Files added

```
src/lib/data/wire-hn.ts                    # ingest library
src/lib/data/hn-store.ts                   # Redis read/write helpers
src/app/api/wire/ingest-hn/route.ts        # cron-protected POST
src/app/api/hn/route.ts                    # public GET (polled by Dashboard)
.github/workflows/wire-ingest-hn.yml       # 15-min cron
```

### Files modified

```
src/lib/data-sources.ts                    # +HN_AI_STORIES entry
public/data-sources.md                     # +HN_AI_STORIES section
src/components/dashboard/Dashboard.tsx     # +useHnPoll, merge into WIRE + map
src/components/dashboard/WirePage.tsx      # +HN row variant, +staleness indicator
src/components/map/FlatMap.tsx             # +HN marker layer
src/components/globe/Globe.tsx             # +HN dot rendering (3D path)
```

### Data flow

```
[GitHub Actions cron] every 15min :05/:20/:35/:50
    └─> POST /api/wire/ingest-hn (INGEST_SECRET-protected)
        └─> wire-hn.ts:fetchAndStore()
            ├─> GET hn.algolia.com/api/v1/search_by_date
            │     ?tags=story&query=...&hitsPerPage=20
            ├─> filter: AI keywords + domain allowlist
            │            minus soft-blacklist substrings
            ├─> per-story: read hn:author:{username}
            │     miss → GET hacker-news.firebaseio.com/v0/user/{id}.json
            │            extract `about`, parse location, geocode
            │            → write hn:author:{username} EX 7d
            ├─> per-story: write/refresh hn:item:{objectID} EX 24h
            │            ZADD hn:wire <created_at_i> {objectID}
            ├─> ZREMRANGEBYSCORE hn:wire -inf <(now-24h)>
            └─> write hn:meta {last_fetch_ok_ts, last_error?, …}

[Dashboard.tsx] every 30s polls /api/hn  ←──────┐
    └─> hn-store.ts:readWireItems()             │
        ├─> ZRANGE hn:wire 0 -1                 │
        ├─> MGET hn:item:{ids}                  │
        ├─> MGET hn:author:{usernames}          │
        └─> assemble HnWireResult { items, points, meta }
                                              ──┘

[WirePage] receives events (GH) + hn (HN), merges by createdAt,
           renders discriminated rows.

[FlatMap / Globe] receives [...ghPoints, ...registryPoints, ...hnPoints].
```

### Redis schema

```
hn:item:{objectID}    JSON {
                        id, title, url, author,
                        points, num_comments,
                        created_at_i,            # epoch seconds
                        first_seen_ts,           # ISO, never overwritten
                        last_refresh_ts          # ISO, updated each poll
                      }
                      EX 86400

hn:author:{username}  JSON {
                        raw_location,            # string from `about`
                        lat?, lng?,              # null on geocode miss
                        resolved_at_ts,
                        resolve_status: "ok" | "no_location" | "geocode_failed"
                      }
                      EX 604800

hn:wire               ZSET, score = created_at_i, member = objectID

hn:meta               JSON {
                        last_fetch_ok_ts,
                        last_fetch_attempt_ts,
                        last_error?,
                        items_seen_total,
                        last_filter_pass_count   # for sanity-range tracking
                      }
```

### AI keyword allowlist (deterministic)

Title or URL host (case-insensitive) must contain one of:

```
claude, gpt, llm, openai, anthropic, gemini, mistral, llama, ollama,
cursor, copilot, langchain, huggingface, transformer, diffusion,
embedding, RAG, agent, agentic, MCP, vibe coding, AI coding,
windsurf, codex, devin, deepseek, qwen, stable diffusion, midjourney,
SDXL, fine-tuning, fine tuning, prompt engineering, AI safety,
alignment, RLHF, inference, quantization
```

Domain allowlist (URL host suffix match):

```
arxiv.org, huggingface.co, anthropic.com, openai.com, mistral.ai,
deepmind.com, deepmind.google, ai.google.dev, ai.meta.com, ollama.com,
langchain.com, llamaindex.ai, cursor.sh, codeium.com,
windsurf.dev
```

Soft blacklist (drop if title contains any, case-insensitive):
`crypto`, `girlfriend`, `nsfw`.

### Architectural constraint test

This feature must satisfy CLAUDE.md non-negotiables before merge.
Each is verified individually here:

| Constraint | How this PRD satisfies it |
|---|---|
| Every displayed number has a verifiable public source. | Points and comment counts come straight from Algolia. The orange `HN · 342` badge has provenance back to `hn.algolia.com` (documented in `data-sources.md`). |
| AI Pulse aggregates, it does not score. | No ranking, no sentiment, no editorial classification. Strict chronological order. The keyword filter is documented and pre-committed to the codebase. |
| No synthetic or simulated data on the globe. | Every HN dot is a real story whose author profile resolved to a known city. Geocode misses → no dot, never an approximation. |
| Graceful degradation is mandatory. | Algolia/Firebase 5xx → cached items remain. Geocode miss → row but no dot. Upstash unreachable → WIRE shows GH only + staleness indicator. |
| Deterministic AI config detection only. | (N/A to HN; HN's deterministic check is the keyword allowlist, also pre-committed.) |
| No per-audit LLM calls by default. | Zero LLM calls in the HN ingest path. |
| Sanity checks are pre-committed. | Two ranges declared in `data-sources.ts`: stories-per-poll ∈ [0, 20], geocode-rate ∈ [15%, 35%]. |
| **Cross-cutting (NEW):** every data source is geotagged where the source provides location at any level. | HN: author `about` field → geocoder. Documented as a principle below; will be proposed as an addition to spec Part 0. |

### Cross-cutting principle (new — to be added to spec Part 0)

> **Geotag everything geocodable.** Every data source the observatory
> ingests must be plotted on the map if the source provides location
> at *any* level: user profile (HN, GitHub), org HQ (HuggingFace
> models, npm packages), institution affiliation (ArXiv papers via
> OpenAlex), or feed origin (RSS, regional news). The map is the
> unified geographic lens across all data types; THE WIRE is the
> chronological lens. Same data, two views.
>
> **Auditor gate:** before any new data source ships, document its
> location resolution path in `public/data-sources.md` (or explicitly
> note "no location signal available" with reasoning). Sources without
> location can still ship — they simply won't appear on the map. Bias
> protection (queued anti-bias principle, HANDOFF L372–386) layers on
> top: every map view must show non-US/non-English coverage where the
> source supports it.

This PRD applies the principle to HN. Future PRDs (Models, Research,
Benchmarks, RSS) will apply it without re-deriving it.

## Out of scope (this PR)

- Dedicated HN panel. THE WIRE is the only surface.
- HN comment thread parsing. We link out; we do not summarise.
- Sentiment / launch / Show-HN classification beyond the badge label.
- Refactoring GH events from LIST → ZSET. Asymmetry stays for now.
- HN mention frequency surfaced in the Tools panel as a per-tool
  signal. **Future idea, do not build now.**
- Karma, submission history, account-reputation signals.
- HN flagged/dead detection beyond "Algolia drops it from results".
- Static JSON snapshot writer for `/archives`. Out of scope; queued
  separately (HANDOFF L264–266).
- HN poll types other than `story` (no `comment`, no `poll`, no
  `job`). Algolia query stays `tags=story`.
- Mobile responsive. Desktop-first per project rule.
- Self-hosted globe textures. Untouched.

## Dependencies

- **Existing:** Upstash Redis client, `INGEST_SECRET` env var,
  `geocode()` from `src/lib/geocoding.ts`, GitHub Actions cron
  infra, `usePolledEndpoint` hook, WIRE/Globe/FlatMap components.
- **External (new but free, no auth, no rate-limit publication):**
  Algolia HN search API, Firebase HN API.
- **No new npm packages.** No new env vars. No new secrets.
- **No DB migrations** (no Postgres in this stack).

## Estimated complexity: **M**

- ~6 new files, ~4 modified files.
- ~400–600 net LOC including tests.
- One new cron, one new public endpoint, one new ingest endpoint.
- New TypeScript discriminated union for WIRE rows and a small
  schema fan-out across three rendering surfaces (WIRE, FlatMap,
  Globe). The fan-out is the main risk — discriminated unions need
  exhaustive `switch` handling at three call sites.

**Why not S:** the cross-cutting `WireItem` type touches three
components and one new endpoint pair; a one-file change it is not.

**Why not L:** no infra change, no schema migration, no new external
dependency, no new auth, geocoder is reused as-is.

## Issue decomposition (preview — full doc separate)

To be expanded into `docs/issues-hacker-news.md` after PRD approval.
Sketch (each one Claude Code session, ≤5 files changed):

1. **HN-01:** `wire-hn.ts` library + `hn-store.ts` + sanity-range
   declaration in `data-sources.ts`. Vitest: keyword filter happy
   path + 2 edge cases (empty result, blacklist hit). No HTTP yet.
2. **HN-02:** `/api/wire/ingest-hn` route + GitHub Actions workflow
   + first end-to-end manual smoke (`?cap=5`).
3. **HN-03:** `/api/hn` public read route + `data-sources.md` diff
   + sanity-range observability.
4. **HN-04:** Dashboard wire-up + WirePage HN row variant +
   staleness indicator. Discriminated union introduced.
5. **HN-05:** FlatMap HN marker layer + Globe HN dot. Hover card
   variants. Map-only e2e (visual check).

Order is dependency-strict: each issue must merge before the next
starts. HN-01 through HN-03 deliver a working ingest pipeline with
no UI. HN-04 + HN-05 add the surfaces.

## Auditor-pending flags (lifted into HANDOFF on commit)

1. **Discriminated union sprawl.** `WireItem = GhWireItem |
   HnWireItem` will need to grow when Models/Research/RSS/Benchmarks
   join THE WIRE. Should we define a common base shape now (id,
   kind, createdAt, label, link, optional location) to constrain the
   sprawl? Builder default: yes, but introduce when the second non-GH
   source lands, not pre-emptively.
2. **Score-refresh write amplification.** ~20 writes per poll = ~2000
   writes/day for HN refresh. Negligible vs. 500k/mo Upstash ceiling
   today, but if Models/Research/Benchmarks adopt the same pattern,
   the cumulative cost matters. Track Upstash usage after HN ships.
3. **Algolia query string sensitivity.** A single permissive keyword
   (e.g., `agent` matching real-estate listings) could blow up the
   filter. Mitigation: monitor sanity-range violations — items > 20
   per poll = filter regression. Tighten then.
4. **Cross-cutting geotag principle is new.** Should land in spec
   Part 0 as a committed addition (not just this PRD) so future
   sources inherit it. Auditor sign-off needed on the spec edit.
5. **Geocoder reuse on HN about-field strings.** `geocode()` was
   tuned for GitHub-style profile locations ("San Francisco", "SF
   Bay Area", "Berlin, Germany"). HN `about` is freer-form prose
   ("Building things. Currently in NYC." or "🌍 remote"). Expect
   coverage at the lower end of the 15–35% sanity range until the
   dictionary expands. Not a blocker.

---

**On approval:** I'll write `docs/issues-hacker-news.md` and start
HN-01 on a feature branch `feature/hn-wire`. TDD per CLAUDE.md
Phase 2.
