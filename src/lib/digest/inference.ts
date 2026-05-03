/**
 * Digest inference layer (S60 Build 1).
 *
 * Pure deterministic rules over the daily-snapshot history that emit
 * 0–3 factual "what moved" statements, rendered at the top of the
 * digest email + /digest/{date} page.
 *
 * Trust contract (per /CLAUDE.md non-negotiables):
 *   - Aggregate, do not score. Every line is a fact derivable from
 *     snapshot comparison: "X declined for the Nth consecutive
 *     snapshot", "first time in 30 days that...", "All tools
 *     operational for N days".
 *   - No editorial causation. The line "torch downloads declined for
 *     the 3rd consecutive week" is shippable. The line "the PyTorch
 *     ecosystem may be consolidating" is NOT — it asserts intent
 *     behind the data, which violates the aggregator stance.
 *   - No fabricated quantities. Every number cites a snapshot date
 *     and a source already on /sources.
 *   - Bootstrap-honest. With <3 days of history we return an empty
 *     array rather than claiming streaks that don't exist.
 *
 * Output is sorted by priority (highest first) and capped at 3.
 * Priority floor: only fire claims that would surprise a reader who
 * already saw yesterday's digest. "No change in top 3" is not a
 * surprise, so we don't ship it.
 */

import { isOpenWeight } from "@/lib/data/open-weight";
import type { DailySnapshot } from "@/lib/data/snapshot";
import type { ModelUsageSnapshotRow } from "@/lib/data/openrouter-types";

export const INFERENCE_MAX = 3;
/** Minimum snapshot history length for any streak claim. Below this we
 *  return an empty array — bootstrap days don't have enough comparison
 *  basis to claim "Nth consecutive". */
export const MIN_HISTORY_FOR_STREAKS = 3;
/** "First time in N days" lookback ceiling. Bounded so the claim is
 *  computable from the most-recent N snapshots and reads honestly
 *  ("first time in 30 days") rather than overclaiming forever. */
export const FIRST_TIME_LOOKBACK_DAYS = 30;
/** Streak length that registers as "all clean / all operational" for
 *  the tool-health rule. 7 = a calendar week. */
export const TOOL_HEALTH_CLEAN_DAYS = 7;
/** Minimum streak length for an SDK download trend to surface. <3
 *  reads as random walk; 3+ reads as direction. */
export const SDK_STREAK_MIN = 3;
/** Window cutoff for OpenRouter top-5 movement — only consider the
 *  most recent N snapshot dates (descending). Matches FIRST_TIME_LOOKBACK_DAYS. */
export const OR_LOOKBACK_DAYS = 30;

/** SDK packages we track for streaks. Keyed by source id (matches
 *  `SnapshotPackages` keys) → list of package names to check. The
 *  list mirrors the snapshot collector — no synthesis. */
const SDK_STREAK_PACKAGES: Record<string, string[]> = {
  pypi: ["torch", "transformers", "anthropic", "openai", "langchain", "huggingface-hub", "diffusers"],
  npm: ["@anthropic-ai/sdk", "openai", "@langchain/core", "ai", "llamaindex"],
};

export type DeriveInferencesInput = {
  /** Snapshot history, NEWEST FIRST. Index 0 is today; index 1 is yesterday;
   *  etc. The composer passes whatever readRecentSnapshots returned. */
  history: readonly DailySnapshot[];
  /** OpenRouter date → top-N slugs map. Optional — when omitted, the
   *  OpenRouter-derived rules are silently skipped. */
  openrouterSnapshots?: Record<string, ModelUsageSnapshotRow>;
  /** Count of incidents in the trailing 24h. Optional; when omitted,
   *  tool-health-clean is skipped (we can't claim "0 today" without
   *  knowing today). */
  incidentCount24h?: number;
};

type Candidate = { priority: number; text: string };

export function deriveInferences(input: DeriveInferencesInput): string[] {
  const { history, openrouterSnapshots, incidentCount24h } = input;
  if (history.length < MIN_HISTORY_FOR_STREAKS) return [];

  const candidates: Candidate[] = [];

  // Priority 100: cross-section "first time in N days" claims (rare, high signal)
  const orFirstTime = detectOpenRouterFirstTimeOpenWeight(
    history,
    openrouterSnapshots,
  );
  if (orFirstTime) candidates.push({ priority: 100, text: orFirstTime });

  // Priority 90: benchmark leader changed today (new #1)
  const benchmarkChange = detectBenchmarkLeaderChange(history);
  if (benchmarkChange) candidates.push({ priority: 90, text: benchmarkChange });

  // Priority 80: OpenRouter top-5 open-weight count moved today
  const orMovement = detectOpenWeightTopFiveMovement(
    history,
    openrouterSnapshots,
  );
  if (orMovement) candidates.push({ priority: 80, text: orMovement });

  // Priority 70: benchmark leader streak (≥7 snapshots holding #1)
  const benchmarkStreak = detectBenchmarkLeaderStreak(history);
  if (benchmarkStreak) candidates.push({ priority: 70, text: benchmarkStreak });

  // Priority 60: SDK monotonic streaks (length ≥3)
  for (const sdk of detectSdkStreaks(history)) {
    candidates.push({ priority: 60 + Math.min(sdk.streak, 9), text: sdk.text });
  }

  // Priority 30: tool-health "all clean for N days" (low-signal but honest)
  const cleanStreak = detectToolHealthCleanStreak(history, incidentCount24h);
  if (cleanStreak) candidates.push({ priority: 30, text: cleanStreak });

  // Sort by priority descending, then by text alphabetically for
  // determinism on ties. Cap at INFERENCE_MAX.
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.text.localeCompare(b.text);
  });
  return candidates.slice(0, INFERENCE_MAX).map((c) => c.text);
}

// ---------------------------------------------------------------------------
// OpenRouter rules
// ---------------------------------------------------------------------------

/**
 * Count open-weight models in OpenRouter top-5 today vs yesterday.
 * Emits a line ONLY when the count changed. "Same as yesterday" is
 * not a surprise worth surfacing.
 */
export function detectOpenWeightTopFiveMovement(
  history: readonly DailySnapshot[],
  openrouterSnapshots?: Record<string, ModelUsageSnapshotRow>,
): string | null {
  if (!openrouterSnapshots) return null;
  if (history.length < 2) return null;
  const todayDate = history[0].date;
  const yesterdayDate = history[1].date;
  const today = openrouterSnapshots[todayDate];
  const yesterday = openrouterSnapshots[yesterdayDate];
  if (!today || !yesterday) return null;
  const todayCount = countOpenWeightInTopN(today.slugs, 5);
  const yesterdayCount = countOpenWeightInTopN(yesterday.slugs, 5);
  if (todayCount === yesterdayCount) return null;
  return `Open-weight models hold ${todayCount} of the OpenRouter top 5 (vs ${yesterdayCount} yesterday).`;
}

/**
 * "First time in N days that K open-weight models are in the top 5."
 * Looks back through snapshot dates (NEWEST FIRST) for the most recent
 * day with the same count. If today's count is the highest seen in
 * the lookback window AND the count is ≥3, emits the claim. Else null.
 */
export function detectOpenRouterFirstTimeOpenWeight(
  history: readonly DailySnapshot[],
  openrouterSnapshots?: Record<string, ModelUsageSnapshotRow>,
): string | null {
  if (!openrouterSnapshots) return null;
  const todayDate = history[0]?.date;
  if (!todayDate) return null;
  const today = openrouterSnapshots[todayDate];
  if (!today) return null;
  const todayCount = countOpenWeightInTopN(today.slugs, 5);
  if (todayCount < 3) return null; // floor for "noteworthy" — 1 or 2 isn't a milestone

  // Walk the history (newest first, skipping today) and count past days
  // matching todayCount. If none in lookback window, today is novel.
  const lookback = Math.min(history.length - 1, FIRST_TIME_LOOKBACK_DAYS);
  for (let i = 1; i <= lookback; i++) {
    const date = history[i]?.date;
    if (!date) break;
    const row = openrouterSnapshots[date];
    if (!row) continue;
    const c = countOpenWeightInTopN(row.slugs, 5);
    if (c >= todayCount) {
      // Already happened in lookback — not a "first time" claim.
      return null;
    }
  }
  return `First time in ${lookback} days that ${todayCount} open-weight models are in the OpenRouter top 5.`;
}

function countOpenWeightInTopN(slugs: readonly string[], n: number): number {
  let count = 0;
  for (let i = 0; i < Math.min(slugs.length, n); i++) {
    if (isOpenWeight(slugs[i])) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Benchmark rules
// ---------------------------------------------------------------------------

export function detectBenchmarkLeaderChange(
  history: readonly DailySnapshot[],
): string | null {
  if (history.length < 2) return null;
  const today = history[0]?.benchmarks?.top3?.[0];
  const yesterday = history[1]?.benchmarks?.top3?.[0];
  if (!today || !yesterday) return null;
  if (today.modelName === yesterday.modelName) return null;
  return `New #1 on LMArena: ${today.modelName} overtook ${yesterday.modelName}.`;
}

export function detectBenchmarkLeaderStreak(
  history: readonly DailySnapshot[],
): string | null {
  const todayLeader = history[0]?.benchmarks?.top3?.[0]?.modelName;
  if (!todayLeader) return null;
  let streak = 1;
  for (let i = 1; i < history.length; i++) {
    const name = history[i]?.benchmarks?.top3?.[0]?.modelName;
    if (name === todayLeader) {
      streak++;
    } else {
      break;
    }
  }
  // Only surface streaks ≥7 (a week). Anything shorter is the
  // expected steady state and would clutter the TLDR.
  if (streak < 7) return null;
  return `${todayLeader} holds #1 on LMArena for the ${ordinal(streak)} consecutive snapshot.`;
}

// ---------------------------------------------------------------------------
// SDK download streaks
// ---------------------------------------------------------------------------

type SdkStreak = { streak: number; text: string };

export function detectSdkStreaks(
  history: readonly DailySnapshot[],
): SdkStreak[] {
  if (history.length < SDK_STREAK_MIN) return [];
  const out: SdkStreak[] = [];
  for (const [sourceId, packages] of Object.entries(SDK_STREAK_PACKAGES)) {
    for (const pkg of packages) {
      const series = readSeries(history, sourceId, pkg);
      if (series.length < SDK_STREAK_MIN) continue;
      const streak = monotonicStreak(series);
      if (streak.length < SDK_STREAK_MIN) continue;
      const direction = streak.dir === "down" ? "declined" : "grew";
      out.push({
        streak: streak.length,
        text: `${pkg} downloads ${direction} for the ${ordinal(streak.length)} consecutive snapshot.`,
      });
    }
  }
  // Cap to most-prominent 3 streaks (longest first) so a single TLDR
  // doesn't drown in SDK movement.
  out.sort((a, b) => b.streak - a.streak);
  return out.slice(0, 3);
}

/** Read the `lastWeek` counter for a package across history, NEWEST FIRST.
 *  Skips snapshots where the package is missing or lastWeek is undefined. */
function readSeries(
  history: readonly DailySnapshot[],
  sourceId: string,
  pkg: string,
): number[] {
  const out: number[] = [];
  for (const snap of history) {
    const entries = snap.packages?.[sourceId];
    if (!entries) {
      out.push(NaN);
      continue;
    }
    const found = entries.find((e) => e.name === pkg);
    if (!found || typeof found.lastWeek !== "number") {
      out.push(NaN);
      continue;
    }
    out.push(found.lastWeek);
  }
  return out;
}

/** Length of the leading monotonic run (newest-first). dir = "down"
 *  means today < yesterday < day-before-yesterday < ... ; "up" the
 *  reverse. NaN gaps break the streak. Strict inequality — equal
 *  values do NOT extend a streak. */
function monotonicStreak(series: readonly number[]): {
  length: number;
  dir: "up" | "down" | "flat";
} {
  if (series.length < 2) return { length: 0, dir: "flat" };
  const a = series[0];
  const b = series[1];
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) {
    return { length: 0, dir: "flat" };
  }
  const dir: "up" | "down" = a < b ? "down" : "up";
  let length = 2;
  for (let i = 2; i < series.length; i++) {
    const prev = series[i - 1];
    const cur = series[i];
    if (!Number.isFinite(cur) || !Number.isFinite(prev)) break;
    if (dir === "down" && prev < cur) {
      length++;
    } else if (dir === "up" && prev > cur) {
      length++;
    } else {
      break;
    }
  }
  return { length, dir };
}

// ---------------------------------------------------------------------------
// Tool health rule
// ---------------------------------------------------------------------------

/**
 * "All AI coding tools operational across the past N days." Fires when:
 *   - today (history[0]) shows zero active incidents per snapshot.tools
 *   - the prior TOOL_HEALTH_CLEAN_DAYS - 1 snapshots also show zero
 *   - incidentCount24h === 0 (so we don't lie when the snapshot is
 *     stale and missed an incident inside the 24h window)
 *
 * Anything weaker reads as filler — incidents do happen and we have
 * the per-tool "Last incident" recap on the dashboard for finer
 * granularity. The TLDR is for the streak signal only.
 */
export function detectToolHealthCleanStreak(
  history: readonly DailySnapshot[],
  incidentCount24h?: number,
): string | null {
  if (incidentCount24h === undefined) return null;
  if (incidentCount24h !== 0) return null;
  if (history.length < TOOL_HEALTH_CLEAN_DAYS) return null;
  for (let i = 0; i < TOOL_HEALTH_CLEAN_DAYS; i++) {
    const tools = history[i]?.tools;
    if (!tools) return null;
    const anyIncident = tools.some(
      (t) =>
        t.activeIncidents > 0 ||
        (t.status !== "operational" && t.status !== "none"),
    );
    if (anyIncident) return null;
  }
  return `All AI coding tools operational across the past ${TOOL_HEALTH_CLEAN_DAYS} days.`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ordinal(n: number): string {
  if (n <= 0) return String(n);
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
