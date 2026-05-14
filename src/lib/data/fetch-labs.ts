/**
 * AI Labs activity fetcher.
 *
 * Pulls the last 7 days of public events for every tracked repo in the
 * curated AI-labs registry, buckets by lab + event type, and returns a
 * single payload. Consumed by `/api/labs` and (on the write path) the
 * 6-hourly GH Actions cron.
 *
 * Rate-limit posture: 47 tracked repos × 4 cron runs/day = ~188 req/day
 * against the 5000 req/hr authenticated budget. Per-repo network
 * failures are isolated: one bad repo marks its lab stale, never tanks
 * the whole response.
 *
 * Honest about the window: we cut against `event.created_at` with an
 * exact 7 × 24 × 3600 × 1000 ms cutoff — no fuzzy "about a week" logic.
 * Event-type filter mirrors the globe pipeline (`fetch-events.ts`) so
 * the two sources never disagree on what counts as activity.
 */

import {
  validateLabsRegistry,
  type LabEntry,
  type LabKind,
} from "@/lib/data/labs-registry";
import labsData from "../../../data/ai-labs.json";

export const LABS_RELEVANT_TYPES: ReadonlySet<string> = new Set([
  "PushEvent",
  "PullRequestEvent",
  "IssuesEvent",
  "ReleaseEvent",
  "ForkEvent",
  "WatchEvent",
  "CreateEvent",
  "IssueCommentEvent",
  "PullRequestReviewEvent",
]);

export const WINDOW_DAYS = 7;
export const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Next.js Data Cache revalidation for per-repo event fetches (6h). */
export const REPO_EVENTS_REVALIDATE = 6 * 60 * 60;

/** Cap on concurrent per-repo fetches. Keeps serverless socket pool sane. */
const MAX_CONCURRENT_REQUESTS = 10;

const GITHUB_BASE = "https://api.github.com";

export type EventTypeCount = Record<string, number>;

export type RepoBreakdown = {
  owner: string;
  repo: string;
  sourceUrl: string;
  total: number;
  byType: EventTypeCount;
  /** True when the repo fetch failed or returned non-200. Count is 0 in that case. */
  stale: boolean;
};

export type LabActivity = {
  id: string;
  displayName: string;
  kind: LabKind;
  city: string;
  country: string;
  lat: number;
  lng: number;
  hqSourceUrl: string;
  /** Primary website (or GH org fallback). Click target for the lab name. */
  url: string;
  orgs: string[];
  notes?: string;
  repos: RepoBreakdown[];
  total: number;
  byType: EventTypeCount;
  /** True when any of the lab's repos is stale. */
  stale: boolean;
};

export type LabsPayload = {
  labs: LabActivity[];
  generatedAt: string;
  failures: Array<{ step: string; message: string }>;
};

export type LabsFetchOptions = {
  /** Override the current time. Used by tests. */
  now?: Date;
  /** Override the curated registry. Used by tests. */
  registryOverride?: LabEntry[];
  /** Inject fetch for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Inject GH token for tests. Defaults to `process.env.GH_TOKEN`. */
  token?: string;
  /**
   * Override the activity window. Defaults to `WINDOW_MS` (7 days). The
   * daily-snapshot collector passes 24h so the same cached per-repo event
   * payloads can be re-bucketed for the digest's labs section without
   * spending an additional round of GH Events requests.
   */
  windowMs?: number;
};

type RawEvent = {
  id: string;
  type: string;
  created_at: string;
};

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function resolveRegistry(override?: LabEntry[]): LabEntry[] {
  if (override) return override;
  const parsed = validateLabsRegistry(labsData as unknown);
  if (!parsed.ok) {
    throw new Error(`data/ai-labs.json failed validation: ${parsed.error}`);
  }
  return parsed.entries;
}

async function runBounded<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners: Promise<void>[] = [];
  const spawn = async (): Promise<void> => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      await worker(items[idx], idx);
    }
  };
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    runners.push(spawn());
  }
  await Promise.all(runners);
}

type RepoFetchResult =
  | { kind: "ok"; events: RawEvent[] }
  | { kind: "stale"; reason: string };

async function fetchRepoEvents(
  owner: string,
  repo: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<RepoFetchResult> {
  const url = `${GITHUB_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/events?per_page=100`;
  try {
    const res = await fetchImpl(url, {
      headers: authHeaders(token),
      // Next.js Data Cache: 6h matches the labs cron cadence.
      next: { revalidate: REPO_EVENTS_REVALIDATE, tags: [`labs-repo:${owner}/${repo}`] },
    } as RequestInit);
    if (!res.ok) {
      return { kind: "stale", reason: `HTTP ${res.status}` };
    }
    const body = (await res.json()) as RawEvent[];
    if (!Array.isArray(body)) {
      return { kind: "stale", reason: "response not an array" };
    }
    return { kind: "ok", events: body };
  } catch (err) {
    return {
      kind: "stale",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

function bucketEvents(
  events: RawEvent[],
  cutoffMs: number,
): { total: number; byType: EventTypeCount } {
  const byType: EventTypeCount = {};
  let total = 0;
  for (const e of events) {
    if (!LABS_RELEVANT_TYPES.has(e.type)) continue;
    const createdMs = Date.parse(e.created_at);
    if (!Number.isFinite(createdMs)) continue;
    if (createdMs < cutoffMs) continue;
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    total++;
  }
  return { total, byType };
}

function mergeByType(
  dst: EventTypeCount,
  src: EventTypeCount,
): EventTypeCount {
  for (const [k, v] of Object.entries(src)) {
    dst[k] = (dst[k] ?? 0) + v;
  }
  return dst;
}

export async function fetchLabActivity(
  opts: LabsFetchOptions = {},
): Promise<LabsPayload> {
  const now = opts.now ?? new Date();
  const windowMs = opts.windowMs ?? WINDOW_MS;
  const cutoffMs = now.getTime() - windowMs;
  const registry = resolveRegistry(opts.registryOverride);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const token = opts.token ?? process.env.GH_TOKEN;
  if (!token) {
    console.warn(
      "[fetch-labs] GH_TOKEN is not set — returning empty labs. Set it in .env.local locally or in Vercel env vars.",
    );
    return {
      labs: registry.map((entry) => ({
        id: entry.id,
        displayName: entry.displayName,
        kind: entry.kind,
        city: entry.city,
        country: entry.country,
        lat: entry.lat,
        lng: entry.lng,
        hqSourceUrl: entry.hqSourceUrl,
        url: entry.url,
        orgs: entry.orgs,
        notes: entry.notes,
        repos: entry.repos.map((r) => ({
          owner: r.owner,
          repo: r.repo,
          sourceUrl: r.sourceUrl,
          total: 0,
          byType: {},
          stale: true,
        })),
        total: 0,
        byType: {},
        stale: true,
      })),
      generatedAt: now.toISOString(),
      failures: [{ step: "auth", message: "GH_TOKEN not set" }],
    };
  }

  const failures: LabsPayload["failures"] = [];

  // Flatten the work into one unit per repo so bounded concurrency is global,
  // not per-lab — prevents head-of-line blocking on the largest labs.
  type Job = { labIndex: number; repoIndex: number; owner: string; repo: string };
  const jobs: Job[] = [];
  for (let li = 0; li < registry.length; li++) {
    const lab = registry[li];
    for (let ri = 0; ri < lab.repos.length; ri++) {
      const r = lab.repos[ri];
      jobs.push({ labIndex: li, repoIndex: ri, owner: r.owner, repo: r.repo });
    }
  }

  const repoResults = new Map<string, RepoBreakdown>();
  await runBounded(jobs, MAX_CONCURRENT_REQUESTS, async (job) => {
    const lab = registry[job.labIndex];
    const repo = lab.repos[job.repoIndex];
    const res = await fetchRepoEvents(job.owner, job.repo, token, fetchImpl);
    const key = `${job.labIndex}:${job.repoIndex}`;
    if (res.kind === "stale") {
      failures.push({
        step: `labs-fetch:${job.owner}/${job.repo}`,
        message: res.reason,
      });
      repoResults.set(key, {
        owner: job.owner,
        repo: job.repo,
        sourceUrl: repo.sourceUrl,
        total: 0,
        byType: {},
        stale: true,
      });
      return;
    }
    const { total, byType } = bucketEvents(res.events, cutoffMs);
    repoResults.set(key, {
      owner: job.owner,
      repo: job.repo,
      sourceUrl: repo.sourceUrl,
      total,
      byType,
      stale: false,
    });
  });

  const labs: LabActivity[] = registry.map((lab, li) => {
    const repos: RepoBreakdown[] = lab.repos.map((_, ri) => {
      const got = repoResults.get(`${li}:${ri}`);
      if (got) return got;
      return {
        owner: lab.repos[ri].owner,
        repo: lab.repos[ri].repo,
        sourceUrl: lab.repos[ri].sourceUrl,
        total: 0,
        byType: {},
        stale: true,
      };
    });
    const byType: EventTypeCount = {};
    let total = 0;
    for (const r of repos) {
      mergeByType(byType, r.byType);
      total += r.total;
    }
    return {
      id: lab.id,
      displayName: lab.displayName,
      kind: lab.kind,
      city: lab.city,
      country: lab.country,
      lat: lab.lat,
      lng: lab.lng,
      hqSourceUrl: lab.hqSourceUrl,
      url: lab.url,
      orgs: lab.orgs,
      notes: lab.notes,
      repos,
      total,
      byType,
      stale: repos.some((r) => r.stale),
    };
  });

  return {
    labs,
    generatedAt: now.toISOString(),
    failures,
  };
}
