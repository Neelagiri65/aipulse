/**
 * Gawk — tracked repos (complete per-repo event streams).
 *
 * The map's firehose source (`api.github.com/events`) is a heavily sampled
 * rolling window of global activity — any specific repo's events are
 * statistically invisible in it. This source polls the COMPLETE public
 * event stream of each repo in the founder-curated `data/tracked-repos.json`
 * list, so their activity is guaranteed on the map within one ingest poll.
 *
 * Trust contract (PRD prd-tracked-repos, 2026-07-04):
 *   - real public events only, verbatim from the per-repo API;
 *   - provenance disclosed: these points store `sourceKind: "tracked-repo"`
 *     (they render identically to firehose dots — founder decision — but
 *     the stored data never lies about how an event arrived);
 *   - curation disclosed: the list is a committed JSON + a registry entry;
 *   - per-repo failure isolation: one renamed/404 repo never takes down
 *     the others or the firehose ingest it rides along with.
 */

import { fetchRepoEvents, type GitHubEvent } from "@/lib/github";
import trackedData from "../../../data/tracked-repos.json";

export type TrackedFetchResult = {
  events: GitHubEvent[];
  failures: Array<{ step: string; message: string }>;
};

/** The curated list, exported for tests and the sanity check. */
export function trackedRepoList(): string[] {
  const repos = (trackedData as { repos?: unknown }).repos;
  if (!Array.isArray(repos)) return [];
  return repos.filter((r): r is string => typeof r === "string");
}

/**
 * Fetch all tracked repos' recent events with per-repo isolation.
 * `fetcher` is injectable for tests; defaults to the real API call.
 */
export async function fetchTrackedRepoEvents(
  fetcher: (fullName: string) => Promise<GitHubEvent[]> = fetchRepoEvents,
  repos: string[] = trackedRepoList(),
): Promise<TrackedFetchResult> {
  const failures: TrackedFetchResult["failures"] = [];
  const settled = await Promise.all(
    repos.map(async (fullName) => {
      try {
        return await fetcher(fullName);
      } catch (err) {
        failures.push({
          step: `tracked:${fullName}`,
          message: err instanceof Error ? err.message : String(err),
        });
        return [] as GitHubEvent[];
      }
    }),
  );
  return { events: settled.flat(), failures };
}
