/**
 * Thin typed wrappers over the GitHub REST API calls AI Pulse uses.
 * All fetches go through Next.js's Data Cache via `next.revalidate`.
 */

const GITHUB_BASE = "https://api.github.com";

export type GitHubActor = {
  id: number;
  login: string;
  display_login?: string;
  avatar_url: string;
};

export type GitHubRepo = {
  id: number;
  name: string; // "owner/repo"
  url: string;
};

export type GitHubEvent = {
  id: string;
  type:
    | "PushEvent"
    | "PullRequestEvent"
    | "IssuesEvent"
    | "IssueCommentEvent"
    | "ForkEvent"
    | "WatchEvent"
    | "CreateEvent"
    | "DeleteEvent"
    | "ReleaseEvent"
    | string;
  actor: GitHubActor;
  repo: GitHubRepo;
  created_at: string;
  payload?: {
    ref?: string;
    commits?: Array<{ sha: string; message: string }>;
    action?: string;
  };
};

export type GitHubUser = {
  id: number;
  login: string;
  name?: string | null;
  location?: string | null;
  bio?: string | null;
  avatar_url: string;
  html_url: string;
};

function requireToken(): string {
  const token = process.env.GH_TOKEN;
  if (!token) {
    throw new Error(
      "GH_TOKEN is not set. Set it in .env.local locally or in Vercel env vars for deployments.",
    );
  }
  return token;
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function fetchRecentEvents(): Promise<GitHubEvent[]> {
  const token = requireToken();
  // per_page=100 is the documented max for /events. Widens the funnel for
  // the geocoder (which has ~10-20% hit rate on GitHub profile strings).
  const res = await fetch(`${GITHUB_BASE}/events?per_page=100`, {
    headers: authHeaders(token),
    next: { revalidate: 30, tags: ["gh-events"] },
  });
  if (!res.ok) {
    throw new Error(`GitHub events API returned ${res.status}`);
  }
  return (await res.json()) as GitHubEvent[];
}

export async function fetchUser(login: string): Promise<GitHubUser | null> {
  const token = requireToken();
  const res = await fetch(`${GITHUB_BASE}/users/${encodeURIComponent(login)}`, {
    headers: authHeaders(token),
    // 7 days — profile location rarely changes.
    next: { revalidate: 60 * 60 * 24 * 7, tags: [`gh-user:${login}`] },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub user ${login} returned ${res.status}`);
  return (await res.json()) as GitHubUser;
}

/**
 * Check whether a specific path exists in a repo (HEAD-style probe).
 * Returns true/false only — we never read file contents.
 *
 * Caveat: the Contents API doesn't support HEAD; we GET and discard body.
 * Rate-limit impact: 1 request per (repo, path) per 30 days (cache window).
 * Why 30d: repos don't toggle AI tool configs on an hourly cadence, and the
 * event pipeline layers a process-lifetime in-memory cache on top of this
 * anyway. Revalidating daily was wasted rate budget.
 */
export async function pathExists(
  owner: string,
  repo: string,
  path: string,
): Promise<boolean> {
  const token = requireToken();
  const res = await fetch(
    `${GITHUB_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`,
    {
      headers: authHeaders(token),
      next: {
        revalidate: 60 * 60 * 24 * 30,
        tags: [`gh-contents:${owner}/${repo}:${path}`],
      },
    },
  );
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  // Any other code (403 rate-limited, 451 legal block, etc.) → treat as
  // "we don't know" and return false so we don't colour the dot wrongly.
  return false;
}

export type AIConfigSignal = {
  /** Any of the AI tool config files present. */
  hasAnyConfig: boolean;
  /** Specific files detected. */
  detected: string[];
};

const AI_CONFIG_PATHS = [
  "CLAUDE.md",
  ".cursorrules",
  ".github/copilot-instructions.md",
  ".continue/config.json",
  ".windsurfrules",
] as const;

/**
 * Probe the five known AI tool config paths in parallel. Results are
 * cached 24h per path per repo (see `pathExists`).
 */
export async function probeAIConfig(
  ownerRepo: string, // "owner/repo"
): Promise<AIConfigSignal> {
  const [owner, repo] = ownerRepo.split("/");
  if (!owner || !repo) return { hasAnyConfig: false, detected: [] };

  const checks = await Promise.all(
    AI_CONFIG_PATHS.map(async (path) => ({
      path,
      exists: await pathExists(owner, repo, path).catch(() => false),
    })),
  );
  const detected = checks.filter((c) => c.exists).map((c) => c.path);
  return { hasAnyConfig: detected.length > 0, detected };
}
