/**
 * Agents-panel ingest orchestrator — invoked by the cron-driven route.
 *
 * Steps:
 *   1. Pull the editorial framework slate from `agents-registry`.
 *   2. Fan out PyPI / npm / GH fetches via `fetchAgentSnapshots`.
 *   3. Write the result to `agents:latest`.
 *   4. Write the same result to `agents:snapshot:{today}` with 14d TTL.
 *
 * `ok:true` iff at least one framework had ANY usable field (downloads,
 * stars, pushedAt). A whole-slate failure (every framework hit a 500/404)
 * returns ok:false with the count of frameworks attempted, leaving the
 * previous `agents:latest` blob in place rather than zeroing the panel.
 *
 * Pure of route concerns: tests construct a fake fetchImpl + a deferred
 * "now" + a custom write function and verify the orchestrator wires
 * them correctly.
 */

import {
  AGENT_FRAMEWORKS,
  type AgentFramework,
} from "@/lib/data/agents-registry";
import {
  fetchAgentSnapshots,
  type AgentFetchResult,
  type AgentFrameworkSnapshot,
} from "@/lib/data/agents-fetch";
import {
  readAgentsLatest,
  writeAgentsLatest,
  writeAgentsSnapshot,
} from "@/lib/data/agents-store";

/**
 * Per-source merge: when a fresh fetch returned null AND we have a prior
 * value to carry forward, swap in the prior value and stamp staleSince.
 * Pure — takes (current snapshot, prior snapshot, prior run's fetchedAt,
 * current run's fetchedAt), returns the merged snapshot with
 * carry-forward applied.
 *
 * Three cases per source (pypi / npm / github):
 *   1. Fresh fetch succeeded → keep current value, staleSince=null.
 *   2. Fresh fetch failed, no prior → keep null, staleSince=null
 *      (true cold-start gap; the panel renders "—").
 *   3. Fresh fetch failed, prior exists → carry prior value, stamp
 *      staleSince. If prior was already stale, keep its older
 *      staleSince so the age compounds honestly. If prior was FRESH
 *      (staleSince=null), stamp `priorFetchedAt` — that's the actual
 *      time the value was last freshly fetched, not "now".
 *
 * Counterintuitive case: fresh GH fetch may succeed for stars but the
 * fetcher treats GH as a single atomic source (one HTTP call returns
 * all four GH fields). So `githubStaleSince` covers stars + openIssues
 * + pushedAt + archived as a unit.
 */
export function mergeWithPriorSnapshot(
  current: AgentFrameworkSnapshot,
  prior: AgentFrameworkSnapshot | null,
  priorFetchedAt: string | null,
  // currentRunIso retained as the fourth arg for symmetry / future use,
  // even though staleSince should never be stamped to it (the value was
  // demonstrably NOT fresh in this run by definition).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _currentRunIso: string,
): AgentFrameworkSnapshot {
  const merged: AgentFrameworkSnapshot = { ...current };
  const priorStamp = priorFetchedAt ?? "1970-01-01T00:00:00Z";

  // PyPI
  const pypiFresh = !current.fetchErrors.some((e) => e.source === "pypi");
  if (!pypiFresh && current.pypiWeeklyDownloads === null && prior?.pypiWeeklyDownloads !== null && prior?.pypiWeeklyDownloads !== undefined) {
    merged.pypiWeeklyDownloads = prior.pypiWeeklyDownloads;
    merged.pypiStaleSince = prior.pypiStaleSince ?? priorStamp;
  }

  // npm
  const npmFresh = !current.fetchErrors.some((e) => e.source === "npm");
  if (!npmFresh && current.npmWeeklyDownloads === null && prior?.npmWeeklyDownloads !== null && prior?.npmWeeklyDownloads !== undefined) {
    merged.npmWeeklyDownloads = prior.npmWeeklyDownloads;
    merged.npmStaleSince = prior.npmStaleSince ?? priorStamp;
  }

  // GitHub (atomic — all four fields share one fetch)
  const ghFresh = !current.fetchErrors.some((e) => e.source === "github");
  if (!ghFresh && prior) {
    if (current.stars === null && prior.stars !== null) merged.stars = prior.stars;
    if (current.openIssues === null && prior.openIssues !== null) merged.openIssues = prior.openIssues;
    if (current.pushedAt === null && prior.pushedAt !== null) merged.pushedAt = prior.pushedAt;
    if (current.archived === null && prior.archived !== null) merged.archived = prior.archived;
    if (merged.stars !== null || merged.pushedAt !== null) {
      merged.githubStaleSince = prior.githubStaleSince ?? priorStamp;
    }
  }

  // Recompute weeklyDownloads from the (possibly merged) per-source values.
  merged.weeklyDownloads =
    merged.pypiWeeklyDownloads === null && merged.npmWeeklyDownloads === null
      ? null
      : (merged.pypiWeeklyDownloads ?? 0) + (merged.npmWeeklyDownloads ?? 0);

  return merged;
}

export type AgentsIngestResult = {
  ok: boolean;
  /** ISO timestamp of the run. */
  fetchedAt: string;
  /** Snapshot key date (`YYYY-MM-DD` of fetchedAt, in UTC). */
  snapshotDate: string;
  /** Number of frameworks attempted. */
  attempted: number;
  /** Number of frameworks where any usable field landed. */
  succeeded: number;
  /** Per-framework error count for cron-health diagnostics. */
  failures: Array<{
    id: string;
    /** Backwards-compatible source list — preserved so existing log
     *  parsers and cron-health observability don't break. */
    sources: string[];
    /** S58: per-source error messages, including the upstream HTTP
     *  status + first 120 chars of the response body. Lets the
     *  Actions log distinguish pypistats-429 from pypistats-500 from
     *  schema-drift errors. */
    errors: Array<{ source: string; message: string }>;
  }>;
};

export type AgentsIngestOptions = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  ghToken?: string;
  /** Override the registry slate — tests inject a smaller list. */
  registry?: readonly AgentFramework[];
  /** Override read of the prior `agents:latest` blob (for merge). */
  readPriorLatest?: () => Promise<AgentFetchResult | null>;
  /** Override write functions — tests pass in spies. */
  writeLatest?: (blob: AgentFetchResult) => Promise<void>;
  writeSnapshot?: (date: string, blob: AgentFetchResult) => Promise<void>;
  /** Forwarded to fetchAgentSnapshots — tests pass 0 to skip the
   *  1500ms inter-framework throttle. */
  perFrameworkDelayMs?: number;
  /** Forwarded to fetchAgentSnapshots — tests pass 0 to skip the
   *  2000ms 429 retry backoff. */
  retry429BackoffMs?: number;
  /** Forwarded to fetchAgentSnapshots — tests pass a vi.fn. */
  sleep?: (ms: number) => Promise<void>;
};

export async function runAgentsIngest(
  opts: AgentsIngestOptions = {},
): Promise<AgentsIngestResult> {
  const registry = opts.registry ?? AGENT_FRAMEWORKS;
  const now = opts.now ?? (() => new Date());
  const ghToken = opts.ghToken ?? process.env.GH_TOKEN;
  const readPriorLatest = opts.readPriorLatest ?? readAgentsLatest;
  const writeLatest = opts.writeLatest ?? writeAgentsLatest;
  const writeSnapshot = opts.writeSnapshot ?? writeAgentsSnapshot;

  const fetchResult = await fetchAgentSnapshots(registry, {
    fetchImpl: opts.fetchImpl,
    now,
    ghToken,
    perFrameworkDelayMs: opts.perFrameworkDelayMs,
    retry429BackoffMs: opts.retry429BackoffMs,
    sleep: opts.sleep,
  });

  // Merge per-source last-known-good from the prior `agents:latest` blob.
  // Tombstone trust contract: a panel cell that says "9.6M · stale 4h" is
  // honest; a blank "—" next to "Sweep · dormant" reads as "this is also
  // dead" even when the framework actually has 9.6M weekly downloads
  // (S53 inference fix).
  const prior = await readPriorLatest();
  const priorById = new Map<string, AgentFrameworkSnapshot>();
  if (prior) {
    for (const f of prior.frameworks) priorById.set(f.id, f);
  }
  const priorFetchedAt = prior?.fetchedAt ?? null;
  const mergedFrameworks = fetchResult.frameworks.map((cur) =>
    mergeWithPriorSnapshot(
      cur,
      priorById.get(cur.id) ?? null,
      priorFetchedAt,
      fetchResult.fetchedAt,
    ),
  );
  const mergedResult: AgentFetchResult = {
    fetchedAt: fetchResult.fetchedAt,
    frameworks: mergedFrameworks,
  };

  // Success gate considers MERGED state — if the merge restored a value,
  // that framework is "succeeded" for the purposes of ok:true. A whole-
  // slate failure (zero usable fields across all 8 frameworks) still
  // returns ok:false and leaves the previous blob untouched.
  const succeeded = mergedResult.frameworks.filter(
    (f) =>
      f.weeklyDownloads !== null ||
      f.stars !== null ||
      f.pushedAt !== null ||
      f.archived !== null,
  ).length;

  const ok = succeeded > 0;
  const snapshotDate = mergedResult.fetchedAt.slice(0, 10);

  if (ok) {
    await writeLatest(mergedResult);
    await writeSnapshot(snapshotDate, mergedResult);
  }

  // Failures list comes from the RAW fetch, not the merged result —
  // it's the diagnostic trail of "what couldn't we refresh this run",
  // independent of whether the merge papered over the gap. Per-error
  // messages are preserved (S58) so the cron-health Actions log shows
  // the actual upstream HTTP code + body excerpt — was previously
  // dropped, leaving "pypi" as the only signal which made
  // pypistats-429 vs pypistats-500 indistinguishable.
  const failures = fetchResult.frameworks
    .filter((f) => f.fetchErrors.length > 0)
    .map((f) => ({
      id: f.id,
      sources: f.fetchErrors.map((e) => e.source),
      errors: f.fetchErrors.map((e) => ({
        source: e.source,
        message: e.message,
      })),
    }));

  return {
    ok,
    fetchedAt: mergedResult.fetchedAt,
    snapshotDate,
    attempted: registry.length,
    succeeded,
    failures,
  };
}
