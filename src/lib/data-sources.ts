/**
 * Gawk — Data Source Registry
 *
 * Every source displayed on the dashboard appears here FIRST, with a
 * pre-committed sanity check and a manual verification date. If a source
 * is added without `verifiedAt`, the dashboard must not consume it —
 * render graceful-degradation state instead.
 *
 * This file is the single source of truth — endpoint URLs, sanity-range
 * bounds, rate-limit notes, and per-source caveats all live here and stay
 * private to the repo contributors. `public/data-sources.md` is a names-
 * only transparency summary for the public dashboard (category + source
 * name + governance principles); it does not mirror this file's detail,
 * by design. See CLAUDE.md "Where the intelligence lives".
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
  | "package-adoption" // download counters from package registries (PyPI, npm, etc.)
  | "community-sentiment"
  | "press-rss" // editor-curated AI news feeds (RSS / Atom)
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

// ---------------------------------------------------------------------------
// Platform-health status pages — gawk.dev's own infrastructure
//
// Distinct from the AI-tool status pages above: these track the four services
// gawk.dev itself depends on (Vercel host, Supabase data, Cloudflare DNS/proxy,
// Upstash cache). They surface on /admin only — keeping the public Tool Health
// signal AI-focused. All four are Atlassian Statuspage v2 shape, so a single
// fetcher consumes them.
// ---------------------------------------------------------------------------

export const VERCEL_STATUS: DataSource = {
  id: "vercel-status",
  name: "Vercel Status",
  category: "status-page",
  url: "https://www.vercel-status.com",
  apiUrl: "https://www.vercel-status.com/api/v2/summary.json",
  responseFormat: "json",
  updateFrequency: "minutely",
  rateLimit: {
    note: "No documented limit. Poll every 5 min via edge cache.",
  },
  auth: "none",
  measures:
    "Overall Vercel platform health (Dashboard, Builds, Deployments, Edge Network, Functions). Statuspage.io v2 schema; `status.indicator` and active incidents are the surfaced signals.",
  sanityCheck: {
    description:
      "Response includes `status.indicator` ∈ {none, minor, major, critical} and a non-empty components array. Verified 2026-04-29.",
  },
  verifiedAt: "2026-04-29",
  powersFeature: ["platform-health-vercel"],
};

export const SUPABASE_STATUS: DataSource = {
  id: "supabase-status",
  name: "Supabase Status",
  category: "status-page",
  url: "https://status.supabase.com",
  apiUrl: "https://status.supabase.com/api/v2/summary.json",
  responseFormat: "json",
  updateFrequency: "minutely",
  rateLimit: {
    note: "No documented limit. Poll every 5 min via edge cache.",
  },
  auth: "none",
  measures:
    "Overall Supabase platform health (Compute capacity, Database, Auth, Storage, Realtime, Edge Functions). Statuspage.io v2 schema.",
  sanityCheck: {
    description:
      "Response includes `status.indicator` ∈ {none, minor, major, critical} and a non-empty components array. Verified 2026-04-29.",
  },
  verifiedAt: "2026-04-29",
  powersFeature: ["platform-health-supabase"],
};

export const CLOUDFLARE_STATUS: DataSource = {
  id: "cloudflare-status",
  name: "Cloudflare Status",
  category: "status-page",
  url: "https://www.cloudflarestatus.com",
  apiUrl: "https://www.cloudflarestatus.com/api/v2/summary.json",
  responseFormat: "json",
  updateFrequency: "minutely",
  rateLimit: {
    note: "No documented limit. Poll every 5 min via edge cache.",
  },
  auth: "none",
  measures:
    "Overall Cloudflare platform indicator. summary.json carries one component per datacenter (300+ entries) so per-component worst-of is too noisy; we read `status.indicator` for the top-line signal and surface incidents from the same payload.",
  sanityCheck: {
    description:
      "Response includes `status.indicator` ∈ {none, minor, major, critical}. Components array is large (300+ datacenters) and is intentionally NOT consumed component-by-component — top-line indicator is the signal we trust. Verified 2026-04-29.",
  },
  verifiedAt: "2026-04-29",
  caveat:
    "Cloudflare's summary.json is heavy (~150KB on a quiet day). Edge-cache it for 5 min via Next Data Cache; do not poll on every dashboard hit.",
  powersFeature: ["platform-health-cloudflare"],
};

export const UPSTASH_STATUS: DataSource = {
  id: "upstash-status",
  name: "Upstash Status",
  category: "status-page",
  url: "https://status.upstash.com",
  apiUrl: "https://status.upstash.com/api/v2/summary.json",
  responseFormat: "json",
  updateFrequency: "minutely",
  rateLimit: {
    note: "No documented limit. Poll every 5 min via edge cache.",
  },
  auth: "none",
  measures:
    "Overall Upstash platform health by region (EU-CENTRAL-1, US-EAST-1, US-WEST-1, etc.) and product (Redis, QStash, Vector). Statuspage.io v2 schema.",
  sanityCheck: {
    description:
      "Response includes `status.indicator` ∈ {none, minor, major, critical} and a components array containing region entries. Verified 2026-04-29.",
  },
  verifiedAt: "2026-04-29",
  powersFeature: ["platform-health-upstash"],
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

export const REDDIT_LOCALLLAMA: DataSource = {
  id: "reddit-localllama",
  name: "Reddit — r/LocalLLaMA",
  category: "community-sentiment",
  url: "https://www.reddit.com/r/LocalLLaMA/",
  apiUrl: "https://www.reddit.com/r/LocalLLaMA/.rss?sort=top&t=day",
  responseFormat: "rss",
  updateFrequency: "minutely",
  rateLimit: {
    note: "Reddit RSS is unmetered with a non-default User-Agent. Cron polls every 30 min via Next Data Cache so user fan-out doesn't hit Reddit. We send `gawk.dev-rss-ingest/1.0` so Reddit can attribute and rate-limit cleanly.",
  },
  auth: "none",
  measures:
    "Atom feed of the subreddit's top-of-day posts. Each post becomes a candidate NEWS card via the locked window/cap thresholds. Gawk does NOT re-rank or score — the subreddit's own `?sort=top&t=day` ordering is the authority.",
  sanityCheck: {
    description:
      "Atom shape with `<entry>` blocks. Top-of-day endpoint returns up to 25 entries; we expect 5–25 per poll. A streak of 0 across ≥ 4 consecutive polls (2h) indicates either source breakage or User-Agent rejection (429).",
    expectedMin: 0,
    expectedMax: 25,
    unit: "top-of-day posts per poll",
  },
  verifiedAt: "2026-04-30",
  caveat:
    "Subreddit moderation policy can swing the topic mix; AI-relevance is presumed from the sub's charter, NOT enforced by Gawk's keyword filter. Trust contract: cards link to the Reddit comments page (the conversation), not the external link the post may carry.",
  powersFeature: ["feed-news"],
};

export const REDDIT_CLAUDEAI: DataSource = {
  id: "reddit-claudeai",
  name: "Reddit — r/ClaudeAI",
  category: "community-sentiment",
  url: "https://www.reddit.com/r/ClaudeAI/",
  apiUrl: "https://www.reddit.com/r/ClaudeAI/.rss?sort=top&t=day",
  responseFormat: "rss",
  updateFrequency: "minutely",
  rateLimit: {
    note: "Reddit RSS is unmetered with a non-default User-Agent. Cron polls every 30 min via Next Data Cache so user fan-out doesn't hit Reddit. We send `gawk.dev-rss-ingest/1.0` so Reddit can attribute and rate-limit cleanly.",
  },
  auth: "none",
  measures:
    "Atom feed of the subreddit's top-of-day posts. Each post becomes a candidate NEWS card via the locked window/cap thresholds. Gawk does NOT re-rank or score — the subreddit's own `?sort=top&t=day` ordering is the authority.",
  sanityCheck: {
    description:
      "Atom shape with `<entry>` blocks. Top-of-day endpoint returns up to 25 entries; we expect 5–25 per poll.",
    expectedMin: 0,
    expectedMax: 25,
    unit: "top-of-day posts per poll",
  },
  verifiedAt: "2026-04-30",
  caveat:
    "Subreddit covers Claude API + Claude Code + Anthropic-adjacent topics. AI-relevance is presumed from the sub's charter. Cards link to the comments page, not the external link.",
  powersFeature: ["feed-news"],
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
  verifiedAt: "2026-04-20",
  caveat:
    "Two endpoints under one logical source: (1) hn.algolia.com/api/v1/search_by_date?tags=story (list + metadata; shape verified 2026-04-20: `hits[]` with author/title/url/points/num_comments/created_at_i/created_at), (2) hacker-news.firebaseio.com/v0/user/{id}.json (location only; shape verified 2026-04-20: `about` field present on profiles). Firebase /v0/item/{id}.json is intentionally NEVER called — Algolia already returns every story field. Author locations are cached 7 days in hn:author:{username}; items live 24h in hn:item:{id}. Secondary sanity range (not representable in SanityCheck type): geocodeResolutionPct should sit in [15%, 35%]; lower values indicate HN profile `about` text that the curated geocoder dictionary doesn't cover. Privacy posture: only username + raw location string + resolved lat/lng are persisted — never the full `about` body, karma, or submission history.",
  powersFeature: ["the-wire", "flat-map", "globe"],
};

export const AI_LABS_REGISTRY: DataSource = {
  id: "ai-labs-registry",
  name: "AI Labs — curated HQ registry (internal JSON)",
  category: "github-activity",
  url: "https://github.com/Neelagiri65/aipulse/blob/main/data/ai-labs.json",
  responseFormat: "json",
  updateFrequency: "weekly",
  rateLimit: {
    note: "Static JSON checked into the repo. No runtime rate limit. Edited by hand when a lab joins/leaves the list or moves HQ; each entry carries an `hqSourceUrl` traceable to a public citation (Wikipedia infobox or the org's own about/contact page).",
  },
  auth: "none",
  measures:
    "32 curated AI labs across 10 countries, each with verifiable HQ coordinates and a list of flagship public GitHub orgs / repos. This registry is the *sourcing* step for the AI Labs globe layer — it does not score, rank, or rename labs. Inclusion criteria pre-committed at the file's top comment: (1) ≥1 public GH org or canonical flagship AI repo, (2) HQ coord traceable to a public source, (3) org publishes AI research/code (not merely consumes AI), (4) academic labs use their most-active AI subgroup org. The fetcher (`GITHUB_REPO_EVENTS_LABS`) joins this registry to live GH activity to size each dot.",
  sanityCheck: {
    description:
      "30–40 entries at any given time. `validateLabsRegistry()` rejects: missing required fields, lat ∉ [-90, 90], lng ∉ [-180, 180], country_code !∈ /^[A-Z]{2}$/, duplicate ids, non-https hqSourceUrl, non-github sourceUrl, empty repos array. Country coverage ≥ 9 expected to avoid a US-monoculture read.",
    expectedMin: 30,
    expectedMax: 40,
    unit: "labs in registry",
  },
  verifiedAt: "2026-04-20",
  caveat:
    "Curation is sourcing, not scoring. The list is editable by hand — if a notable lab is missing, add it with a verifiable HQ source. Every dot on the globe can be traced back to a row in this file, and every row cites its HQ source URL. Academic labs are represented by their most-active AI subgroup org (e.g. stanford-crfm for Stanford AI Lab) since universities don't centralise AI under one GitHub org; sibling subgroups are excluded to avoid double-counting, noted per-entry in the `notes` field.",
  powersFeature: ["ai-labs-layer", "labs-panel"],
};

export const GITHUB_REPO_EVENTS_LABS: DataSource = {
  id: "gh-repo-events-labs",
  name: "GitHub Repository Events API (labs activity fetcher)",
  category: "github-activity",
  url: "https://docs.github.com/en/rest/activity/events#list-repository-events",
  apiUrl:
    "https://api.github.com/repos/{owner}/{repo}/events?per_page=100",
  responseFormat: "json",
  updateFrequency: "six-hourly",
  rateLimit: {
    authenticated: 5000,
    unauthenticated: 60,
    note: "Per-hour, per-token. 47 tracked repos across 32 labs × 4 cron runs/day = ~188 req/day — well under the 5000/hr authenticated budget. Next.js Data Cache holds per-repo responses for 6h; the client polls `/api/labs` every 10 min but CDN s-maxage=1800 means the edge absorbs most of that traffic. Per-repo failures isolate: one 404 or transient timeout marks that repo stale on its lab but never tanks the whole response.",
  },
  auth: "github-token",
  measures:
    "7-day public-event activity per tracked repo, bucketed by lab and by event type. The same nine types accepted by the globe pipeline (PushEvent / PullRequestEvent / IssuesEvent / IssueCommentEvent / PullRequestReviewEvent / ReleaseEvent / CreateEvent / ForkEvent / WatchEvent) are counted — so the labs layer never disagrees with the live pulse on what 'activity' means. The 7-day window is an exact 7 × 24 × 3600 × 1000 ms cutoff against `created_at`, not a fuzzy approximation.",
  sanityCheck: {
    description:
      "A full refresh should return real counts for ≥ 80% of tracked repos (the rest marked stale on cron failure). Top-5 labs by 7d total typically land in the 500–5000 event range; median lab ~20–200; long tail sits near zero and those labs render as dim violet dots (still present, still clickable). A full-registry zero indicates GH rate-limit exhaustion or a cascading cron failure — investigate before attributing to 'quiet week'.",
    expectedMin: 0,
    expectedMax: 10000,
    unit: "7d events per lab",
  },
  verifiedAt: "2026-04-20",
  caveat:
    "Per-repo endpoint returns the last ~300 events or the last 90 days, whichever is smaller — we filter server-side to the 7d window and the nine relevant types before summing. Repo rename/transfer will silently return 404 until `data/ai-labs.json` is updated; the repo shows `stale: true` until fixed. Aggregate only: no rescoring, no weighting, no merging across labs. The dot size is a function of the raw 7d event total with a log scale clamped at the p95 of the current run so one outlier lab can't squash the rest of the distribution.",
  powersFeature: ["ai-labs-layer", "labs-panel"],
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

export const LMARENA_LEADERBOARD: DataSource = {
  id: "lmarena-leaderboard",
  name: "Chatbot Arena — lmarena-ai/leaderboard-dataset (HuggingFace)",
  category: "model-benchmark",
  url: "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
  apiUrl:
    "https://datasets-server.huggingface.co/rows?dataset=lmarena-ai/leaderboard-dataset&config=text&split=latest&offset=0&length=100",
  responseFormat: "json",
  updateFrequency: "daily",
  rateLimit: {
    note: "HuggingFace Datasets Server is unmetered for public datasets (no documented per-IP limit; verified 2026-04-20). One cron call/day pulls latest (≤5 pages of 100) + seeks previous from full (≤30 pages of 100). Worst-case ~35 calls/day on a single 03:15 UTC cron slot — orders of magnitude under any plausible budget.",
  },
  auth: "none",
  measures:
    "Top 20 models by Chatbot Arena Elo for the `text` subset, `overall` category of the `latest` split. Each row surfaces: rank, model_name (verbatim), organization (verbatim — may be empty when lmarena hasn't tagged a lab yet), rating (Bradley-Terry Elo), rating_lower/rating_upper (95% CI bounds from the BT fit), vote_count, category, leaderboard_publish_date. Gawk does NOT recompute Elo, does NOT re-rank, does NOT rename. Week-over-week rank and Elo deltas are computed against the most-recent distinct `leaderboard_publish_date` strictly less than the latest.",
  sanityCheck: {
    description:
      "Exactly 20 rows returned (rank 1–20). top1_rating ∈ [1300, 1500]; rank20_rating ∈ [1100, 1500] (widened from 1400 after 2026-04-17 verification returned 1447.7 — frontier bunching near the top); publish_age_days ∈ [0, 14]; top1_vote_count ≥ 5000. Values outside these ranges do not block writes but are logged and flagged in HANDOFF.md for investigation (Part 0 sanity-range pre-commit).",
    expectedMin: 20,
    expectedMax: 20,
    unit: "rows per snapshot",
  },
  verifiedAt: "2026-04-20",
  caveat:
    "The HuggingFace dataset page declares NO license ('License: Not provided'). Gawk treats the JSON rows as publicly published numeric facts and mirrors them verbatim — no redistribution of weights or proprietary content, only (model_name, organization, rating, vote_count, category, publish_date) tuples, each row cited to the upstream dataset. Known critiques of Chatbot Arena itself: style bias (verbose answers score higher), self-selection (volunteer voters ≠ general users), category overlap — surfaced verbatim in the panel footer so users see the caveat alongside the numbers. The `text` subset is selected via the HF Datasets Server `config=` URL parameter and never appears as a row field. No map dot, no globe point — models have no location (Part 0 geotag principle: panel-only).",
  powersFeature: ["benchmarks-panel"],
};

// ---------------------------------------------------------------------------
// PRESS-RSS — regional publisher feeds verified 2026-04-20 (RSS-05)
// Five curated AI-news publishers whose HQ cities geographically diversify the
// dashboard away from the SF/HN axis. Category `press-rss` is deliberately
// distinct from `community-sentiment` (HN): these are editor-curated, not
// crowd-voted, and conflating the two would let a user confuse "what an editor
// picked" with "what the crowd upvoted".
//
// Sanity ranges are conservative items-per-24h estimates drawn from a 3-day
// observed baseline during RSS-02 dev; bounds err wide rather than narrow so a
// quiet news day doesn't trigger a false "source broken" signal.
// ---------------------------------------------------------------------------

export const RSS_THE_REGISTER_AI: DataSource = {
  id: "rss-the-register-ai",
  name: "The Register — AI/ML section feed",
  category: "press-rss",
  url: "https://www.theregister.com/software/ai_ml/",
  apiUrl: "https://www.theregister.com/software/ai_ml/headlines.atom",
  responseFormat: "rss",
  updateFrequency: "minutely",
  rateLimit: {
    note: "No documented limit on The Register's Atom CDN. Polled at :25,:55 (48 polls/day). Each poll fetches ≤30 headlines; the ingest pipeline dedups against Upstash and only writes new item ids.",
  },
  auth: "none",
  measures:
    "AI/ML-scoped headlines from The Register — title, url, guid, pubDate, source id. Gawk does not summarise, score, or re-title; the items are mirrored verbatim and linked back to the publisher's canonical URL. UK tech press editorial angle (enterprise IT, security); editorial tone is a provenance note, not a sentiment signal.",
  sanityCheck: {
    description:
      "Topic-scoped feed; expect 2–25 items per 24h. Zero across consecutive polls indicates either a CDN outage or that the publisher has moved the feed URL — investigate before attributing to a slow news day. Feed format MUST parse as Atom; a parse failure marks the source stale rather than dropping silently.",
    expectedMin: 2,
    expectedMax: 25,
    unit: "items per 24h",
  },
  verifiedAt: "2026-04-20",
  caveat:
    "Topic-scoped Atom feed (AI/ML section). UK tech press tone; skews toward enterprise IT and security angles rather than research. HQ pin is London per the publisher's Wikipedia infobox (hqSourceUrl).",
  powersFeature: ["regional-wire", "map", "wire-panel"],
};

export const RSS_HEISE_AI: DataSource = {
  id: "rss-heise-ai",
  name: "Heise Online — global Atom, AI-filtered",
  category: "press-rss",
  url: "https://www.heise.de",
  apiUrl: "https://www.heise.de/rss/heise-atom.xml",
  responseFormat: "rss",
  updateFrequency: "minutely",
  rateLimit: {
    note: "No documented limit on Heise's RSS endpoint. Polled at :25,:55 (48/day). The global Atom is used because Heise does not publish a topic-scoped AI feed; the 30-ish headlines per poll are filtered through the same deterministic keyword allowlist the HN ingest uses (English + German AI terms).",
  },
  auth: "none",
  measures:
    "German-language AI headlines from Heise Online — title, url, guid, pubDate, source id. Items pass a deterministic AI-keyword match (no LLM inference). Titles remain in German (translation would require LLM inference and would violate the deterministic-only pipeline discipline).",
  sanityCheck: {
    description:
      "Global Atom filtered for AI keywords. Expect 0–10 AI-relevant items per 24h. A zero-day is plausible on weekends/holidays (Heise is a general tech publisher), so the source is NOT auto-stale on single-poll zeros — it only escalates to stale when lastFetchOkTs exceeds RSS_STALE_HOURS_THRESHOLD.",
    expectedMin: 0,
    expectedMax: 15,
    unit: "AI-filtered items per 24h",
  },
  verifiedAt: "2026-04-20",
  caveat:
    "Heise Online does not publish a topic-scoped AI feed; the global publication Atom is used and filtered with the same deterministic keyword list applied to HN (English + German AI terms). Transparency: the filter is imperfect — a story about 'KI' used metaphorically would match; a story about a specific model that doesn't mention 'AI/KI' in the title would miss. No LLM inference is used to correct these. HQ pin is Hannover per the publisher's Wikipedia infobox.",
  powersFeature: ["regional-wire", "map", "wire-panel"],
};

export const RSS_SYNCED_REVIEW: DataSource = {
  id: "rss-synced-review",
  name: "Synced Review — AI research, China/global",
  category: "press-rss",
  url: "https://syncedreview.com",
  apiUrl: "https://syncedreview.com/feed/",
  responseFormat: "rss",
  updateFrequency: "minutely",
  rateLimit: {
    note: "WordPress-backed RSS; no documented limit. Polled at :25,:55 (48/day).",
  },
  auth: "none",
  measures:
    "English-language AI-research headlines covering Chinese and global labs — title, url, guid, pubDate, source id. Editor-curated; Gawk mirrors verbatim and links back to the publisher's article.",
  sanityCheck: {
    description:
      "Topic-scoped AI publication; expect 1–15 items per 24h. A zero-day over >48h indicates the publisher may have stopped updating or moved the feed URL.",
    expectedMin: 1,
    expectedMax: 20,
    unit: "items per 24h",
  },
  verifiedAt: "2026-04-20",
  caveat:
    "English-language publication covering Chinese and global AI research. Editorial team headquartered in Beijing per the publisher's about page (hqSourceUrl); this is a curated-and-translated layer, not a native Chinese-language primary source. Including a native zh-CN feed in a future iteration would further reduce the English-only bias — queued as AUDITOR-PENDING for a v2 pass.",
  powersFeature: ["regional-wire", "map", "wire-panel"],
};

export const RSS_AIM: DataSource = {
  id: "rss-marktechpost",
  name: "MarkTechPost — AI research (India-based team)",
  category: "press-rss",
  url: "https://www.marktechpost.com",
  apiUrl: "https://www.marktechpost.com/feed/",
  responseFormat: "rss",
  updateFrequency: "minutely",
  rateLimit: {
    note: "WordPress-backed RSS; no documented limit. Polled at :25,:55 (48/day).",
  },
  auth: "none",
  measures:
    "AI-research headlines from MarkTechPost — title, url, guid, pubDate, source id. Editor-curated; Gawk mirrors verbatim. The India regional slot was filled with MarkTechPost after a review showed Analytics India Magazine's feed gated behind a paywall/fragile URL structure; MarkTechPost's feed is publicly accessible, AI-focused, and editorially led by an India-based team.",
  sanityCheck: {
    description:
      "AI-focused feed with steady publication cadence; expect 3–30 items per 24h. High end is normal (the publisher posts news digests and research summaries frequently). Consecutive zero-days indicate the feed may have moved.",
    expectedMin: 2,
    expectedMax: 40,
    unit: "items per 24h",
  },
  verifiedAt: "2026-04-20",
  caveat:
    "AI-research-focused publication with an India-based editorial team (CoFounder/Editor: Asif Razzaq, named on the publisher's About page). The publisher does not disclose a specific HQ city on its own About or Contact pages; the map pin is a Delhi NCR approximation, NOT a primary-source claim. This is flagged AUDITOR-PENDING — the lat/lng should be promoted to a verifiable primary source (a registered company address, a conference bio, or an editor interview) or the pin should be moved off the map entirely into panel-only mode per Part 0's geotag principle (null = WIRE-only).",
  powersFeature: ["regional-wire", "map", "wire-panel"],
};

export const RSS_MIT_TR_AI: DataSource = {
  id: "rss-mit-tech-review-ai",
  name: "MIT Technology Review — AI topic feed",
  category: "press-rss",
  url: "https://www.technologyreview.com/topic/artificial-intelligence/",
  apiUrl:
    "https://www.technologyreview.com/topic/artificial-intelligence/feed/",
  responseFormat: "rss",
  updateFrequency: "minutely",
  rateLimit: {
    note: "WordPress-backed topic feed; no documented limit. Polled at :25,:55 (48/day).",
  },
  auth: "none",
  measures:
    "AI-topic headlines from MIT Technology Review — title, url, guid, pubDate, source id. Editor-curated; Gawk mirrors verbatim.",
  sanityCheck: {
    description:
      "Topic-scoped feed; expect 0–8 items per 24h (MIT TR publishes less frequently than the WordPress peers, so zero-days are common and not a broken-source signal until >48h).",
    expectedMin: 0,
    expectedMax: 10,
    unit: "items per 24h",
  },
  verifiedAt: "2026-04-20",
  caveat:
    "Topic-scoped AI feed from MIT's publication; US-based (Cambridge, MA) but an editorial counterweight to the SF/HN axis within the US. Included deliberately to show that 'regional' ≠ 'non-US' — the US press itself is plural, and a BostonMA primary-research angle reads differently from an SF product-launch angle.",
  powersFeature: ["regional-wire", "map", "wire-panel"],
};

// ---------------------------------------------------------------------------
// PACKAGE-ADOPTION — registry download counters for the AI SDK slate
// Track A of the multi-platform expansion (session 32). PyPI ships first;
// npm + crates + Docker Hub + Homebrew land in PRs 2/3. All five registries
// share the `pkg:{source}:latest` Redis layout and the same SDK-adoption
// panel — shape is homogeneous so adding a sibling source is a new entry
// here + a one-line addition to the snapshot collector.
// ---------------------------------------------------------------------------

export const PYPI_DOWNLOADS: DataSource = {
  id: "pypi-downloads",
  name: "PyPI — recent download counters (via pypistats.org)",
  category: "package-adoption",
  url: "https://pypistats.org",
  apiUrl: "https://pypistats.org/api/packages/{pkg}/recent",
  responseFormat: "json",
  updateFrequency: "six-hourly",
  rateLimit: {
    note: "No documented per-IP limit on pypistats.org; the site asks callers to identify themselves via User-Agent. Cron runs fetch 7 packages × 4 times/day = 28 calls/day — trivial under any plausible budget. Next.js Data Cache is not used on the write path; the client reads the Upstash blob directly.",
  },
  auth: "none",
  measures:
    "Rolling download counters (last_day / last_week / last_month) for the seven packages that together cover the Anthropic, OpenAI, HuggingFace, and LangChain Python ecosystems: anthropic, openai, langchain, transformers, torch, huggingface-hub, diffusers. Gawk does NOT re-rank, normalise per-project, or weight by 'real user' estimates — the numbers are mirrored verbatim as pypistats publishes them. Per-package failures isolate: a 500 on `torch` marks that package stale but never tanks the whole response.",
  sanityCheck: {
    description:
      "Each tracked package's `last_month` should fall in the 100k–500M range — these are established AI SDKs, not new arrivals. anthropic was 94.8M/month on the 2026-04-21 verification probe; openai was ~250M/month. A zero across a streak of polls for any single package indicates pypistats shape drift or a package rename — investigate before attributing to dead adoption.",
    expectedMin: 100_000,
    expectedMax: 500_000_000,
    unit: "downloads per package per month",
  },
  verifiedAt: "2026-04-21",
  caveat:
    "pypistats.org is a third-party aggregator of PyPI's BigQuery download logs, same provenance class as ecosyste.ms — NOT PyPI itself. Known caveat from PyPI's own guidance: the logs include mirror hits, CI builds, and `pip install` retries, which inflate counts vs. 'real human installs' by an unknown multiplier. Gawk ships the raw numbers and surfaces this caveat alongside. Switching to Google BigQuery's `bigquery-public-data.pypi.downloads` is a queued v2 follow-up for first-party provenance (requires GCP auth + a billing account).",
  powersFeature: ["sdk-adoption-panel"],
};

export const NPM_DOWNLOADS: DataSource = {
  id: "npm-downloads",
  name: "npm — download counters (api.npmjs.org)",
  category: "package-adoption",
  url: "https://www.npmjs.com",
  apiUrl: "https://api.npmjs.org/downloads/point/{window}/{pkg}",
  responseFormat: "json",
  updateFrequency: "six-hourly",
  rateLimit: {
    note: "No documented per-IP limit on api.npmjs.org; npm's public analytics endpoint. Cron runs fetch 5 packages × 3 windows = 15 calls every 6h → 60 calls/day. Scoped packages use the raw `@scope/name` path — do NOT url-encode the `/`, npm 404s the encoded form.",
  },
  auth: "none",
  measures:
    "Rolling download counters (last_day / last_week / last_month) for the five npm packages that together cover the Anthropic, OpenAI, LangChain, and llama index JavaScript ecosystems: @anthropic-ai/sdk, openai, @langchain/core, ai, llamaindex. Per-package failures isolate into `failures[]`; whole-package failure (any of the three windows erroring) skips the package rather than writing a half-populated row. Gawk mirrors the numbers verbatim — no re-ranking, no normalisation.",
  sanityCheck: {
    description:
      "Each tracked package's `last_week` should fall in the 10k–50M range — these are established AI JS SDKs. openai was ~18M/week on the 2026-04-21 verification probe. A zero across polls for any single package indicates api.npmjs.org shape drift or a package rename — investigate before attributing to dead adoption.",
    expectedMin: 10_000,
    expectedMax: 50_000_000,
    unit: "downloads per package per week",
  },
  verifiedAt: "2026-04-21",
  caveat:
    "api.npmjs.org IS npm's own analytics endpoint (first-party), not a third-party mirror — unlike pypistats for PyPI. Known caveat per npm's own docs: downloads count every `npm install` request, including CI caches, mirror fetches, and yarn/pnpm hits that proxy through npm. Not a unique-user measure. Switching to npm's weekly-downloads API for more stable numbers is a queued follow-up once the panel design nails down the aggregation.",
  powersFeature: ["sdk-adoption-panel"],
};

export const CRATES_DOWNLOADS: DataSource = {
  id: "crates-downloads",
  name: "crates.io — Rust crate download counters",
  category: "package-adoption",
  url: "https://crates.io",
  apiUrl: "https://crates.io/api/v1/crates/{name}",
  responseFormat: "json",
  updateFrequency: "six-hourly",
  rateLimit: {
    note: "crates.io requires a User-Agent identifying the caller + contact (https://crates.io/data-access); anonymous requests without UA are blocked. Cron runs fetch 4 crates × 1 call = 4 calls every 6h → 16 calls/day. No documented per-IP rate cap for identified callers.",
  },
  auth: "none",
  measures:
    "Two counters per tracked crate (candle-core, burn, tch, ort): `downloads` (all-time total) and `recent_downloads` (rolling last 90 days). crates.io does NOT expose last-day or last-week windows — Gawk only populates {last90d, allTime} and surfaces '—' for the PyPI/npm windows rather than synthesising them from the 90d bucket.",
  sanityCheck: {
    description:
      "Each tracked crate's `recent_downloads` (90d) should fall in the 50k–20M range. candle-core was 2.1M / ort was 3.5M on the 2026-04-21 verification probe. Zero indicates crates.io shape drift or the crate was yanked — investigate before attributing to 'nobody uses Rust for ML'.",
    expectedMin: 50_000,
    expectedMax: 20_000_000,
    unit: "recent (90d) downloads per crate",
  },
  verifiedAt: "2026-04-21",
  caveat:
    "First-party provenance (crates.io is the official Rust registry's own API). `downloads` counts every `cargo build` fetch including CI caches; it is not a unique-user measure. Rust AI/ML is still an early ecosystem — expect a long tail of near-zero crates. The 4-crate slate is deliberately narrow; adding a crate is a code change under Auditor review, not a config flag.",
  powersFeature: ["sdk-adoption-panel"],
};

export const DOCKER_HUB_PULLS: DataSource = {
  id: "docker-hub-pulls",
  name: "Docker Hub — container pull counters",
  category: "package-adoption",
  url: "https://hub.docker.com",
  apiUrl: "https://hub.docker.com/v2/repositories/{namespace}/{name}",
  responseFormat: "json",
  updateFrequency: "six-hourly",
  rateLimit: {
    note: "Docker Hub v2 repository endpoint. Anon limit is 200 requests per 6-hour window (header verified); cron runs fetch 2 images × 1 call each = 2 calls every 6h → 8 calls/day. Two orders of magnitude under budget; no auth required.",
  },
  auth: "none",
  measures:
    "Two counters per tracked image (ollama/ollama, vllm/vllm-openai): `pull_count` (all-time total across every tag) and `star_count`. Docker Hub does NOT publish per-day or per-week pull breakdowns at the repository level — Gawk populates {allTime, stars} and reconstructs day-over-day deltas from the daily snapshot ZSET rather than synthesising windows. vllm/vllm-openai was 18.4M / 275★ on the 2026-04-21 verification probe.",
  sanityCheck: {
    description:
      "Each tracked image's `pull_count` should fall in the 1M–500M range (established AI inference images). Zero indicates Docker Hub shape drift or the image was unlisted — investigate before attributing to dead adoption.",
    expectedMin: 1_000_000,
    expectedMax: 500_000_000,
    unit: "all-time pulls per image",
  },
  verifiedAt: "2026-04-21",
  caveat:
    "First-party provenance (hub.docker.com's own v2 API). Known caveat per Docker's own analytics docs: `pull_count` increments on every layer request, not per unique `docker pull` invocation — CI runners that don't cache inflate the number. Also includes automated scanner / security tool pulls. Not a unique-user measure. GHCR (ghcr.io) images are deliberately out of scope — session-32 research ruled the separate OAuth handshake not worth it for one image (text-generation-inference); revisit with a dedicated fetcher if the slate grows.",
  powersFeature: ["sdk-adoption-panel"],
};

export const VSCODE_MARKETPLACE: DataSource = {
  id: "vscode-marketplace",
  name: "Visual Studio Marketplace — extension catalogue",
  category: "package-adoption",
  url: "https://marketplace.visualstudio.com",
  apiUrl:
    "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery",
  responseFormat: "json",
  updateFrequency: "six-hourly",
  rateLimit: {
    note: "Microsoft's catalogue API. No documented per-IP limit (header inspection 2026-04-26 returned no rate-limit-* surface). Cron runs fetch the full 6-extension slate in a single POST every 6h → 4 calls/day. Trivial under any plausible budget.",
  },
  auth: "none",
  measures:
    "Cumulative `install` count for six AI coding-assistant extensions on the Microsoft Visual Studio Marketplace: GitHub.copilot, Continue.continue, sourcegraph.cody-ai, Codeium.codeium, saoudrizwan.claude-dev (Cline), TabNine.tabnine-vscode. The marketplace exposes `install`, `updateCount`, `averagerating`, `ratingcount`, and `trendingdaily/weekly/monthly` per extension; we ingest `install` only as the SDK-adoption signal. Day-over-day deltas are derived from our own daily snapshot diffs (same pattern as crates / docker / brew); the API itself does not expose rolling-window counters.",
  sanityCheck: {
    description:
      "Cumulative install count is monotonically non-decreasing day-over-day. A drop without a Marketplace removal event is a data-integrity flag. Top-of-list extension (GitHub.copilot) was 73,134,892 installs on 2026-04-26 verification probe; smallest tracked (saoudrizwan.claude-dev / Cline) starts in the low millions. Slate-wide allTime sums sit in the 80M–250M range as Copilot dominates.",
    expectedMin: 100_000,
    expectedMax: 250_000_000,
    unit: "cumulative installs per extension",
  },
  verifiedAt: "2026-04-26",
  caveat:
    "First-party provenance — Microsoft's own marketplace catalogue API. install ≠ active use: auto-installed bundle extensions, CI runners, and codespace pre-warms inflate the absolute number vs 'real human users'. updateCount is the closer active-use proxy but is not yet ingested (deferred follow-up). The `_apis/public/gallery/extensionquery` endpoint is empirically reachable and stable across the verification probe + S37 follow-up but is not formally documented as a public-API contract — the catalogue page itself uses the same path. AUDITOR-PENDING on whether to split installs vs updateCount into two SDK_TREND signals.",
  powersFeature: ["sdk-adoption-panel"],
};

export const HOMEBREW_INSTALLS: DataSource = {
  id: "homebrew-installs",
  name: "Homebrew — formula install counters",
  category: "package-adoption",
  url: "https://formulae.brew.sh",
  apiUrl: "https://formulae.brew.sh/api/formula/{name}.json",
  responseFormat: "json",
  updateFrequency: "six-hourly",
  rateLimit: {
    note: "CDN-fronted static JSON; no documented per-IP limit. Cron runs fetch 1 formula × 1 call = 1 call every 6h → 4 calls/day. Trivial.",
  },
  auth: "none",
  measures:
    "Install counters for each tracked formula (ollama): 30-day / 90-day / 365-day buckets exposed via `analytics.install.{30d|90d|365d}`. Homebrew keys each bucket by install command form (ollama, ollama@0.1.5, ollama HEAD) — Gawk sums across keys so the headline number matches how Homebrew's own analytics dashboard presents the formula. ollama's 90d install count was 207,803 on the 2026-04-21 verification probe.",
  sanityCheck: {
    description:
      "Each tracked formula's 90d install count should fall in the 10k–5M range (established CLI tools). Zero indicates formulae.brew.sh shape drift or the formula was renamed — investigate before attributing to dead adoption.",
    expectedMin: 10_000,
    expectedMax: 5_000_000,
    unit: "90d installs per formula",
  },
  verifiedAt: "2026-04-21",
  caveat:
    "First-party provenance (formulae.brew.sh is Homebrew's own analytics endpoint). Homebrew's analytics are opt-out but on by default — the counts cover every user who hasn't disabled `brew analytics off`, which Homebrew's own documentation estimates at ~95%+ of installs. Not a unique-user measure (a user reinstalling daily counts daily). The single-formula slate is deliberately narrow; adding a formula is a code change under Auditor review, not a config flag. Track A scope; SDK Adoption panel will surface this alongside PyPI/npm/crates/Docker so the Homebrew CLI-install story shows alongside the library-import story.",
  powersFeature: ["sdk-adoption-panel"],
};

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
  VERCEL_STATUS,
  SUPABASE_STATUS,
  CLOUDFLARE_STATUS,
  UPSTASH_STATUS,
  HUGGINGFACE_MODELS,
  ARXIV_PAPERS,
  HN_AI_STORIES,
  REDDIT_LOCALLLAMA,
  REDDIT_CLAUDEAI,
  LMARENA_LEADERBOARD,
  AI_LABS_REGISTRY,
  GITHUB_REPO_EVENTS_LABS,
  RSS_THE_REGISTER_AI,
  RSS_HEISE_AI,
  RSS_SYNCED_REVIEW,
  RSS_AIM,
  RSS_MIT_TR_AI,
  PYPI_DOWNLOADS,
  NPM_DOWNLOADS,
  CRATES_DOWNLOADS,
  DOCKER_HUB_PULLS,
  HOMEBREW_INSTALLS,
  VSCODE_MARKETPLACE,
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
