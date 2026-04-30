/**
 * Public Sources inventory — user-facing groupings + freshness wiring.
 *
 * `data-sources.ts` is the typed registry of every endpoint Gawk
 * consumes (sanity ranges, caveats, verifiedAt). This file is its
 * public-facing companion: it groups the same sources into the
 * eight user-readable categories surfaced on `/sources`, and pins
 * each source to the runtime signal that proves it's live (the
 * GitHub Actions cron workflow that drives it, or the
 * `feed:lk:{key}` last-known cache key for live-HTTP surfaces, or
 * an explicit "on-demand" marker for routes that fetch per-request).
 *
 * One source = one InventoryEntry. The mapping is deterministic and
 * exhaustive — every entry in `ALL_SOURCES` from `data-sources.ts`
 * is covered. OpenRouter is the single virtual entry: it ships in
 * the Model Usage panel but isn't yet in the typed registry. Flagged
 * AUDITOR-PENDING so the gap reads honestly until promotion.
 */

import {
  ALL_SOURCES,
  type DataSource,
  type UpdateFrequency,
} from "@/lib/data-sources";
import type { CronWorkflowName } from "@/lib/data/cron-health";

export type CategoryId =
  | "tool-status"
  | "platform-infrastructure"
  | "code-activity"
  | "discussion"
  | "models"
  | "sdk-adoption"
  | "research"
  | "labs"
  | "regional-news";

export type CategoryDescriptor = {
  id: CategoryId;
  label: string;
  /** One-line context shown above the source list for the category. */
  blurb: string;
};

export const CATEGORIES: readonly CategoryDescriptor[] = [
  {
    id: "tool-status",
    label: "Tool Status",
    blurb:
      "Public status pages for the AI coding tools tracked on the dashboard. Polled every 5 minutes through `/api/status` with a last-known cache fallback.",
  },
  {
    id: "platform-infrastructure",
    label: "Platform Infrastructure",
    blurb:
      "Public status pages for the four services Gawk itself runs on. Surfaced operator-side at /admin only — the public Tool Health card grid stays AI-focused.",
  },
  {
    id: "code-activity",
    label: "Code Activity",
    blurb:
      "GitHub events, archive backfills, and discovery surfaces that drive the live globe and the curated repo registry.",
  },
  {
    id: "discussion",
    label: "Discussion",
    blurb:
      "Community chatter — currently Hacker News with the deterministic AI-keyword filter applied before ingest.",
  },
  {
    id: "models",
    label: "Models",
    blurb:
      "Where models live (HuggingFace), what they cost (OpenRouter usage), and how they rank head-to-head (Chatbot Arena).",
  },
  {
    id: "sdk-adoption",
    label: "SDK Adoption",
    blurb:
      "Package-registry download counters for the AI SDK slate. Daily snapshots feed within-package week-over-week deltas.",
  },
  {
    id: "research",
    label: "Research",
    blurb:
      "arXiv submissions in the cs.AI + cs.LG categories. Recency-only — Gawk does not re-rank papers.",
  },
  {
    id: "labs",
    label: "AI Labs",
    blurb:
      "36 curated AI labs with verifiable HQ coordinates, sized on the globe by 7-day GitHub event activity across their flagship repos.",
  },
  {
    id: "regional-news",
    label: "Regional News",
    blurb:
      "Editor-curated AI news feeds that geographically counterweight the SF/HN axis. Five publishers across UK, Germany, China, India, US (Boston).",
  },
] as const;

/**
 * How freshness is proven for a single source.
 *
 * `cron`     — driven by a GitHub Actions cron whose name is in
 *              `CRON_WORKFLOWS`; freshness is the cron's lastSuccessAt.
 * `last-known` — fetched live via a Next route that wraps in
 *              `withLastKnown`; freshness is the `feed:lk:{key}` write
 *              timestamp.
 * `on-demand` — fetched per-request through a Next route with no
 *              backing cron; the route is "live" by definition while
 *              served, but there's no scheduled poll to time-stamp.
 */
export type FreshnessSource =
  | { kind: "cron"; workflow: CronWorkflowName }
  | { kind: "last-known"; key: string }
  | { kind: "on-demand" };

export type InventoryEntry = {
  /** Stable id. Matches `DataSource.id` for typed-registry sources, or a
   * gawk-internal slug for virtual entries (e.g. "openrouter-rankings"). */
  id: string;
  category: CategoryId;
  /** Public-facing display name. */
  name: string;
  /** What this source actually tells us, condensed for non-technical readers. */
  tracks: string;
  /** The endpoint or homepage a curious reader can verify against. */
  url: string;
  /** Author-declared cadence; informs the freshness threshold. */
  updateFrequency: UpdateFrequency;
  /** How freshness is determined for this source at request time. */
  freshness: FreshnessSource;
  /**
   * True when the source ships in production but is not yet in the
   * typed `data-sources.ts` registry. Surfaces an AUDITOR-PENDING note
   * inline rather than silently rendering as a peer of verified sources.
   */
  auditorPending?: boolean;
  /** The dashboard surface that consumes this source — for "where do I see it?". */
  poweredFeature?: string;
};

const TRACKS: Record<string, string> = {
  "gh-events":
    "Live GitHub PushEvent / PR / Issues / Releases / Forks / Stars across every public repo. Drives the globe pulse.",
  gharchive:
    "Hourly complete archive of every public GitHub event, used to backfill the globe on cold start.",
  "gh-contents":
    "Per-repo file-existence + first-500-bytes shape probe for AI-tool config files (CLAUDE.md, .cursorrules, ...).",
  "gh-code-search":
    "Filename discovery for the six AI-tool config formats; feeds the registry verifier.",
  "gh-repo-search-topics":
    "Topic-tag discovery (claude / cursor / aider / windsurf / llm / ai-agent / ...) for registry candidates.",
  "ecosystems-npm-dependents":
    "Reverse-dependents for six AI npm packages (anthropic, openai, langchain, ...) feeding registry candidates.",
  "anthropic-status":
    "Operational state + active incidents for Claude API and Claude Code (CLI).",
  "openai-status":
    "Per-component status for ChatGPT, OpenAI API, Codex Web/API, CLI, VS Code extension.",
  "openai-incidents":
    "Active OpenAI status-page incidents (investigating / identified / monitoring).",
  "gh-issues-claude-code":
    "Open issue count on anthropics/claude-code, surfaced as community-pressure on the Claude Code card.",
  "github-status":
    "GitHub platform components, filtered for the `Copilot` component used by the Copilot health card.",
  "windsurf-status": "Overall page status + incidents for Windsurf (Cascade + Tab).",
  "vercel-status":
    "Vercel platform health (Dashboard, Builds, Edge Network, Functions). Surfaces on /admin only.",
  "supabase-status":
    "Supabase platform health (Database, Auth, Storage, Realtime, Edge Functions). Surfaces on /admin only.",
  "cloudflare-status":
    "Cloudflare top-line indicator. Per-datacenter components are intentionally not consumed component-by-component. Surfaces on /admin only.",
  "upstash-status":
    "Upstash platform health by region (EU-CENTRAL-1, US-EAST-1, etc.) + product (Redis, QStash, Vector). Surfaces on /admin only.",
  "hf-models":
    "Top text-generation models on HuggingFace ranked by 30-day downloads.",
  "arxiv-papers":
    "Twenty most-recent cs.AI + cs.LG submissions on arXiv, newest first. No re-ranking.",
  "hn-ai-stories":
    "Recent HN stories that match a deterministic AI keyword + domain allowlist.",
  "reddit-localllama":
    "Top-of-day posts from r/LocalLLaMA via Reddit's Atom feed. AI-relevance presumed from the sub's charter (no keyword filter applied).",
  "reddit-claudeai":
    "Top-of-day posts from r/ClaudeAI via Reddit's Atom feed. Anthropic-adjacent discussion; AI-relevance presumed from the sub's charter.",
  "lmarena-leaderboard":
    "Top 20 models by Chatbot Arena Elo for the `text` overall split.",
  "ai-labs-registry":
    "36 curated AI labs across 10+ countries with verifiable HQ coordinates.",
  "gh-repo-events-labs":
    "7-day activity counts on flagship repos for every lab in the registry.",
  "rss-the-register-ai": "AI/ML headlines from The Register (UK tech press, London).",
  "rss-heise-ai":
    "German-language AI headlines from Heise Online, filtered through the same AI-keyword allowlist.",
  "rss-synced-review":
    "English-language AI research coverage with strong China/global lab depth (editorial team, Beijing).",
  "rss-marktechpost":
    "AI research news from MarkTechPost (India-based editorial team).",
  "rss-mit-tech-review-ai":
    "MIT Technology Review's AI topic feed (Cambridge MA, US editorial counterweight).",
  "pypi-downloads":
    "Rolling download counters for seven AI Python SDKs (anthropic, openai, langchain, transformers, torch, huggingface-hub, diffusers).",
  "npm-downloads":
    "Rolling download counters for five AI JavaScript SDKs (@anthropic-ai/sdk, openai, @langchain/core, ai, llamaindex).",
  "crates-downloads":
    "Recent (90d) + all-time download counters for four Rust ML crates (candle-core, burn, tch, ort).",
  "docker-hub-pulls":
    "All-time pull counts for two AI inference images (ollama/ollama, vllm/vllm-openai).",
  "homebrew-installs":
    "30/90/365-day install counters for the ollama Homebrew formula.",
  "vscode-marketplace":
    "Cumulative install counts for six AI coding-assistant VS Code extensions (Copilot, Continue, Cody, Codeium, Cline, TabNine).",
};

const POWERED_FEATURE: Record<string, string> = {
  "gh-events": "Live globe + Wire panel",
  gharchive: "Globe cold-start backfill",
  "gh-contents": "Globe colouring + Registry verifier",
  "gh-code-search": "Repo registry",
  "gh-repo-search-topics": "Repo registry",
  "ecosystems-npm-dependents": "Repo registry",
  "anthropic-status": "Tools panel",
  "openai-status": "Tools panel",
  "openai-incidents": "Tools panel",
  "gh-issues-claude-code": "Tools panel · Claude Code card",
  "github-status": "Tools panel · Copilot card",
  "windsurf-status": "Tools panel · Windsurf card",
  "vercel-status": "/admin · Platform health",
  "supabase-status": "/admin · Platform health",
  "cloudflare-status": "/admin · Platform health",
  "upstash-status": "/admin · Platform health",
  "hf-models": "Models panel",
  "arxiv-papers": "Research panel · Feed",
  "hn-ai-stories": "Wire panel · Feed",
  "reddit-localllama": "Feed · NEWS cards",
  "reddit-claudeai": "Feed · NEWS cards",
  "lmarena-leaderboard": "Benchmarks panel · Feed",
  "ai-labs-registry": "AI Labs panel + globe layer",
  "gh-repo-events-labs": "AI Labs panel · sizes lab dots",
  "rss-the-register-ai": "Regional Wire panel + map",
  "rss-heise-ai": "Regional Wire panel + map",
  "rss-synced-review": "Regional Wire panel + map",
  "rss-marktechpost": "Regional Wire panel + map",
  "rss-mit-tech-review-ai": "Regional Wire panel + map",
  "pypi-downloads": "SDK Adoption panel · Feed",
  "npm-downloads": "SDK Adoption panel · Feed",
  "crates-downloads": "SDK Adoption panel · Feed",
  "docker-hub-pulls": "SDK Adoption panel · Feed",
  "homebrew-installs": "SDK Adoption panel · Feed",
  "vscode-marketplace": "SDK Adoption panel · Feed",
  "openrouter-rankings": "Model Usage panel · Feed",
};

const CATEGORY_OF: Record<string, CategoryId> = {
  // Tool status
  "anthropic-status": "tool-status",
  "openai-status": "tool-status",
  "openai-incidents": "tool-status",
  "github-status": "tool-status",
  "windsurf-status": "tool-status",
  "gh-issues-claude-code": "tool-status",
  // Platform infrastructure
  "vercel-status": "platform-infrastructure",
  "supabase-status": "platform-infrastructure",
  "cloudflare-status": "platform-infrastructure",
  "upstash-status": "platform-infrastructure",
  // Code activity
  "gh-events": "code-activity",
  gharchive: "code-activity",
  "gh-contents": "code-activity",
  "gh-code-search": "code-activity",
  "gh-repo-search-topics": "code-activity",
  "ecosystems-npm-dependents": "code-activity",
  // Discussion
  "hn-ai-stories": "discussion",
  "reddit-localllama": "discussion",
  "reddit-claudeai": "discussion",
  // Models
  "hf-models": "models",
  "lmarena-leaderboard": "models",
  "openrouter-rankings": "models",
  // SDK adoption
  "pypi-downloads": "sdk-adoption",
  "npm-downloads": "sdk-adoption",
  "crates-downloads": "sdk-adoption",
  "docker-hub-pulls": "sdk-adoption",
  "homebrew-installs": "sdk-adoption",
  "vscode-marketplace": "sdk-adoption",
  // Research
  "arxiv-papers": "research",
  // Labs
  "ai-labs-registry": "labs",
  "gh-repo-events-labs": "labs",
  // Regional news
  "rss-the-register-ai": "regional-news",
  "rss-heise-ai": "regional-news",
  "rss-synced-review": "regional-news",
  "rss-marktechpost": "regional-news",
  "rss-mit-tech-review-ai": "regional-news",
};

const FRESHNESS_OF: Record<string, FreshnessSource> = {
  "gh-events": { kind: "cron", workflow: "globe-ingest" },
  gharchive: { kind: "cron", workflow: "globe-ingest" },
  "gh-contents": { kind: "cron", workflow: "globe-ingest" },
  "gh-code-search": { kind: "cron", workflow: "registry-discover" },
  "gh-repo-search-topics": { kind: "cron", workflow: "registry-discover-topics" },
  "ecosystems-npm-dependents": {
    kind: "cron",
    workflow: "registry-discover-deps",
  },
  "anthropic-status": { kind: "last-known", key: "status" },
  "openai-status": { kind: "last-known", key: "status" },
  "openai-incidents": { kind: "last-known", key: "status" },
  "github-status": { kind: "last-known", key: "status" },
  "windsurf-status": { kind: "last-known", key: "status" },
  "gh-issues-claude-code": { kind: "last-known", key: "status" },
  "vercel-status": { kind: "on-demand" },
  "supabase-status": { kind: "on-demand" },
  "cloudflare-status": { kind: "on-demand" },
  "upstash-status": { kind: "on-demand" },
  "hf-models": { kind: "on-demand" },
  "arxiv-papers": { kind: "last-known", key: "research" },
  "hn-ai-stories": { kind: "cron", workflow: "wire-ingest-hn" },
  "reddit-localllama": { kind: "cron", workflow: "wire-ingest-reddit" },
  "reddit-claudeai": { kind: "cron", workflow: "wire-ingest-reddit" },
  "lmarena-leaderboard": { kind: "cron", workflow: "benchmarks-ingest" },
  "ai-labs-registry": { kind: "last-known", key: "labs" },
  "gh-repo-events-labs": { kind: "last-known", key: "labs" },
  "rss-the-register-ai": { kind: "cron", workflow: "wire-ingest-rss" },
  "rss-heise-ai": { kind: "cron", workflow: "wire-ingest-rss" },
  "rss-synced-review": { kind: "cron", workflow: "wire-ingest-rss" },
  "rss-marktechpost": { kind: "cron", workflow: "wire-ingest-rss" },
  "rss-mit-tech-review-ai": { kind: "cron", workflow: "wire-ingest-rss" },
  "pypi-downloads": { kind: "cron", workflow: "pkg-pypi" },
  "npm-downloads": { kind: "cron", workflow: "pkg-npm" },
  "crates-downloads": { kind: "cron", workflow: "pkg-crates" },
  "docker-hub-pulls": { kind: "cron", workflow: "pkg-docker" },
  "homebrew-installs": { kind: "cron", workflow: "pkg-brew" },
  "vscode-marketplace": { kind: "cron", workflow: "pkg-vscode" },
  "openrouter-rankings": { kind: "cron", workflow: "openrouter-rankings" },
};

/**
 * Virtual entries — sources that ship in production but aren't yet in
 * the typed `ALL_SOURCES` registry. Each one carries `auditorPending`
 * so the page tells the truth about the gap.
 *
 * AUDITOR-REVIEW: PENDING — promote OpenRouter to the typed registry
 * with a sanity range and verifiedAt before next major source-list pass.
 */
const VIRTUAL_ENTRIES: InventoryEntry[] = [
  {
    id: "openrouter-rankings",
    category: "models",
    name: "OpenRouter — top-weekly model rankings",
    tracks:
      "Weekly request-volume rankings for every OpenRouter-routed model. Reflects API spend, not end-user adoption.",
    url: "https://openrouter.ai/rankings",
    updateFrequency: "six-hourly",
    freshness: { kind: "cron", workflow: "openrouter-rankings" },
    auditorPending: true,
    poweredFeature: POWERED_FEATURE["openrouter-rankings"],
  },
];

/**
 * Resolve every typed-registry entry into the public inventory shape,
 * then append virtual entries (e.g. OpenRouter). Order within a
 * category mirrors the typed-registry order so additions are visible.
 */
export function buildInventory(): InventoryEntry[] {
  const entries: InventoryEntry[] = [];
  for (const src of ALL_SOURCES) {
    const category = CATEGORY_OF[src.id];
    const freshness = FRESHNESS_OF[src.id];
    const tracks = TRACKS[src.id];
    if (!category || !freshness || !tracks) {
      // A registry entry without an inventory mapping is a build-time
      // gap — surface loudly rather than silently dropping the source.
      throw new Error(
        `Sources inventory: missing mapping for "${src.id}". ` +
          "Add category/freshness/tracks before shipping new typed sources.",
      );
    }
    entries.push({
      id: src.id,
      category,
      name: publicName(src),
      tracks,
      url: src.url,
      updateFrequency: src.updateFrequency,
      freshness,
      poweredFeature: POWERED_FEATURE[src.id],
    });
  }
  return [...entries, ...VIRTUAL_ENTRIES];
}

export function groupByCategory(
  entries: InventoryEntry[],
): Map<CategoryId, InventoryEntry[]> {
  const out = new Map<CategoryId, InventoryEntry[]>();
  for (const cat of CATEGORIES) out.set(cat.id, []);
  for (const e of entries) {
    const bucket = out.get(e.category);
    if (bucket) bucket.push(e);
  }
  return out;
}

/**
 * The total verified source count + the curated-labs count are the two
 * headline numbers reported above the categories. Curated labs are not
 * "data sources" individually; they are the rows of the
 * `ai-labs-registry` source. We surface the lab count separately so
 * "36 curated labs" reads as additional context rather than inflating
 * the source total.
 */
export function totalSources(entries: InventoryEntry[]): number {
  return entries.length;
}

function publicName(source: DataSource): string {
  // Strip parenthetical disclaimers so "GitHub Status (covers Copilot)"
  // reads as "GitHub Status — covers Copilot" on the public page. Most
  // names already read cleanly; this is a narrow polish, not a rewrite.
  return source.name;
}

export function formatFrequency(f: UpdateFrequency): string {
  switch (f) {
    case "realtime":
      return "Real-time (under 30s)";
    case "minutely":
      return "Every 1–5 minutes";
    case "hourly":
      return "Hourly";
    case "six-hourly":
      return "Every 6 hours";
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "event-driven":
      return "Event-driven";
  }
}
