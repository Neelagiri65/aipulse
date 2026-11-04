/**
 * The machine-summary step of the Hacker News ingest: for link posts that will become NEWS cards
 * and whose source gave no text, fetch the article and store a grounded machine summary. Off
 * unless MACHINE_SUMMARIES=on AND NVIDIA_NIM_KEY is set. Never throws; never fails the ingest.
 */

import type { HnWireItem } from "@/lib/data/wire-hn";
import { isNewsCandidate } from "@/lib/feed/derivers/news";
import { summariseArticle } from "@/lib/summaries/machine-summary";
import {
  MACHINE_SUMMARIES_PER_DAY,
  MACHINE_SUMMARY_ATTEMPTS_PER_DAY,
  type MachineSummaryFailure,
  type MachineSummaryStore,
} from "@/lib/summaries/store";

/** Per ingest run (every 15 min), so one run cannot spend the day or outlast the function. */
export const MACHINE_SUMMARIES_PER_RUN = 5;
/** No new summary starts after this much of the run: one summary can take 10 s (page) + 45 s
 *  (model), and the route's maxDuration is 120 s including the ingest itself. */
export const MACHINE_SUMMARY_TIME_BUDGET_MS = 40_000;

export function machineSummaryKey(hnId: string): string {
  return `hn:${hnId}`;
}

/** Enabled only with the flag on and a key present; otherwise the key is never read. */
export function machineSummaryConfig(env: Record<string, string | undefined> = process.env): { apiKey: string } | null {
  if (env.MACHINE_SUMMARIES !== "on") return null;
  const apiKey = env.NVIDIA_NIM_KEY?.trim();
  return apiKey ? { apiKey } : null;
}

/** A link post that will be a NEWS card and has no text of its own. */
export function needsMachineSummary(item: HnWireItem, nowMs: number): boolean {
  return isNewsCandidate(item, nowMs) && Boolean(item.url) && !item.storyText;
}

/**
 * When a failed item may be tried again. Before 2026-11-04 failures were not recorded, so every
 * 15-minute run fetched the same unreadable page and re-asked the model about the same rejected
 * article — up to ~96 calls a day per stuck item, none counted against the cap.
 *  - fetch / model: the next try waits 15 min, then 1 h.
 *  - too-short / ungrounded: final for that article text. Re-read the page after 6 h; the model
 *    is asked again only if the text changed.
 *  - Either way, 3 failed attempts and the item is given up (a page whose text changes on every
 *    read would otherwise reach the model every 6 h).
 * A store failure writes no record; it fails closed because the attempt counter throws first.
 */
export const TRANSIENT_WAITS_MS = [15 * 60_000, 60 * 60_000];
export const MAX_ATTEMPTS = 3;
export const FINAL_RECHECK_MS = 6 * 60 * 60_000;
const FINAL_REASONS = new Set(["too-short", "ungrounded"]);

export function isFinalFailure(f: MachineSummaryFailure): boolean {
  return FINAL_REASONS.has(f.reason);
}

export function retryDueAt(f: MachineSummaryFailure): number | null {
  const last = Date.parse(f.lastAt);
  if (!Number.isFinite(last)) return 0;
  if (f.attempts >= MAX_ATTEMPTS) return null;
  if (isFinalFailure(f)) return last + FINAL_RECHECK_MS;
  return last + TRANSIENT_WAITS_MS[Math.min(f.attempts, TRANSIENT_WAITS_MS.length) - 1];
}

export type MachineSummaryRun = {
  enabled: boolean;
  written: number;
  skipped: Record<string, number>;
  capped: boolean;
  /** Today's attempt ceiling was reached. */
  attemptsCapped?: boolean;
  /** Items not tried this run because an earlier failure's wait has not passed (or gave up). */
  waiting?: number;
  /** Every failure this run. The WHY (error body, rejected answer) is NOT here: this result is
   *  echoed into the public repo's Actions log, and a rejected answer is ungrounded model text.
   *  It is kept in the item's Redis failure record (msum:fail:hn:<id>) for the operator. */
  failures?: Array<{ id: string; reason: string; attempts: number }>;
};

export async function runHnMachineSummaries(opts: {
  items: HnWireItem[];
  store: MachineSummaryStore;
  env?: Record<string, string | undefined>;
  nowMs?: number;
  fetchImpl?: typeof fetch;
  perRun?: number;
  clock?: () => number;
  retryWaitMs?: number;
}): Promise<MachineSummaryRun> {
  const clock = opts.clock ?? Date.now;
  const startedAt = clock();
  const run: MachineSummaryRun = { enabled: false, written: 0, skipped: {}, capped: false, waiting: 0, failures: [] };
  const config = machineSummaryConfig(opts.env);
  if (!config || !opts.store.available()) return run;
  run.enabled = true;
  const nowMs = opts.nowMs ?? Date.now();
  const day = new Date(nowMs).toISOString().slice(0, 10);
  const candidates = opts.items.filter((i) => needsMachineSummary(i, nowMs));
  const existing = await opts.store.read(candidates.map((i) => machineSummaryKey(i.id)));
  const unsummarised = candidates.filter((i) => !existing.has(machineSummaryKey(i.id)));
  let failed: Map<string, MachineSummaryFailure>;
  try {
    failed = await opts.store.readFailures(unsummarised.map((i) => machineSummaryKey(i.id)));
  } catch {
    // Cannot tell which items already failed: retrying all of them is the pattern this replaced.
    run.skipped.store = (run.skipped.store ?? 0) + 1;
    return run;
  }
  const todo = unsummarised.filter((i) => {
    const prev = failed.get(machineSummaryKey(i.id));
    const due = prev ? retryDueAt(prev) : 0;
    const ready = due !== null && due <= nowMs;
    if (!ready) run.waiting! += 1;
    return ready;
  });
  for (const item of todo.slice(0, opts.perRun ?? MACHINE_SUMMARIES_PER_RUN)) {
    if (clock() - startedAt > MACHINE_SUMMARY_TIME_BUDGET_MS) {
      run.skipped.time = (run.skipped.time ?? 0) + 1;
      break;
    }
    try {
      if ((await opts.store.spent(day)) >= MACHINE_SUMMARIES_PER_DAY) {
        run.capped = true;
        break;
      }
      if ((await opts.store.attempted(day)) >= MACHINE_SUMMARY_ATTEMPTS_PER_DAY) {
        run.attemptsCapped = true;
        break;
      }
      await opts.store.countAttempt(day);
      const key = machineSummaryKey(item.id);
      const prev = failed.get(key);
      const outcome = await summariseArticle({
        url: item.url!, title: item.title, apiKey: config.apiKey, fetchImpl: opts.fetchImpl,
        now: () => new Date(nowMs),
        knownHash: prev && isFinalFailure(prev) ? prev.inputHash : undefined,
        retryWaitMs: opts.retryWaitMs,
        // A second model call may take another 45 s: only start one inside the run's budget.
        mayRetry: () => clock() - startedAt <= MACHINE_SUMMARY_TIME_BUDGET_MS,
      });
      if (outcome.ok) {
        await opts.store.write(key, outcome.summary);
        await opts.store.claim(day);
        run.written += 1;
      } else {
        run.skipped[outcome.reason] = (run.skipped[outcome.reason] ?? 0) + 1;
        const lastAt = new Date(nowMs).toISOString();
        // Same text as the last final failure: keep that verdict, restart its clock.
        const record: MachineSummaryFailure = outcome.reason === "unchanged" && prev
          ? { ...prev, lastAt }
          : {
              reason: outcome.reason,
              attempts: (prev?.attempts ?? 0) + 1,
              lastAt,
              inputHash: outcome.inputHash,
              detail: outcome.detail?.slice(0, 300),
            };
        await opts.store.writeFailure(key, record);
        run.failures!.push({ id: item.id, reason: outcome.reason, attempts: record.attempts });
      }
    } catch {
      run.skipped.store = (run.skipped.store ?? 0) + 1;
    }
  }
  return run;
}
