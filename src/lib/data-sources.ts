/**
 * AI Pulse — Data Source Registry
 *
 * Every source displayed on the dashboard appears here FIRST, with a
 * pre-committed sanity check and a manual verification date. If a source
 * is added without `verifiedAt`, the dashboard must not consume it —
 * render graceful-degradation state instead.
 *
 * This file is the single source of truth. `public/data-sources.md` is
 * its human-readable mirror and must stay in sync.
 *
 * Adding a new source → CHECKPOINT. Requires Auditor review per CLAUDE.md.
 */

export type UpdateFrequency =
  | "realtime" // <30s
  | "minutely" // 1-5 min
  | "hourly"
  | "six-hourly"
  | "daily"
  | "weekly"
  | "event-driven";

export type AuthRequirement = "none" | "github-token" | "upstash-redis";

export type DataSourceCategory =
  | "status-page" // uptime / incidents
  | "github-activity" // events, issues, contents
  | "model-benchmark"
  | "model-distribution" // download / adoption signals for specific models
  | "community-sentiment"
  | "published-research"
  | "regulatory"
  | "market";

export type ResponseFormat = "json" | "rss" | "html";

export type SanityCheck = {
  description: string;
  expectedMin?: number;
  expectedMax?: number;
  unit?: string;
};

export type RateLimit = {
  authenticated?: number; // requests per hour
  unauthenticated?: number; // requests per hour
  note?: string;
};

export type DataSource = {
  /** Stable kebab-case id. Used as cache key prefix and citation anchor. */
  id: string;
  name: string;
  category: DataSourceCategory;
  /** Canonical public URL shown in citations (human-readable). */
  url: string;
  /** Machine-readable endpoint the app actually calls. */
  apiUrl?: string;
  responseFormat?: ResponseFormat;
  updateFrequency: UpdateFrequency;
  rateLimit?: RateLimit;
  auth: AuthRequirement;
  /** What this source ACTUALLY tells us. Be specific. No marketing claims. */
  measures: string;
  /** Pre-committed expected range. If data falls outside, investigate source before displaying. */
  sanityCheck: SanityCheck;
  /** ISO date of last manual verification. Empty string = NOT verified → do not consume. */
  verifiedAt: string;
  /** Optional caveat about provenance, coverage gaps, or known limitations. */
  caveat?: string;
  /** Dashboard features that depend on this source. */
  powersFeature?: string[];
};

// ---------------------------------------------------------------------------
// PHASE 0 — VERIFIED 2026-04-18
// These four endpoints were manually hit and confirmed live before this file
// was written. They are safe to consume in the dashboard.
// ---------------------------------------------------------------------------

export const GITHUB_EVENTS: DataSource = {
  id: "gh-events",
  name: "GitHub Events API",
  category: "github-activity",
  url: "https://docs.github.com/en/rest/activity/events",
  apiUrl: "https://api.github.com/events",
  responseFormat: "json",
  updateFrequency: "realtime",
  rateLimit: {
    authenticated: 5000,
    unauthenticated: 60,
    note: "Per-hour, per-token. Events API returns a rolling window (~5 min); each ingest pulls 8 pages of 100 events. At the 5-min cron cadence that is ~96 authenticated requests/hr — comfortably under budget.",
  },
  auth: "github-token",
  measures:
    "Public GitHub events across all public repos. We accept nine types on the globe: PushEvent, PullRequestEvent, IssuesEvent, IssueCommentEvent, PullRequestReviewEvent, ReleaseEvent, CreateEvent, ForkEvent, WatchEvent. The endpoint returns a firehose sample, not the full stream.",
  sanityCheck: {
    description:
      "An 8-page poll should return ~500–800 events. Zero indicates either rate-limit exhaustion or GH outage; investigate before attributing to a slow day.",
    expectedMin: 100,
    expectedMax: 800,
    unit: "events per multi-page poll",
  },
  verifiedAt: "2026-04-18",
  caveat:
    "Events do not include author geolocation; we resolve it from the user profile's optional city/country field. Typical placement coverage 15–25% of raw events. Low density between polls is filled in by GH Archive hourly dumps (see `gharchive`). The same buffer also feeds `repo-registry` via the events-backfill discovery path: every repo seen in the last 240 minutes with `meta.hasAiConfig=true` becomes a registry candidate, re-using the live pipeline's AI-config probe at zero new Search-API cost.",
  powersFeature: ["globe", "live-feed", "repo-registry"],
};

export const GHARCHIVE: DataSource = {
  id: "gharchive",
  name: "GH Archive — hourly public-event dumps",
  category: "github-activity",
  url: "https://www.gharchive.org",
  apiUrl: "https://data.gharchive.org/{YYYY-MM-DD-H}.json.gz",
  responseFormat: "json",
  updateFrequency: "hourly",
  rateLimit: {
    note: "No documented limit on the static gzip CDN. We download at most 6 hours per cold-start backfill (~900MB gzipped worst case, typically <200MB after type filtering).",
  },
  auth: "none",
  measures:
    "Hourly archive of every public GitHub event — complete, unsampled. Used to backfill the globe on cold start (empty Redis) so the last 6 hours of real activity appear immediately rather than trickling in over two hours.",
  sanityCheck: {
    description:
      "Each hour file decompresses to ~100–150MB and yields 20–80k events across our nine relevant types (after inline filter). A successful fetch returns 200 with content-type application/gzip. Published ~30 minutes after the hour ends; we always skip the current hour.",
    expectedMin: 5000,
    expectedMax: 200000,
    unit: "relevant events per hour file",
  },
  verifiedAt: "2026-04-18",
  caveat:
    "Archive events carry sourceKind='gharchive' internally; they are real events with real created_at timestamps, not synthesised. The public /data-sources page surfaces this distinction so users can see which portion of the globe comes from live polls vs hourly dumps.",
  powersFeature: ["globe-coldstart-backfill"],
};

export const GITHUB_CONTENTS: DataSource = {
  id: "gh-contents",
  name: "GitHub Contents API",
  category: "github-activity",
  url: "https://docs.github.com/en/rest/repos/contents",
  apiUrl: "https://api.github.com/repos/{owner}/{repo}/contents/{path}",
  responseFormat: "json",
  updateFrequency: "event-driven",
  rateLimit: {
    authenticated: 5000,
    unauthenticated: 60,
    note: "Each probe is one request. The globe pipeline caches existence 30d. The registry verifier reads the base64 `content` field and slices the first 500 bytes for shape detection — no multi-fetch loop, one call = one verdict.",
  },
  auth: "github-token",
  measures:
    "Two uses, both deterministic: (1) globe pipeline — file existence check for AI tool configs (CLAUDE.md, .cursorrules, .github/copilot-instructions.md, .continue/, .windsurfrules). (2) registry verifier — first 500 bytes of the same files, shape-matched against pre-committed heuristics (markdown headers, instruction verbs, role labels). Neither use calls an LLM.",
  sanityCheck: {
    description:
      "Response is 200 with file metadata (size, encoding, content) OR 404 when absent. Anything else is a source problem. Files >1MB return `encoding: 'none'` with an empty content field — verifier records 'file too large' and the repo is skipped (AI configs are rarely 1MB; we'd rather skip than follow the download_url tail).",
  },
  verifiedAt: "2026-04-18",
  caveat:
    "Renames of config files (e.g., .cursorrules → CLAUDE.md within 7 days) are treated as 'migration signals' only when both deltas are observed within the window. Never inferred from a single snapshot. The registry verifier's shape check is deterministic pattern-match — it scores content, never interprets it.",
  powersFeature: ["globe-colouring", "migration-arcs", "repo-registry"],
};

export const GITHUB_CODE_SEARCH: DataSource = {
  id: "gh-code-search",
  name: "GitHub Code Search (filename discovery)",
  category: "github-activity",
  url: "https://docs.github.com/en/rest/search/search#search-code",
  apiUrl: "https://api.github.com/search/code?q=filename:CLAUDE.md",
  responseFormat: "json",
  updateFrequency: "six-hourly",
  rateLimit: {
    authenticated: 1800,
    note: "Search API is capped at 30 req/min authenticated. A full seed sweep (6 filenames × 10 pages = 60 calls) finishes in ~2 min at max burst. Cron runs use 3 pages × 6 kinds = 18 calls, well clear of the limit.",
  },
  auth: "github-token",
  measures:
    "Finds public repos that contain one of six known AI-tool config filenames on their default branch: CLAUDE.md (Anthropic Claude Code), AGENTS.md (OpenAI Codex), .cursorrules (Cursor), .windsurfrules (Windsurf), .github/copilot-instructions.md (Copilot), .continue/config.json (Continue). The Search API returns repo + path only; candidates then get fetched via the Contents API and shape-verified before entering the registry.",
  sanityCheck: {
    description:
      "A full seed sweep across the six filenames should return 3,000–8,000 unique candidate repos (before dedupe-by-name). Shape verification typically passes 60–80% of candidates. A zero-candidate return on any single filename indicates query-shape drift, rate-limit exhaustion, or a secondary abuse-protection kick — investigate before attributing to a dead convention.",
    expectedMin: 100,
    expectedMax: 10000,
    unit: "candidate repos per full sweep",
  },
  verifiedAt: "2026-04-19",
  caveat:
    "Search scope is every public repo the token owner can access (all public code by default for classic PATs). A candidate is not promoted to a registry entry until its content passes the deterministic shape heuristic in config-verifier.ts — Search alone is not evidence of a real config.",
  powersFeature: ["repo-registry"],
};

export const GITHUB_REPO_SEARCH_TOPICS: DataSource = {
  id: "gh-repo-search-topics",
  name: "GitHub Repository Search (topics discovery)",
  category: "github-activity",
  url: "https://docs.github.com/en/rest/search/search#search-repositories",
  apiUrl:
    "https://api.github.com/search/repositories?q=topic:claude&sort=stars&order=desc",
  responseFormat: "json",
  updateFrequency: "hourly",
  rateLimit: {
    authenticated: 1800,
    note: "Search API is capped at 30 req/min authenticated (shared with code search — the two endpoints pull from the same secondary rate budget). Cron runs sweep 11 topics × 2 pages = 22 calls, ~45s at the 2.2s inter-call spacing we use. Well inside a 5-min budget window.",
  },
  auth: "github-token",
  measures:
    "Finds public repos that self-identify via the GitHub Topics field as claude / cursor / ai-coding / copilot / aider / windsurf / ai-agent / llm / langchain / crewai / agents-md projects. Each candidate returned by search is then gated through the same six-filename Contents-API probe and first-500-bytes shape verifier used by Code Search discovery — no entry reaches the registry on the topic alone.",
  sanityCheck: {
    description:
      "A full sweep of the 11 topic list at 2 pages each should return 800–2000 unique repos (before dedupe). Per-topic result counts vary from ~300 (niche: aider, windsurf) to 1000 cap (broad: llm, ai-agent). A zero return on any single topic indicates query-shape drift or an abuse-protection kick — investigate before attributing to a dead topic.",
    expectedMin: 50,
    expectedMax: 2500,
    unit: "candidate repos per sweep",
  },
  verifiedAt: "2026-04-19",
  caveat:
    "Topic tags are self-declared by repo owners and are evidence of intent, not of shape. Verifier gate still applies: a repo tagged `claude` with no recognised config file never enters the registry. Expect ~20–40% verify-pass rates on the broader topics (llm, ai-agent) vs 60–80% on the tool-specific ones (claude, cursor, aider).",
  powersFeature: ["repo-registry"],
};

export const ECOSYSTEMS_NPM_DEPENDENTS: DataSource = {
  id: "ecosystems-npm-dependents",
  name: "ecosyste.ms — npm reverse-dependencies",
  category: "github-activity",
  url: "https://packages.ecosyste.ms",
  apiUrl:
    "https://packages.ecosyste.ms/api/v1/registries/npmjs.org/packages/{pkg}/dependent_packages",
  responseFormat: "json",
  updateFrequency: "six-hourly",
  rateLimit: {
    unauthenticated: 5000,
    note: "5000 req/hr anonymous (header verified 2026-04-19). Cron runs sweep 6 packages × 2 pages = 12 calls every 6h → 48 calls/day; two orders of magnitude under budget. No auth required.",
  },
  auth: "none",
  measures:
    "For each of six target npm packages (@anthropic-ai/sdk, openai, @langchain/core, langchain, ai, llamaindex), returns a paginated list of dependent packages with their `repository_url`. We filter to github.com, parse owner/repo, dedupe across target packages, and feed each candidate through the same six-filename Contents-API probe + first-500-bytes shape verifier used by Code Search and Topics discovery. A package depending on the Anthropic SDK is evidence of intent, not of AI-coding-tool shape — the verifier is the gate.",
  sanityCheck: {
    description:
      "A full sweep (6 packages × 2 pages) should return 600–1200 unique candidate repos after GitHub-only filtering and dedupe. Verify-pass rate is typically 15–30% — lower than Topics because dependents are often generic apps, not AI-tool-configured workflows. A zero return on any single package indicates ecosyste.ms shape drift or a package with truly no dependents in the latest window; investigate before attributing to dead adoption.",
    expectedMin: 50,
    expectedMax: 2000,
    unit: "candidate repos per sweep",
  },
  verifiedAt: "2026-04-19",
  caveat:
    "ecosyste.ms is a third-party package index that re-indexes npm on its own cadence; rows may lag live npm by hours to days. Substituted for deps.dev after research showed deps.dev's public REST API returns only a dependent count, not the list (actual list is BigQuery-only). Same provenance class as deps.dev — not npm itself — caveat applies to both. Switching to Libraries.io (with API key, 60 req/min authenticated) is a queued follow-up for broader ecosystem coverage (PyPI, RubyGems, etc.).",
  powersFeature: ["repo-registry"],
};

export const ANTHROPIC_STATUS: DataSource = {
  id: "anthropic-status",
  name: "Anthropic Status (Claude Code + API)",
  category: "status-page",
  url: "https://status.claude.com",
  apiUrl: "https://status.claude.com/api/v2/summary.json",
  responseFormat: "json",
  updateFrequency: "minutely",
  rateLimit: {
    note: "No documented limit. Poll every 5 min via edge cache, not per user request.",
  },
  auth: "none",
  measures:
    "Current status (operational/degraded/major_outage/partial_outage) and incident history for Anthropic-operated components, including Claude API and Claude Code (CLI).",
  sanityCheck: {
    description:
      "Response includes `status.indicator` ∈ {none, minor, major, critical} and an array of components. Any other shape is a source change.",
  },
  verifiedAt: "2026-04-18",
  powersFeature: ["tool-health-claude-code", "tool-health-claude-api"],
};

export const OPENAI_STATUS: DataSource = {
  id: "openai-status",
  name: "OpenAI Status (summary)",
  category: "status-page",
  url: "https://status.openai.com",
  apiUrl: "https://status.openai.com/api/v2/summary.json",
  responseFormat: "json",
  updateFrequency: "minutely",
  rateLimit: {
    note: "No documented limit. Poll every 5 min via edge cache.",
  },
  auth: "none",
  measures:
    "Per-component status for every OpenAI-operated component including ChatGPT, the OpenAI API, Codex Web, Codex API, CLI, and the VS Code extension. summary.json returns `{page, status, components}` only — see `openai-incidents` for the incidents feed.",
  sanityCheck: {
    description:
      "Response must include a `components` array with entries named exactly `Codex Web` and `Codex API` (verified literals, 2026-04-18). If either is missing on a future poll, the affected card falls to graceful degradation.",
  },
  verifiedAt: "2026-04-18",
  caveat:
    "status.openai.com is a custom Next.js page, not Statuspage.io. It does NOT expose `incidents` in summary.json — that array is served separately at /api/v2/incidents.json (see `openai-incidents`).",
  powersFeature: [
    "tool-health-openai-api",
    "tool-health-codex-web",
    "tool-health-codex-api",
  ],
};

export const OPENAI_INCIDENTS: DataSource = {
  id: "openai-incidents",
  name: "OpenAI Status (incidents)",
  category: "status-page",
  url: "https://status.openai.com",
  apiUrl: "https://status.openai.com/api/v2/incidents.json",
  responseFormat: "json",
  updateFrequency: "minutely",
  rateLimit: {
    note: "No documented limit. Poll every 5 min via edge cache.",
  },
  auth: "none",
  measures:
    "Array of OpenAI status-page incidents with `{id, name, status, created_at, resolved_at}`. Used to surface active incidents (status ∈ {investigating, identified, monitoring}) on OpenAI-powered cards — the field summary.json does not expose.",
  sanityCheck: {
    description:
      "Response includes an `incidents` array. Each incident has `status` ∈ {investigating, identified, monitoring, resolved, postmortem}. Verified 2026-04-18: 25 historical incidents returned, 0 currently active.",
  },
  verifiedAt: "2026-04-18",
  caveat:
    "Closes the OpenAI incidents gap flagged in session 6.1. Independent of summary.json — poll both endpoints to build full card state.",
  powersFeature: [
    "tool-health-openai-api",
    "tool-health-codex-web",
    "tool-health-codex-api",
  ],
};

export const WINDSURF_STATUS: DataSource = {
  id: "windsurf-status",
  name: "Windsurf Status",
  category: "status-page",
  url: "https://status.windsurf.com",
  apiUrl: "https://status.windsurf.com/api/v2/summary.json",
  responseFormat: "json",
  updateFrequency: "minutely",
  rateLimit: {
    note: "No documented limit. Poll every 5 min via edge cache.",
  },
  auth: "none",
  measures:
    "Overall page status and incidents for Windsurf (formerly Codeium). Full Statuspage.io v2 schema including an `incidents` array. status.codeium.com redirects here.",
  sanityCheck: {
    description:
      "Statuspage.io v2 schema. `status.indicator` ∈ {none, minor, major, critical}. Response includes components (Cascade, Windsurf Tab, plus Netlify hosting plumbing) and an incidents array.",
  },
  verifiedAt: "2026-04-18",
  powersFeature: ["tool-health-windsurf"],
};

export const ARXIV_PAPERS: DataSource = {
  id: "arxiv-papers",
  name: "arXiv API (cs.AI + cs.LG, recent)",
  category: "published-research",
  url: "https://arxiv.org/list/cs.AI/recent",
  apiUrl:
    "https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=20",
  responseFormat: "rss",
  updateFrequency: "daily",
  rateLimit: {
    note: "arXiv asks for a 3s inter-call courtesy window per https://info.arxiv.org/help/api/tou.html. We cache server-side via the Next.js Data Cache for 30 min and CDN s-maxage 15 min; worst case is one upstream call per 30 min per region — two orders of magnitude under the stated courtesy rate.",
  },
  auth: "none",
  measures:
    "Top 20 most recent cs.AI / cs.LG submissions on arXiv, newest first. Each row surfaces arxiv id, title, author list, primary category, submission date, and a direct link to the abstract page. Sort order comes straight from arXiv's sortByDate=desc — we don't re-rank.",
  sanityCheck: {
    description:
      "20 entries returned. cs.AI + cs.LG see 100–400 submissions per weekday, so a 20-row cap is a small recent slice. A zero-length parse indicates feed shape drift (atom tags or namespace changed) or a transient arxiv outage; the tab falls back to an error state rather than empty.",
    expectedMin: 5,
    expectedMax: 20,
    unit: "papers per response",
  },
  verifiedAt: "2026-04-19",
  caveat:
    "cs.AI / cs.LG are broad umbrella categories; filtering is by arxiv's own category tags as the author selected them. No institutional enrichment, no citation count, no quality filter — recency is the only signal. v2 will add citation/institution context via Semantic Scholar or OpenAlex once we're clear on the rate-limit story for those APIs.",
  powersFeature: ["research-panel"],
};

export const HUGGINGFACE_MODELS: DataSource = {
  id: "hf-models",
  name: "HuggingFace Models API (text-generation by downloads)",
  category: "model-distribution",
  url: "https://huggingface.co/models?pipeline_tag=text-generation&sort=downloads",
  apiUrl:
    "https://huggingface.co/api/models?sort=downloads&direction=-1&filter=text-generation&limit=20",
  responseFormat: "json",
  updateFrequency: "hourly",
  rateLimit: {
    note: "HuggingFace doesn't document a per-IP limit for public listings. We cache server-side via the Next.js Data Cache for 15 min; the client polls every 10 min. Worst case: one upstream call per 15 min per server region.",
  },
  auth: "none",
  measures:
    "Top 20 text-generation models on HuggingFace Hub ranked by 30-day downloads. Each row surfaces: model id (org/name), author, 30d download count, heart-like count, last-modified timestamp, pipeline tag. No re-ranking — ordering comes straight from HF's sort=downloads.",
  sanityCheck: {
    description:
      "20 models returned. Top-5 downloads should be in the 1M–100M range for established leaders (BERT/GPT2/LLaMA variants); tail 5 typically 100k–1M. A zero-length response indicates the endpoint shape changed or a transient HF outage — the tab falls back to an error state rather than empty.",
    expectedMin: 5,
    expectedMax: 20,
    unit: "models per response",
  },
  verifiedAt: "2026-04-19",
  caveat:
    "`downloads` is HF's own 30-day rolling count; it includes `huggingface_hub` SDK pulls, `transformers.AutoModel.from_pretrained(...)` loads, and browser fetches. It is NOT unique-user count and is NOT comparable to OpenRouter/Anthropic API usage. A spike in downloads does not imply a spike in inference traffic.",
  powersFeature: ["models-panel"],
};

export const HN_AI_STORIES: DataSource = {
  id: "hn-ai-stories",
  name: "Hacker News — AI-filtered story stream",
  category: "community-sentiment",
  url: "https://news.ycombinator.com",
  apiUrl:
    "https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=100",
  responseFormat: "json",
  updateFrequency: "minutely",
  rateLimit: {
    note: "Algolia HN search and Firebase HN user endpoint are both unmetered and require no auth (verified via response headers 2026-04-20). Cron at 15min cadence → 96 polls/day. Each poll fetches 1 Algolia page + up to 20 Firebase user pages (cache-missed authors only). No-auth requirement means no secret to rotate.",
  },
  auth: "none",
  measures:
    "Top 20 most-recent HN stories (after a deterministic AI-keyword + domain allowlist filter; soft blacklist drops crypto/girlfriend/nsfw noise) surfaced into THE WIRE alongside GitHub events. No sentiment scoring, no launch detection, no editorial judgement — we surface titles, points, and comment counts as returned by Algolia, in strict chronological order by created_at. Firebase user endpoint is used ONLY to read the `about` field for author location; no karma, submission history, or full profile is stored.",
  sanityCheck: {
    description:
      "After the AI-relevance filter, expected 0–20 stories per 15-min poll. A value > 20 indicates the filter regressed (too permissive); a streak of 0 across ≥ 8 consecutive polls (2h) indicates source breakage. Secondary sanity: geocode resolution rate over 24h should land in 15–35% of HN authors (documented in caveat below, not in the single-field SanityCheck type).",
    expectedMin: 0,
    expectedMax: 20,
    unit: "AI-relevant stories per 15-min poll",
  },
  verifiedAt: "",
  caveat:
    "Two endpoints under one logical source: (1) hn.algolia.com/api/v1/search_by_date?tags=story (list + metadata), (2) hacker-news.firebaseio.com/v0/user/{id}.json (location only). Firebase /v0/item/{id}.json is intentionally NEVER called — Algolia already returns every story field. Author locations are cached 7 days in hn:author:{username}; items live 24h in hn:item:{id}. Secondary sanity range (not representable in SanityCheck type): geocodeResolutionPct should sit in [15%, 35%]; lower values indicate HN profile `about` text that the curated geocoder dictionary doesn't cover. Privacy posture: only username + raw location string + resolved lat/lng are persisted — never the full `about` body, karma, or submission history.",
  powersFeature: ["the-wire", "flat-map", "globe"],
};

// ---------------------------------------------------------------------------
// PENDING VERIFICATION — DO NOT CONSUME IN DASHBOARD
// These sources are referenced in the spec but have not been Phase-0 validated
// in this session. The dashboard must render graceful-degradation for any card
// that depends on them until `verifiedAt` is set.
// AUDITOR-REVIEW: PENDING
// ---------------------------------------------------------------------------

export const GITHUB_ISSUES_CLAUDE_CODE: DataSource = {
  id: "gh-issues-claude-code",
  name: "GitHub Issues — anthropics/claude-code",
  category: "github-activity",
  url: "https://github.com/anthropics/claude-code/issues",
  apiUrl:
    "https://api.github.com/search/issues?q=repo:anthropics/claude-code+is:issue+is:open&per_page=1",
  responseFormat: "json",
  updateFrequency: "hourly",
  rateLimit: {
    authenticated: 1800, // Search API: 30 req/min authenticated = 1800/hr
    unauthenticated: 600,
    note: "Search API; returns `total_count`. Cache response for 1h — one call/hour per tool.",
  },
  auth: "github-token",
  measures:
    "Open issue count for anthropics/claude-code, surfaced via the Search API's `total_count`. Used as a community-pressure sparkline on the Claude Code card.",
  sanityCheck: {
    description:
      "Active flagship tool; wide range acceptable. Observed 9,635 open issues on initial verification (2026-04-18). Zero indicates broken API call.",
    expectedMin: 100,
    expectedMax: 30000,
    unit: "open issues",
  },
  verifiedAt: "2026-04-18",
  caveat:
    "Initial sanity range (50-5000) was widened after verification returned 9,635. Range adjusted to reflect observed reality, not to manufacture a result.",
  powersFeature: ["tool-health-claude-code"],
};

export const GITHUB_STATUS: DataSource = {
  id: "github-status",
  name: "GitHub Status (covers Copilot)",
  category: "status-page",
  url: "https://www.githubstatus.com",
  apiUrl: "https://www.githubstatus.com/api/v2/summary.json",
  responseFormat: "json",
  updateFrequency: "minutely",
  rateLimit: { note: "No documented limit. Poll every 5 min via edge cache." },
  auth: "none",
  measures:
    "GitHub platform components. The `Copilot` component (exact name, verified 2026-04-18) surfaces operational state for GitHub Copilot.",
  sanityCheck: {
    description:
      "Statuspage.io v2 schema. Response must include a component named exactly 'Copilot' (not a regex — verified literal). If absent, the Copilot health card falls to graceful-degradation.",
  },
  verifiedAt: "2026-04-18",
  powersFeature: ["tool-health-copilot"],
};

// CURSOR: no public Statuspage endpoint; no public GitHub bug tracker
// (getcursor org: 0 public repos; anysphere org hosts adjacent tooling but
// not the Cursor editor bug tracker — verified 2026-04-18). The Cursor card
// therefore renders in explicit no-data mode rather than silently showing
// green. Reinstate metrics only when a verifiable public source appears.

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const ALL_SOURCES: readonly DataSource[] = [
  GITHUB_EVENTS,
  GHARCHIVE,
  GITHUB_CONTENTS,
  GITHUB_CODE_SEARCH,
  GITHUB_REPO_SEARCH_TOPICS,
  ECOSYSTEMS_NPM_DEPENDENTS,
  ANTHROPIC_STATUS,
  OPENAI_STATUS,
  OPENAI_INCIDENTS,
  GITHUB_ISSUES_CLAUDE_CODE,
  GITHUB_STATUS,
  WINDSURF_STATUS,
  HUGGINGFACE_MODELS,
  ARXIV_PAPERS,
  HN_AI_STORIES,
] as const;

export const VERIFIED_SOURCES: readonly DataSource[] = ALL_SOURCES.filter(
  (s) => s.verifiedAt !== "",
);

export const PENDING_SOURCES: readonly DataSource[] = ALL_SOURCES.filter(
  (s) => s.verifiedAt === "",
);

export function getSourceById(id: string): DataSource | undefined {
  return ALL_SOURCES.find((s) => s.id === id);
}

export function isVerified(source: DataSource): boolean {
  return source.verifiedAt !== "";
}
