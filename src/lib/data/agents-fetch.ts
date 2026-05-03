/**
 * Agents-fetch — pure orchestrator that fans a list of `AgentFramework`
 * registry entries out to PyPI, npm, and GitHub for per-framework adoption
 * + maintenance metadata.
 *
 * Pure: takes a `fetchImpl` for testability, no Redis/file I/O of any
 * kind. Writing the result lives in `agents-store.ts` + the ingest route.
 *
 * Per-framework partial-failure isolation:
 *   - A PyPI 500 leaves npm + GH counters intact and surfaces under
 *     `fetchErrors[].source = "pypi"`.
 *   - One framework's GH 404 does not poison neighbouring frameworks.
 *   - Non-numeric counters (e.g. pypistats returning `"?"` for `last_week`)
 *     never propagate as NaN — the field is null + a fetchError is added.
 *
 * Per-framework `weeklyDownloads` is the sum of populated PyPI + npm
 * counters. If both are null, the sum is null (not 0) — silent zero would
 * inflate the gap between alive and tombstone frameworks.
 *
 * The GitHub call always runs (even for tombstones with no PyPI/npm) —
 * the dormant/archived badges in the panel derive from `pushed_at` and
 * `archived` on every framework, including the dead ones.
 */

import type { AgentFramework } from "@/lib/data/agents-registry";

const PYPISTATS_BASE = "https://pypistats.org/api/packages";
const NPM_DOWNLOADS_BASE = "https://api.npmjs.org/downloads/point/last-week";
const GITHUB_BASE = "https://api.github.com/repos";
const USER_AGENT = "aipulse/1.0 (+https://gawk.dev)";

export type AgentFetchSource = "pypi" | "npm" | "github";

export type AgentFrameworkSnapshot = {
  /** Mirrors the registry id. */
  id: string;
  pypiWeeklyDownloads: number | null;
  npmWeeklyDownloads: number | null;
  /** Sum of populated PyPI + npm counters; null if both are null. */
  weeklyDownloads: number | null;
  stars: number | null;
  openIssues: number | null;
  /** ISO from GH `pushed_at` — last commit on any branch. */
  pushedAt: string | null;
  /** GH `archived` flag — true means the owner explicitly archived the repo. */
  archived: boolean | null;
  /**
   * Per-source last-known-good staleness. ISO of the run when the source's
   * data was LAST freshly fetched. `null` here means "fresh THIS run".
   * Populated only by the ingest merge — `fetchAgentSnapshots` itself
   * always sets these to null since it's looking only at the raw fetch.
   *
   * Trust contract: a panel showing "9.6M · stale 4h" is honest; a panel
   * showing "—" when the framework actually has 9.6M weekly downloads
   * is biased toward "this is dead" (S53 inference fix).
   */
  pypiStaleSince: string | null;
  npmStaleSince: string | null;
  githubStaleSince: string | null;
  fetchErrors: Array<{ source: AgentFetchSource; message: string }>;
};

export type AgentFetchResult = {
  frameworks: AgentFrameworkSnapshot[];
  fetchedAt: string;
};

export type AgentFetchOptions = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** GitHub PAT for the `Authorization: Bearer ...` header. */
  ghToken?: string;
  /** Inter-framework throttle in ms. pypistats returns 429 on tight
   *  back-to-back fan-out (observed session 52: 3 of 7 PyPI calls
   *  rate-limited within ~1s; S52's 250ms still produced 3-of-7
   *  partials on Vercel's outbound IPs). S58 bumps default to 1500ms
   *  — spaces 8 frameworks across ~10.5s which is well clear of any
   *  per-IP-per-package cooldown observed empirically. Tests pass 0
   *  to skip the wait. */
  perFrameworkDelayMs?: number;
  /** Sleep impl — tests pass a no-op or a vi.fn to verify call count. */
  sleep?: (ms: number) => Promise<void>;
  /** Override the 429-retry backoff. Default 2000ms; tests pass 0. */
  retry429BackoffMs?: number;
};

const DEFAULT_DELAY_MS = 1500;
const DEFAULT_RETRY_429_BACKOFF_MS = 2000;

export async function fetchAgentSnapshots(
  frameworks: readonly AgentFramework[],
  opts: AgentFetchOptions = {},
): Promise<AgentFetchResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date());
  const delayMs = opts.perFrameworkDelayMs ?? DEFAULT_DELAY_MS;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const retry429BackoffMs =
    opts.retry429BackoffMs ?? DEFAULT_RETRY_429_BACKOFF_MS;

  const snapshots: AgentFrameworkSnapshot[] = [];
  for (let i = 0; i < frameworks.length; i++) {
    if (i > 0 && delayMs > 0) await sleep(delayMs);
    snapshots.push(
      await fetchOneFramework(frameworks[i], fetchImpl, opts.ghToken, {
        sleep,
        retry429BackoffMs,
      }),
    );
  }

  return { frameworks: snapshots, fetchedAt: now().toISOString() };
}

type FetchOneOptions = {
  sleep: (ms: number) => Promise<void>;
  retry429BackoffMs: number;
};

async function fetchOneFramework(
  fw: AgentFramework,
  fetchImpl: typeof fetch,
  ghToken: string | undefined,
  inner: FetchOneOptions,
): Promise<AgentFrameworkSnapshot> {
  const errors: AgentFrameworkSnapshot["fetchErrors"] = [];

  let pypiWeekly: number | null = null;
  if (fw.pypiPackage) {
    try {
      pypiWeekly = await fetchPyPiWeekly(fw.pypiPackage, fetchImpl, inner);
    } catch (e) {
      errors.push({ source: "pypi", message: errMessage(e) });
    }
  }

  let npmWeekly: number | null = null;
  if (fw.npmPackage) {
    try {
      npmWeekly = await fetchNpmWeekly(fw.npmPackage, fetchImpl, inner);
    } catch (e) {
      errors.push({ source: "npm", message: errMessage(e) });
    }
  }

  let stars: number | null = null;
  let openIssues: number | null = null;
  let pushedAt: string | null = null;
  let archived: boolean | null = null;
  try {
    const meta = await fetchGithubRepoMeta(fw.githubRepo, fetchImpl, ghToken);
    stars = meta.stars;
    openIssues = meta.openIssues;
    pushedAt = meta.pushedAt;
    archived = meta.archived;
  } catch (e) {
    errors.push({ source: "github", message: errMessage(e) });
  }

  const weeklyDownloads =
    pypiWeekly === null && npmWeekly === null
      ? null
      : (pypiWeekly ?? 0) + (npmWeekly ?? 0);

  return {
    id: fw.id,
    pypiWeeklyDownloads: pypiWeekly,
    npmWeeklyDownloads: npmWeekly,
    weeklyDownloads,
    stars,
    openIssues,
    pushedAt,
    archived,
    // Fresh-fetch is always staleSince=null; the ingest merge stamps
    // staleSince to the run's ISO when a source fails AND a prior
    // value exists to carry forward.
    pypiStaleSince: null,
    npmStaleSince: null,
    githubStaleSince: null,
    fetchErrors: errors,
  };
}

async function fetchPyPiWeekly(
  pkg: string,
  fetchImpl: typeof fetch,
  inner: FetchOneOptions,
): Promise<number> {
  const url = `${PYPISTATS_BASE}/${encodeURIComponent(pkg)}/recent`;
  const res = await fetchWithRetryOn429(
    url,
    {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    },
    fetchImpl,
    inner,
  );
  if (!res.ok) {
    const bodyText = await safeReadText(res);
    throw new Error(
      `pypistats ${pkg} HTTP ${res.status}${bodyText ? ` · upstream: ${truncate(bodyText, 120)}` : ""}`,
    );
  }
  const body = (await res.json()) as unknown;
  if (!body || typeof body !== "object") {
    throw new Error(`pypistats ${pkg}: non-object body`);
  }
  const data = (body as Record<string, unknown>).data;
  if (!data || typeof data !== "object") {
    throw new Error(`pypistats ${pkg}: missing data field`);
  }
  return toCount((data as Record<string, unknown>).last_week, "last_week");
}

async function fetchNpmWeekly(
  pkg: string,
  fetchImpl: typeof fetch,
  inner: FetchOneOptions,
): Promise<number> {
  // npm's downloads endpoint expects scoped names verbatim ("@scope/name"),
  // NOT url-encoded — encoding the slash returns 404.
  const url = `${NPM_DOWNLOADS_BASE}/${pkg}`;
  const res = await fetchWithRetryOn429(
    url,
    {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    },
    fetchImpl,
    inner,
  );
  if (!res.ok) {
    const bodyText = await safeReadText(res);
    throw new Error(
      `npm ${pkg} HTTP ${res.status}${bodyText ? ` · upstream: ${truncate(bodyText, 120)}` : ""}`,
    );
  }
  const body = (await res.json()) as unknown;
  if (!body || typeof body !== "object") {
    throw new Error(`npm ${pkg}: non-object body`);
  }
  return toCount((body as Record<string, unknown>).downloads, "downloads");
}

/**
 * One-shot 429 retry. Pypistats returns HTTP 429 RATE LIMIT EXCEEDED
 * sporadically on tight back-to-back fan-out (S52). The S58 throttle
 * bump (250→1500ms) reduces the rate, but a single retry after the
 * cooldown window (default 2s) absorbs the residual cases without
 * sustained polling. Only retries on 429; other 4xx/5xx surface
 * immediately so transient upstream errors don't multiply.
 */
async function fetchWithRetryOn429(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  inner: FetchOneOptions,
): Promise<Response> {
  const first = await fetchImpl(url, init);
  if (first.status !== 429) return first;
  if (inner.retry429BackoffMs > 0) await inner.sleep(inner.retry429BackoffMs);
  return fetchImpl(url, init);
}

/** Read response body without throwing — useful for surfacing the
 *  upstream error message in the snapshot's fetchErrors. */
async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

async function fetchGithubRepoMeta(
  repo: string,
  fetchImpl: typeof fetch,
  token: string | undefined,
): Promise<{
  stars: number;
  openIssues: number;
  pushedAt: string;
  archived: boolean;
}> {
  const url = `${GITHUB_BASE}/${repo}`;
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetchImpl(url, { headers });
  if (!res.ok) {
    throw new Error(`github ${repo} HTTP ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  if (!body || typeof body !== "object") {
    throw new Error(`github ${repo}: non-object body`);
  }
  const o = body as Record<string, unknown>;
  const stars = toCount(o.stargazers_count, "stargazers_count");
  const openIssues = toCount(o.open_issues_count, "open_issues_count");
  const pushedAt = toIsoString(o.pushed_at, "pushed_at");
  const archived = typeof o.archived === "boolean" ? o.archived : false;
  return { stars, openIssues, pushedAt, archived };
}

function toCount(value: unknown, field: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${field} is not a non-negative finite number`);
  }
  return Math.round(n);
}

function toIsoString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} is not a non-empty string`);
  }
  return value;
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
