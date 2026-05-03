/**
 * Agents-view assembler — joins the editorial registry with the latest
 * fetch result and (optionally) a 7-day-old snapshot to produce per-row
 * display data with deltas, badges, and caveat passthrough.
 *
 * Pure: takes data in, returns data out. No I/O.
 *
 * Delta state vocabulary (drives both the panel and the digest section):
 *   - "fresh"          → both today and 7d-old downloads present, % computed
 *   - "bootstrap"      → 7d-old snapshot missing OR row missing from it
 *   - "new-from-zero"  → prior=0, today>0 (avoid the divide-by-zero %)
 *
 * Badge precedence (top wins):
 *   1. GH `archived: true`    → "archived" (owner explicitly archived)
 *   2. registry.category="dormant" → "dormant" (editorial tombstone)
 *   3. registry.category="legacy"  → "legacy"
 *   4. pushedAt > 90 days ago AND not archived → "dormant" (runtime)
 *   5. otherwise → null
 *
 * Sort order: by w/w delta descending. Tombstones (legacy + any dormant
 * badge — editorial or runtime-derived) sort to the bottom regardless of
 * their delta, since their movement is not an "ecosystem signal" — a dead
 * project's number going up is a methodology artefact, not a story.
 */

import type {
  AgentFramework,
  AgentFrameworkCategory,
  AgentFrameworkLanguage,
} from "@/lib/data/agents-registry";
import type { AgentFetchResult } from "@/lib/data/agents-fetch";

const DORMANT_THRESHOLD_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/**
 * Hard cutoff for last-known-good carry-forward. Past this age the value
 * is too old to be honestly cited even with a "stale" pill — drop to
 * null so the panel renders "—" rather than misleading the reader with a
 * week-old number that may have moved 50%. Tombstone-style escalation
 * (dormant badge) only applies when pushedAt also indicates 90+d
 * inactivity; pypistats outages alone don't constitute a dormant signal.
 */
const STALE_HARD_CUTOFF_DAYS = 7;

export type AgentRowBadge = "archived" | "dormant" | "legacy";

export type AgentRowDeltaState = "fresh" | "bootstrap" | "new-from-zero";

export type AgentRowView = {
  id: string;
  name: string;
  category: AgentFrameworkCategory;
  languages: AgentFrameworkLanguage[];
  pypiPackage: string | null;
  npmPackage: string | null;
  githubRepo: string;
  weeklyDownloads: number | null;
  /**
   * ISO of the run when `weeklyDownloads` was last freshly fetched.
   * `null` means fresh THIS run (no stale carry-forward applied).
   * The worst staleness across the contributing PyPI + npm sources —
   * if pypi was carried forward but npm fetched fresh, this reflects
   * pypi's age. The panel renders an amber "stale Nh" pill when set;
   * the digest section can de-prioritise stale rows.
   *
   * Hard cutoff at STALE_HARD_CUTOFF_DAYS — values older than that
   * drop to weeklyDownloads=null + weeklyDownloadsStaleSince=null
   * (treated as cold-start gap rather than continuing to cite a
   * potentially-very-stale number).
   */
  weeklyDownloadsStaleSince: string | null;
  weeklyDeltaPct: number | null;
  deltaState: AgentRowDeltaState;
  stars: number | null;
  openIssues: number | null;
  pushedAt: string | null;
  archived: boolean | null;
  /** Mirrors `weeklyDownloadsStaleSince` for the GH metadata column —
   *  driven by `githubStaleSince` on the underlying snapshot. Same
   *  hard-cutoff semantics. */
  githubStaleSince: string | null;
  badge: AgentRowBadge | null;
  caveat: string | null;
};

export type AssembleAgentsViewInput = {
  registry: readonly AgentFramework[];
  current: AgentFetchResult;
  sevenDaysAgo: AgentFetchResult | null;
  now?: () => Date;
};

export type AgentsViewDto = {
  rows: AgentRowView[];
  generatedAt: string;
};

export function assembleAgentsView(
  input: AssembleAgentsViewInput,
): AgentsViewDto {
  const now = input.now ?? (() => new Date());
  const currentById = indexById(input.current);
  const priorById = input.sevenDaysAgo ? indexById(input.sevenDaysAgo) : null;

  const rows: AgentRowView[] = [];
  for (const fw of input.registry) {
    const cur = currentById.get(fw.id) ?? null;
    const prior = priorById ? (priorById.get(fw.id) ?? null) : null;
    rows.push(buildRow(fw, cur, prior, priorById !== null, now()));
  }

  rows.sort(sortRows);
  return { rows, generatedAt: now().toISOString() };
}

function indexById(result: AgentFetchResult) {
  const m = new Map<string, AgentFetchResult["frameworks"][number]>();
  for (const f of result.frameworks) m.set(f.id, f);
  return m;
}

function buildRow(
  fw: AgentFramework,
  cur: AgentFetchResult["frameworks"][number] | null,
  prior: AgentFetchResult["frameworks"][number] | null,
  haveSnapshot: boolean,
  now: Date,
): AgentRowView {
  // Worst staleness across the per-source values that contributed to
  // weeklyDownloads. Drop to null + clear staleSince when past the
  // hard cutoff (the value is too old to be honestly cited).
  const downloadsStaleSinceRaw = worstStaleness(
    [cur?.pypiStaleSince ?? null, cur?.npmStaleSince ?? null].filter(
      (s): s is string => s !== null,
    ),
  );
  const downloadsBeyondCutoff =
    downloadsStaleSinceRaw !== null &&
    isOlderThanDays(downloadsStaleSinceRaw, STALE_HARD_CUTOFF_DAYS, now);
  const weeklyDownloads = downloadsBeyondCutoff
    ? null
    : cur?.weeklyDownloads ?? null;
  const weeklyDownloadsStaleSince = downloadsBeyondCutoff
    ? null
    : downloadsStaleSinceRaw;

  const githubStaleSinceRaw = cur?.githubStaleSince ?? null;
  const githubBeyondCutoff =
    githubStaleSinceRaw !== null &&
    isOlderThanDays(githubStaleSinceRaw, STALE_HARD_CUTOFF_DAYS, now);
  const githubStaleSince = githubBeyondCutoff ? null : githubStaleSinceRaw;
  const stars = githubBeyondCutoff ? null : cur?.stars ?? null;
  const openIssues = githubBeyondCutoff ? null : cur?.openIssues ?? null;
  const pushedAt = githubBeyondCutoff ? null : cur?.pushedAt ?? null;
  const archived = githubBeyondCutoff ? null : cur?.archived ?? null;

  const { delta, deltaState } = computeDelta(
    weeklyDownloads,
    prior?.weeklyDownloads ?? null,
    haveSnapshot,
    prior !== null,
  );

  const badge = deriveBadge(fw.category, archived, pushedAt, now);

  return {
    id: fw.id,
    name: fw.name,
    category: fw.category,
    languages: [...fw.languages],
    pypiPackage: fw.pypiPackage ?? null,
    npmPackage: fw.npmPackage ?? null,
    githubRepo: fw.githubRepo,
    weeklyDownloads,
    weeklyDownloadsStaleSince,
    weeklyDeltaPct: delta,
    deltaState,
    stars,
    openIssues,
    pushedAt,
    archived,
    githubStaleSince,
    badge,
    caveat: fw.caveat ?? null,
  };
}

/** Earliest (oldest) ISO across the inputs — that's the worst staleness
 *  to report. Returns null if no input is stale. */
function worstStaleness(staleIsos: string[]): string | null {
  if (staleIsos.length === 0) return null;
  return staleIsos.reduce((oldest, iso) =>
    Date.parse(iso) < Date.parse(oldest) ? iso : oldest,
  );
}

function computeDelta(
  today: number | null,
  prior: number | null,
  haveSnapshot: boolean,
  haveRowInPrior: boolean,
): { delta: number | null; deltaState: AgentRowDeltaState } {
  if (!haveSnapshot || !haveRowInPrior) {
    return { delta: null, deltaState: "bootstrap" };
  }
  if (today === null || prior === null) {
    return { delta: null, deltaState: "bootstrap" };
  }
  if (prior === 0 && today > 0) {
    return { delta: null, deltaState: "new-from-zero" };
  }
  if (prior === 0 && today === 0) {
    return { delta: null, deltaState: "bootstrap" };
  }
  return { delta: ((today - prior) / prior) * 100, deltaState: "fresh" };
}

function deriveBadge(
  category: AgentFrameworkCategory,
  archived: boolean | null,
  pushedAt: string | null,
  now: Date,
): AgentRowBadge | null {
  if (archived === true) return "archived";
  if (category === "dormant") return "dormant";
  if (category === "legacy") return "legacy";
  if (pushedAt && isOlderThanDays(pushedAt, DORMANT_THRESHOLD_DAYS, now)) {
    return "dormant";
  }
  return null;
}

function isOlderThanDays(iso: string, days: number, now: Date): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t > days * MS_PER_DAY;
}

function sortRows(a: AgentRowView, b: AgentRowView): number {
  const aTomb = isTombstone(a);
  const bTomb = isTombstone(b);
  if (aTomb !== bTomb) return aTomb ? 1 : -1;
  // Both alive or both tombstone: order by delta desc, nulls last.
  return rankDelta(b.weeklyDeltaPct) - rankDelta(a.weeklyDeltaPct);
}

function isTombstone(r: AgentRowView): boolean {
  return r.badge === "legacy" || r.badge === "dormant" || r.badge === "archived";
}

/** null deltas sort below any real number. -Infinity puts them last when
 *  we sort by descending value. */
function rankDelta(d: number | null): number {
  return d === null ? -Infinity : d;
}
