# AI Pulse — Data Sources

This is the transparency contract. Every number on the AI Pulse dashboard traces back to one of the sources below. Every source is publicly accessible. If a source cannot be verified, the dashboard renders a grey "last known value" state with a timestamp rather than fabricating or omitting the metric silently.

The machine-readable mirror of this document lives at [`src/lib/data-sources.ts`](../src/lib/data-sources.ts). The two files are kept in sync — adding a source in one without the other is a bug.

---

## Verified sources (safe to consume)

### GitHub Events API
- **ID:** `gh-events`
- **Public URL:** https://docs.github.com/en/rest/activity/events
- **API endpoint:** `https://api.github.com/events`
- **Response format:** JSON
- **Update frequency:** Realtime (8-page poll every 5 min via GH Actions → Vercel → Redis)
- **Rate limit:** 5,000 requests per hour authenticated · 60 unauthenticated. 8 pages × 12 polls/hr = 96 authenticated requests/hr — comfortably under budget.
- **Auth:** GitHub personal access token (server-side only)
- **What it measures:** Public GitHub events across every public repository. The globe accepts nine event types: `PushEvent`, `PullRequestEvent`, `IssuesEvent`, `IssueCommentEvent`, `PullRequestReviewEvent`, `ReleaseEvent`, `CreateEvent`, `ForkEvent`, `WatchEvent`. The endpoint returns a firehose sample, not the full stream.
- **Sanity check:** An 8-page poll should return ~500–800 events. Expected range: 100–800 events per multi-page poll. Zero indicates rate-limit exhaustion or GitHub outage — investigate before attributing to a slow day.
- **Caveat:** Events do not carry geolocation. Location is resolved from the author's GitHub profile city/country field (optional). Typical placement coverage is 15–25% of raw events. Low density between polls is filled in by GH Archive hourly dumps (see `gharchive`). The same buffer also feeds `repo-registry` via the events-backfill discovery path — every repo seen in the last 240 minutes whose meta carries `hasAiConfig=true` becomes a registry candidate, re-using the live pipeline's AI-config probe at zero new Search-API cost.
- **Powers:** Globe activity dots · live event feed · repo registry (events-backfill)
- **Last verified:** 2026-04-18

### GH Archive — hourly public-event dumps
- **ID:** `gharchive`
- **Public URL:** https://www.gharchive.org
- **API endpoint:** `https://data.gharchive.org/{YYYY-MM-DD-H}.json.gz`
- **Response format:** JSON Lines, gzipped
- **Update frequency:** Hourly (published ~30 min after the hour ends; current hour is always skipped)
- **Rate limit:** None documented on the static gzip CDN. Cold-start backfill fetches at most 6 hours (~900 MB gzipped worst case, typically <200 MB after type filtering).
- **Auth:** None
- **What it measures:** Hourly archive of every public GitHub event — complete, unsampled. AI Pulse uses it only to backfill the globe on cold start (empty Redis) so the last 6 hours of real activity appear immediately rather than trickling in over two hours.
- **Sanity check:** Each hour file decompresses to ~100–150 MB and yields 20,000–80,000 events across our nine relevant types (after inline filter). A successful fetch returns HTTP 200 with `content-type: application/gzip`. Expected range: 5,000–200,000 relevant events per hour file.
- **Caveat:** Archive events carry `sourceKind='gharchive'` internally; they are real events with real `created_at` timestamps, not synthesised. This page surfaces the distinction so users can see which portion of the globe comes from live polls vs hourly dumps. Live-API events take precedence on dedupe (same event id).
- **Powers:** Globe cold-start backfill
- **Last verified:** 2026-04-18

### GitHub Contents API
- **ID:** `gh-contents`
- **Public URL:** https://docs.github.com/en/rest/repos/contents
- **API endpoint:** `https://api.github.com/repos/{owner}/{repo}/contents/{path}`
- **Response format:** JSON
- **Update frequency:** Event-driven (globe) / six-hourly (registry verifier)
- **Rate limit:** 5,000 per hour authenticated — globe cache is 30d, registry verifier does one call per candidate per run
- **Auth:** GitHub personal access token
- **What it measures:** Two uses, both deterministic. **(1) Globe pipeline** — file existence check for AI tool configs (`CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`, `.continue/`, `.windsurfrules`). **(2) Registry verifier** — the first 500 bytes of those same files, shape-matched against pre-committed heuristics (markdown headers, instruction verbs, role labels, code references). Neither use calls an LLM.
- **Sanity check:** Response is 200 with file metadata (size, encoding, content) or 404 when absent. Files over 1 MB return `encoding: "none"` and an empty content field — the verifier records "file too large" and the repo is skipped. Any other status indicates a source change.
- **Caveat:** File renames (e.g., `.cursorrules` deleted and `CLAUDE.md` created within 7 days) are treated as migration signals only when both deltas are observed in-window. Never inferred from a single snapshot. The registry verifier's shape scorer is deterministic pattern match — it scores content, it never interprets it.
- **Powers:** Globe colour coding · migration arcs · repo registry
- **Last verified:** 2026-04-18

### GitHub Code Search (filename discovery)
- **ID:** `gh-code-search`
- **Public URL:** https://docs.github.com/en/rest/search/search#search-code
- **API endpoint:** `https://api.github.com/search/code?q=filename:CLAUDE.md`
- **Response format:** JSON
- **Update frequency:** Every 6 hours (cron) + manual dispatch for seed sweeps
- **Rate limit:** 30 requests per minute authenticated (1,800/hr). A full seed sweep (6 filenames × 10 pages = 60 calls) finishes in ~2 min at max burst. Cron runs use 3 pages × 6 kinds = 18 calls, well clear of the limit.
- **Auth:** GitHub personal access token
- **What it measures:** Finds public repositories that contain one of six known AI-tool config filenames on their default branch: `CLAUDE.md` (Anthropic Claude Code), `AGENTS.md` (OpenAI Codex convention), `.cursorrules` (Cursor), `.windsurfrules` (Windsurf), `.github/copilot-instructions.md` (Copilot), `.continue/config.json` (Continue). The Search API returns repo + path only; candidates are then fetched via the Contents API and shape-verified before entering the registry.
- **Sanity check:** A full seed sweep should return 3,000–8,000 unique candidate repos (before dedupe by name). Expected range: 100–10,000 candidates per full sweep. Shape verification typically passes 60–80% of candidates. Zero on any single filename indicates query-shape drift or rate-limit kick — investigate before attributing to a dead convention.
- **Caveat:** Search scope is every public repo the token owner can access (all public code by default for classic PATs). A candidate is not promoted to a registry entry until its content passes the deterministic shape heuristic in `config-verifier.ts` — Search alone is not evidence of a real config.
- **Powers:** Repo registry (persistent, decay-coded view of the ecosystem beyond the globe's 4-hour live-activity window)
- **Last verified:** 2026-04-19

### GitHub Repository Search (topics discovery)
- **ID:** `gh-repo-search-topics`
- **Public URL:** https://docs.github.com/en/rest/search/search#search-repositories
- **API endpoint:** `https://api.github.com/search/repositories?q=topic:claude&sort=stars&order=desc`
- **Response format:** JSON
- **Update frequency:** Hourly (every 2h cron + manual dispatch)
- **Rate limit:** Search API — 30 req/min authenticated, 1,800/hr. Shared budget with Code Search. A full cron sweep (11 topics × 2 pages = 22 calls) finishes in ~45 s at the 2.2 s inter-call spacing.
- **Auth:** GitHub personal access token
- **What it measures:** Repos that self-identify via the GitHub Topics field as one of 11 AI-tool / AI-framework topics: `claude`, `cursor`, `ai-coding`, `copilot`, `aider`, `windsurf`, `ai-agent`, `llm`, `langchain`, `crewai`, `agents-md`. Each candidate returned by search is gated through the same six-filename Contents-API probe and first-500-bytes shape verifier used by Code Search discovery — the topic tag alone never lands an entry in the registry.
- **Sanity check:** A full sweep of the 11 topics at 2 pages each should return 800–2,000 unique repos (before dedupe). Per-topic counts vary from ~300 (niche: `aider`, `windsurf`) to the 1,000 result cap (broad: `llm`, `ai-agent`). Expected range: 50–2,500 candidates per sweep. Zero on any single topic indicates query-shape drift or a secondary rate-limit kick.
- **Caveat:** Topic tags are self-declared by repo owners — they are evidence of intent, not of shape. Expect ~20–40% verify-pass rates on the broad topics (`llm`, `ai-agent`) versus 60–80% on the tool-specific ones (`claude`, `cursor`, `aider`). A repo tagged `claude` without a recognised config file never enters the registry.
- **Powers:** Repo registry (source #3 — self-declared AI tooling)
- **Last verified:** 2026-04-19

### ecosyste.ms — npm reverse-dependencies
- **ID:** `ecosystems-npm-dependents`
- **Public URL:** https://packages.ecosyste.ms
- **API endpoint:** `https://packages.ecosyste.ms/api/v1/registries/npmjs.org/packages/{pkg}/dependent_packages`
- **Response format:** JSON
- **Update frequency:** Every 6 hours (cron at :30 past)
- **Rate limit:** 5,000 req/hr anonymous (header verified 2026-04-19). Sweep of 6 target packages × 2 pages = 12 calls every 6 h → 48 calls/day; two orders of magnitude under budget.
- **Auth:** None
- **What it measures:** For each of six target npm packages (`@anthropic-ai/sdk`, `openai`, `@langchain/core`, `langchain`, `ai`, `llamaindex`), returns a paginated list of dependent packages with their `repository_url`. AI Pulse filters to github.com only, parses owner/repo, dedupes across target packages, and feeds each candidate through the same six-filename Contents-API probe + first-500-bytes shape verifier used by Code Search and Topics discovery.
- **Sanity check:** A full sweep should return 600–1,200 unique candidate repos after GitHub-only filtering and dedupe. Expected range: 50–2,000 candidates per sweep. Verify-pass rate is typically 15–30% — lower than Topics because dependents are often generic apps, not AI-tool-configured workflows. Zero on any single package indicates ecosyste.ms shape drift or a package with truly no recent dependents.
- **Caveat:** ecosyste.ms is a third-party package index that re-indexes npm on its own cadence; rows may lag live npm by hours to days. **Substituted for deps.dev** mid-session: deps.dev's public REST API returns only a dependent _count_ (`dependentCount` / `directDependentCount`), not the list — the actual dependent list is BigQuery-only. ecosyste.ms is the drop-in that matches the same constraints (free, JSON, no auth, third-party index) AND actually returns repository URLs. Libraries.io (60 req/min authenticated) is a queued follow-up for broader multi-registry coverage (PyPI, RubyGems, etc.).
- **Powers:** Repo registry (source #6 — reverse-dependency adoption signal for the canonical AI SDKs/frameworks)
- **Last verified:** 2026-04-19

### Anthropic Status (Claude Code + API)
- **ID:** `anthropic-status`
- **Public URL:** https://status.claude.com
- **API endpoint:** `https://status.claude.com/api/v2/summary.json`
- **Response format:** JSON (Statuspage.io v2 schema)
- **Update frequency:** Minutely (AI Pulse polls every 5 minutes via edge cache)
- **Rate limit:** None documented; polling budgeted to 5-minute intervals
- **Auth:** None
- **What it measures:** Current status (operational · degraded · partial_outage · major_outage) and ongoing incidents for every Anthropic-operated component, including the Claude API and Claude Code (CLI).
- **Sanity check:** Response includes `status.indicator ∈ {none, minor, major, critical}` and an array of components. Any other shape indicates a source change.
- **Powers:** Tool health card — Claude Code · Tool health card — Claude API
- **Last verified:** 2026-04-18

### OpenAI Status — summary
- **ID:** `openai-status`
- **Public URL:** https://status.openai.com
- **API endpoint:** `https://status.openai.com/api/v2/summary.json`
- **Response format:** JSON (Statuspage.io v2-compatible for `page`, `status`, `components` — but note caveat)
- **Update frequency:** Minutely (polled every 5 minutes via edge cache)
- **Rate limit:** None documented; polling budgeted to 5-minute intervals
- **Auth:** None
- **What it measures:** Per-component status for every OpenAI-operated component. Verified components (2026-04-18) include `Login`, `Responses`, `Fine-tuning`, `Images`, `Batch`, `Audio`, `Moderations`, `Sora`, `Conversations`, `Voice mode`, `Agent`, `Connectors/Apps`, `Codex Web`, `App`, `Codex API`, `CLI`, `VS Code extension`, `Compliance API`, `Video viewing`, `ChatGPT Atlas`, `Video generation`, `Feed`, `Image Generation`, `FedRAMP`.
- **Sanity check:** Response must include a `components` array containing entries named exactly `Codex Web` and `Codex API` (verified literals). Absence of either falls the affected card to graceful degradation.
- **Caveat:** `status.openai.com` is a custom Next.js page, not Statuspage.io. summary.json returns `{page, status, components}` only — it does NOT include an `incidents` array. That feed lives at a separate endpoint; see `openai-incidents`.
- **Powers:** Tool health card — OpenAI API · Tool health card — OpenAI Codex (worst-of `Codex Web` + `Codex API`)
- **Last verified:** 2026-04-18

### OpenAI Status — incidents
- **ID:** `openai-incidents`
- **Public URL:** https://status.openai.com
- **API endpoint:** `https://status.openai.com/api/v2/incidents.json`
- **Response format:** JSON (`{page, incidents[]}`)
- **Update frequency:** Minutely (polled every 5 minutes via edge cache)
- **Rate limit:** None documented; polling budgeted to 5-minute intervals
- **Auth:** None
- **What it measures:** OpenAI status-page incidents — historical and active. Each entry exposes `{id, name, status, created_at, resolved_at}`. Active incidents are those with `status ∈ {investigating, identified, monitoring}`.
- **Sanity check:** Verified 2026-04-18: 25 incidents returned, 0 currently active. Active-count of zero is normal; the card surfaces active ones only.
- **Caveat:** Fills the gap flagged in session 6.1 — OpenAI's `summary.json` omits the `incidents` array, but this sibling endpoint still exposes it. Poll both endpoints to build full card state.
- **Powers:** Tool health card — OpenAI API · Tool health card — OpenAI Codex (active-incident list)
- **Last verified:** 2026-04-18

### GitHub Issues — anthropics/claude-code
- **ID:** `gh-issues-claude-code`
- **Public URL:** https://github.com/anthropics/claude-code/issues
- **API endpoint:** `https://api.github.com/search/issues?q=repo:anthropics/claude-code+is:issue+is:open&per_page=1`
- **Response format:** JSON (`total_count` + `items[]`)
- **Update frequency:** Hourly
- **Rate limit:** Search API — 30 req/min authenticated (1,800/hr). One call/hour per tool, cached 60 min.
- **Auth:** GitHub personal access token
- **What it measures:** Open issue count for `anthropics/claude-code`, used as a community-pressure sparkline on the Claude Code card.
- **Sanity check:** Active flagship tool; wide range acceptable. Observed 9,635 open issues on verification (2026-04-18). Zero indicates broken API call. Range: 100–30,000.
- **Caveat:** Initial sanity range (50–5,000) was widened after verification returned 9,635. Range adjusted to reflect observed reality, not to manufacture a result.
- **Powers:** Tool health card — Claude Code (issue count)
- **Last verified:** 2026-04-18

### GitHub Status (covers Copilot)
- **ID:** `github-status`
- **Public URL:** https://www.githubstatus.com
- **API endpoint:** `https://www.githubstatus.com/api/v2/summary.json`
- **Response format:** JSON (Statuspage.io v2 schema)
- **Update frequency:** Minutely (polled every 5 minutes via edge cache)
- **Rate limit:** None documented
- **Auth:** None
- **What it measures:** GitHub platform components. The `Copilot` component (exact name, verified literal) surfaces operational state for GitHub Copilot. Also present: `Copilot AI Model Providers`.
- **Sanity check:** Response must include a component named exactly `Copilot`. If absent on any future poll, the Copilot card falls to graceful degradation and the change is investigated.
- **Powers:** Tool health card — GitHub Copilot
- **Last verified:** 2026-04-18

### Windsurf Status
- **ID:** `windsurf-status`
- **Public URL:** https://status.windsurf.com
- **API endpoint:** `https://status.windsurf.com/api/v2/summary.json`
- **Response format:** JSON (Statuspage.io v2 schema)
- **Update frequency:** Minutely (polled every 5 minutes via edge cache)
- **Rate limit:** None documented
- **Auth:** None
- **What it measures:** Overall page status and incidents for Windsurf (formerly Codeium). Components include `Cascade`, `Windsurf Tab`, plus the underlying Netlify hosting stack. `status.codeium.com` 302-redirects to this page.
- **Sanity check:** Statuspage.io v2. `status.indicator` ∈ {none, minor, major, critical}. Verified 2026-04-18: `indicator="none"`, all components operational.
- **Powers:** Tool health card — Windsurf
- **Last verified:** 2026-04-18

### HuggingFace Models API (text-generation by downloads)
- **ID:** `hf-models`
- **Public URL:** https://huggingface.co/models?pipeline_tag=text-generation&sort=downloads
- **API endpoint:** `https://huggingface.co/api/models?sort=downloads&direction=-1&filter=text-generation&limit=20`
- **Response format:** JSON
- **Update frequency:** Hourly (upstream); AI Pulse caches server-side 15 min; client polls every 10 min
- **Rate limit:** Not documented for public listings. Our call budget: ~one upstream request per 15 min per server region.
- **Auth:** None
- **What it measures:** Top 20 text-generation models on HuggingFace Hub ranked by 30-day downloads. Each row surfaces `id`, `author`, 30d download count, heart-like count, last-modified timestamp. No re-ranking — the order is HuggingFace's own `sort=downloads`.
- **Sanity check:** 20 models returned. Top 5 downloads should be in the 1M–100M range for established leaders; tail 5 typically 100k–1M. Expected range: 5–20 models per response. Zero-length response indicates an endpoint shape change or transient HF outage — the tab falls to an error state rather than blanking to zero.
- **Caveat:** `downloads` is HuggingFace's own 30-day rolling count. It includes `huggingface_hub` SDK pulls, `transformers.AutoModel.from_pretrained(...)` loads, and browser fetches. It is NOT unique-user count and is NOT comparable to OpenRouter/Anthropic API traffic. A spike in downloads does not imply a spike in inference traffic.
- **Powers:** Models panel (top-20 leaderboard on the dashboard)
- **Last verified:** 2026-04-19

### arXiv API (cs.AI + cs.LG, recent)
- **ID:** `arxiv-papers`
- **Public URL:** https://arxiv.org/list/cs.AI/recent
- **API endpoint:** `https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=20`
- **Response format:** Atom 1.0 XML
- **Update frequency:** Daily (arXiv batches new submissions ~20:00 UTC); AI Pulse caches server-side 30 min, CDN s-maxage 15 min, client polls every 15 min.
- **Rate limit:** arXiv asks for a 3s inter-call courtesy window ([TOU](https://info.arxiv.org/help/api/tou.html)). Our caching keeps us two orders of magnitude under that — one upstream call per 30 min per server region in the worst case.
- **Auth:** None
- **What it measures:** Top 20 most recent cs.AI / cs.LG submissions, newest first. Each row surfaces arxiv id, title, author list, primary category, submission date, and a link to the abstract page. Sort order is arXiv's own `sortByDate=desc` — no re-ranking.
- **Sanity check:** 20 entries returned. cs.AI + cs.LG see 100–400 submissions per weekday, so 20 rows is a small recent slice. Expected range: 5–20 papers per response. Zero-length parse indicates Atom shape drift or a transient arxiv outage — the tab falls to an error state rather than blanking.
- **Caveat:** cs.AI / cs.LG are broad umbrella categories; filtering is by arxiv's own tags as the author selected them. No institutional enrichment, no citation count, no quality filter — recency is the only v1 signal. Citation + institutional context are queued for v2 behind Semantic Scholar / OpenAlex once we're clear on those rate-limit stories.
- **Powers:** Research panel (top-20 recent-papers feed on the dashboard)
- **Last verified:** 2026-04-19

### Hacker News — AI-filtered story stream
- **ID:** `hn-ai-stories`
- **Public URL:** https://news.ycombinator.com
- **API endpoints:** `https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=100` (list + metadata) · `https://hacker-news.firebaseio.com/v0/user/{username}.json` (author `about` field only, for location resolution)
- **Response format:** JSON
- **Update frequency:** Every 15 minutes (GH Actions cron → `/api/wire/ingest-hn` → Upstash Redis). Dashboard polls `/api/hn` every 60 s with a matching 60 s CDN `s-maxage`.
- **Rate limit:** Algolia HN search and Firebase HN user endpoint are both unmetered and require no auth (verified via response headers 2026-04-20). 96 polls/day × (1 Algolia page + up to 20 Firebase user fetches for cache-missed authors) stays well clear of any realistic shared-IP ceiling. No-auth requirement means no secret to rotate.
- **Auth:** None
- **What it measures:** Top 20 most-recent HN stories (after a deterministic AI-keyword + domain allowlist filter; soft blacklist drops crypto / girlfriend / NSFW noise) surfaced into THE WIRE alongside GitHub events. No sentiment scoring, no launch detection, no editorial judgement — we surface titles, points, and comment counts as returned by Algolia, in strict chronological order by `created_at_i`. Firebase user endpoint is used ONLY to read the `about` field for author location; no karma, submission history, or full profile is stored.
- **Sanity check:** After the AI-relevance filter, expected 0–20 stories per 15-min poll. A value > 20 indicates the filter regressed (too permissive); a streak of 0 across ≥ 8 consecutive polls (2 h) indicates source breakage. Secondary sanity: geocode resolution rate over a 24 h window should land in 15–35 % of HN authors. Shape verified 2026-04-20 (`hits[]` with `objectID`/`title`/`url`/`author`/`points`/`num_comments`/`created_at_i`/`created_at`; `about` field present on profile samples).
- **Caveat:** Two endpoints under one logical source: Algolia returns every story field AI Pulse needs, so Firebase `/v0/item/{id}.json` is intentionally NEVER called. Author locations are cached 7 days in `hn:author:{username}`; items live 24 h in `hn:item:{id}`. The AI-relevance filter is a pre-committed deterministic allowlist/blacklist in `src/lib/data/wire-hn.ts` (keywords like `claude`, `gpt`, `llm`, `mcp`, `rlhf`; domains like `arxiv.org`, `huggingface.co`; blacklist `crypto`/`girlfriend`/`nsfw`) — never an LLM. Secondary sanity range (not representable in the single-field `SanityCheck` type in `data-sources.ts`): `geocodeResolutionPct` should sit in [15 %, 35 %]; lower values indicate HN profile `about` text that the curated geocoder dictionary doesn't cover. Privacy posture: only username + raw location string + resolved lat/lng are persisted — never the full `about` body, karma, or submission history.
- **Powers:** THE WIRE (interleaved with GitHub events, chronological) · Flat map HN markers · Globe HN dots
- **Last verified:** 2026-04-20

### Chatbot Arena — `lmarena-ai/leaderboard-dataset` (HuggingFace)
- **ID:** `lmarena-leaderboard`
- **Public URL:** https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset
- **API endpoint:** `https://datasets-server.huggingface.co/rows?dataset=lmarena-ai/leaderboard-dataset&config=text&split=latest&offset=0&length=100`
- **Response format:** JSON (HuggingFace Datasets Server REST API)
- **Update frequency:** Daily cron at `15 3 * * *` (03:15 UTC). lmarena-ai themselves refresh the dataset on their own cadence — we poll daily and only commit when `leaderboard_publish_date` changes (idempotent no-op otherwise, no diff noise).
- **Rate limit:** HuggingFace Datasets Server is unmetered for public datasets (no documented per-IP limit; verified 2026-04-20). One cron call/day pulls latest (≤5 pages of 100) + seeks previous from `split=full` (≤30 pages of 100). Worst-case ~35 calls/day on the 03:15 UTC slot — orders of magnitude under any plausible budget.
- **Auth:** None
- **What it measures:** Top 20 models by Chatbot Arena Elo for the `text` subset, `overall` category of the `latest` split. Each row surfaces rank, `model_name` (verbatim), `organization` (verbatim — may be empty when lmarena hasn't tagged a lab yet, e.g. `dola-seed-2.0-pro` at rank 13 on the 2026-04-17 snapshot), `rating` (Bradley-Terry Elo), 95 % CI bounds (`rating_lower` / `rating_upper` from the BT fit), `vote_count`, `category`, `leaderboard_publish_date`. AI Pulse does NOT recompute Elo, does NOT re-rank, does NOT rename models. Week-over-week rank and Elo deltas are computed server-side at ingest against the most-recent distinct `leaderboard_publish_date` strictly less than latest; models present in current but absent in previous render as `NEW`.
- **Sanity check:** Exactly 20 rows returned (rank 1–20). `top1_rating` ∈ [1300, 1500]; `rank20_rating` ∈ [1100, 1500] (widened from 1400 after 2026-04-17 verification returned 1447.7 — frontier bunching near the top); `publish_age_days` ∈ [0, 14]; `top1_vote_count` ≥ 5000. Values outside these ranges do not block writes but are logged by the cron and flagged in `HANDOFF.md` for investigation (Part 0 sanity-range pre-commit).
- **Caveat:** The HuggingFace dataset page declares **no license** ("License: Not provided"). AI Pulse treats the JSON rows as publicly published numeric facts and mirrors them verbatim — no redistribution of weights or proprietary content, only `(model_name, organization, rating, vote_count, category, publish_date)` tuples, each row cited to the upstream dataset. Known critiques of Chatbot Arena itself, surfaced verbatim in the panel footer so users see the caveats alongside the numbers: **style bias** (verbose answers score higher), **self-selection** (volunteer voters ≠ general users), **category overlap**. The `text` subset is selected via the HF Datasets Server `config=` URL parameter and never appears as a row field. **No map dot, no globe point** — models have no location (Part 0 geotag principle: sources without a public location field live in panels, not on the globe).
- **Powers:** Benchmarks panel (top-20 table + 95 % CI hover tooltips + rank/Elo deltas + staleness banner)
- **Last verified:** 2026-04-20

---

## Tracked without a verifiable source (gap surfaced, not hidden)

### Cursor
- **Status (2026-04-18):** No public Statuspage endpoint and no public GitHub issue tracker. The `getcursor` GitHub org is empty (0 public repos) and `anysphere` hosts adjacent tooling but not the Cursor editor's bug tracker. Checked 2026-04-18.
- **Public page:** https://status.cursor.com (human-readable only; no JSON API).
- **Why we still show the card:** To keep the gap visible. A dashboard that silently omits Cursor reads as "Cursor is not an AI coding tool worth tracking", which is wrong. An explicit "no public source" card is more honest than a missing one.
- **Reinstatement criterion:** A publicly hit-able endpoint with a stable JSON schema (Statuspage v2 ideally), OR a public issue tracker with `total_count` via the GitHub Search API. When found, add to `data-sources.ts` and drop `noPublicSource: true` from the Cursor entry in `TOOLS`.

---

## Governance

- Adding a source requires a new entry in both `src/lib/data-sources.ts` and this document, in the same commit.
- Flipping a source from pending → verified requires a manual endpoint test, a recorded sanity-check result, and the dated commit as evidence.
- Any source that returns data outside its sanity-check range is treated as broken — the affected feature falls back to graceful degradation, and the discrepancy is investigated before the metric returns to the UI.
- Widening a sanity-check range after verification is allowed and must be documented (see `gh-issues-claude-code` caveat). Recalibrating a range to chase a narrative is forbidden.

_Last updated: 2026-04-20 (session 18 — added Chatbot Arena `lmarena-ai/leaderboard-dataset` as 11th verified source; panel-only per Part 0 geotag principle; no-declared-license disclosure; `rank20_rating` sanity upper bound widened from 1400 to 1500 after first live ingest observed 1447.7)._

_Previous: 2026-04-20 (session 16 — added Hacker News AI-filtered story stream as 10th verified source; two endpoints under one logical entry, deterministic allowlist/blacklist filter, unmetered, shape verified)._

_Previous: 2026-04-19 (session 12 — expanded GitHub Events API entry to document the events-backfill discovery path that re-uses the existing globe buffer to grow `repo-registry` at zero new Search-API cost)._

_Previous: 2026-04-19 (session 9.3 / Phase B — added GitHub Code Search for repo-registry discovery; expanded GitHub Contents API entry to document its dual use by the globe existence-probe and the registry shape-verifier)._

_Previous: 2026-04-18 (session 7 — added Windsurf, OpenAI incidents endpoint, Codex component mapping; promoted Cursor from "dropped" to "tracked gap"; added GH Archive hourly dumps for globe cold-start backfill; expanded GitHub Events API to 5-page poll + 9 event types)_
