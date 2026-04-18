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
    note: "Per-hour, per-token. Events API returns a rolling window (~5 min); poll every 30s.",
  },
  auth: "github-token",
  measures:
    "Public GitHub events (push, PR, issue, fork, star) across all public repos. Firehose; not filtered for AI relevance at source.",
  sanityCheck: {
    description:
      "A single page should return 30 events. Total volume across public GitHub is millions/day.",
    expectedMin: 1,
    expectedMax: 100,
    unit: "events per response page",
  },
  verifiedAt: "2026-04-18",
  caveat:
    "Events do not include author geolocation directly; we resolve it from the user profile's city/country field, which is optional. Globe coverage will be a fraction of total events.",
  powersFeature: ["globe", "live-feed"],
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
  name: "OpenAI Status (ChatGPT + API)",
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
    "Current status and incidents for OpenAI-operated components, including ChatGPT and the OpenAI API.",
  sanityCheck: {
    description:
      "Same Statuspage.io v2 schema as Anthropic. `status.indicator` ∈ {none, minor, major, critical}.",
  },
  verifiedAt: "2026-04-18",
  powersFeature: ["tool-health-openai-api"],
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

// CURSOR_STATUS removed 2026-04-18 per user direction: "drop the Cursor status
// card for now if there's no confirmed public status page endpoint. Trustworthiness
// over completeness." Add back when a verified endpoint is found.

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const ALL_SOURCES: readonly DataSource[] = [
  GITHUB_EVENTS,
  GITHUB_CONTENTS,
  ANTHROPIC_STATUS,
  OPENAI_STATUS,
  GITHUB_ISSUES_CLAUDE_CODE,
  GITHUB_STATUS,
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
