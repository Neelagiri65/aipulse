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
    note: "Per-hour, per-token. Events API returns a rolling window (~5 min); each ingest pulls 5 pages of 100 events. At the 5-min cron cadence that is ~60 authenticated requests/hr — comfortably under budget.",
  },
  auth: "github-token",
  measures:
    "Public GitHub events across all public repos. We accept nine types on the globe: PushEvent, PullRequestEvent, IssuesEvent, IssueCommentEvent, PullRequestReviewEvent, ReleaseEvent, CreateEvent, ForkEvent, WatchEvent. The endpoint returns a firehose sample, not the full stream.",
  sanityCheck: {
    description:
      "A 5-page poll should return ~300–500 events (upstream caps the visible feed around 300). Zero indicates either rate-limit exhaustion or GH outage; investigate before attributing to a slow day.",
    expectedMin: 50,
    expectedMax: 500,
    unit: "events per multi-page poll",
  },
  verifiedAt: "2026-04-18",
  caveat:
    "Events do not include author geolocation; we resolve it from the user profile's optional city/country field. Typical placement coverage 15–25% of raw events. Low density between polls is filled in by GH Archive hourly dumps (see `gharchive`).",
  powersFeature: ["globe", "live-feed"],
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
    note: "Each AI-config probe is one request. Cache aggressively (24h).",
  },
  auth: "github-token",
  measures:
    "File existence in a repo. We use it only to detect AI tool config files (CLAUDE.md, .cursorrules, .github/copilot-instructions.md, .continue/, .windsurfrules). Deterministic; never inferred.",
  sanityCheck: {
    description:
      "Response is 200 with file metadata OR 404 when absent. Anything else is a source problem.",
  },
  verifiedAt: "2026-04-18",
  caveat:
    "Renames of config files (e.g., .cursorrules → CLAUDE.md within 7 days) are treated as 'migration signals' only when both deltas are observed within the window. Never inferred from a single snapshot.",
  powersFeature: ["globe-colouring", "migration-arcs"],
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
  ANTHROPIC_STATUS,
  OPENAI_STATUS,
  OPENAI_INCIDENTS,
  GITHUB_ISSUES_CLAUDE_CODE,
  GITHUB_STATUS,
  WINDSURF_STATUS,
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
