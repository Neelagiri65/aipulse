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
} from "@/lib/data/agents-fetch";
import {
  writeAgentsLatest,
  writeAgentsSnapshot,
} from "@/lib/data/agents-store";

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
  failures: Array<{ id: string; sources: string[] }>;
};

export type AgentsIngestOptions = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  ghToken?: string;
  /** Override the registry slate — tests inject a smaller list. */
  registry?: readonly AgentFramework[];
  /** Override write functions — tests pass in spies. */
  writeLatest?: (blob: AgentFetchResult) => Promise<void>;
  writeSnapshot?: (date: string, blob: AgentFetchResult) => Promise<void>;
};

export async function runAgentsIngest(
  opts: AgentsIngestOptions = {},
): Promise<AgentsIngestResult> {
  const registry = opts.registry ?? AGENT_FRAMEWORKS;
  const now = opts.now ?? (() => new Date());
  const ghToken = opts.ghToken ?? process.env.GH_TOKEN;
  const writeLatest = opts.writeLatest ?? writeAgentsLatest;
  const writeSnapshot = opts.writeSnapshot ?? writeAgentsSnapshot;

  const fetchResult = await fetchAgentSnapshots(registry, {
    fetchImpl: opts.fetchImpl,
    now,
    ghToken,
  });

  const succeeded = fetchResult.frameworks.filter(
    (f) =>
      f.weeklyDownloads !== null ||
      f.stars !== null ||
      f.pushedAt !== null ||
      f.archived !== null,
  ).length;

  const ok = succeeded > 0;
  const snapshotDate = fetchResult.fetchedAt.slice(0, 10);

  if (ok) {
    await writeLatest(fetchResult);
    await writeSnapshot(snapshotDate, fetchResult);
  }

  const failures = fetchResult.frameworks
    .filter((f) => f.fetchErrors.length > 0)
    .map((f) => ({
      id: f.id,
      sources: f.fetchErrors.map((e) => e.source),
    }));

  return {
    ok,
    fetchedAt: fetchResult.fetchedAt,
    snapshotDate,
    attempted: registry.length,
    succeeded,
    failures,
  };
}
