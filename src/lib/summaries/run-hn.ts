/**
 * The machine-summary step of the Hacker News ingest: for link posts that will become NEWS cards
 * and whose source gave no text, fetch the article and store a grounded machine summary. Off
 * unless MACHINE_SUMMARIES=on AND NVIDIA_NIM_KEY is set. Never throws; never fails the ingest.
 */

import type { HnWireItem } from "@/lib/data/wire-hn";
import { isNewsCandidate } from "@/lib/feed/derivers/news";
import { summariseArticle } from "@/lib/summaries/machine-summary";
import { MACHINE_SUMMARIES_PER_DAY, type MachineSummaryStore } from "@/lib/summaries/store";

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

export type MachineSummaryRun = {
  enabled: boolean;
  written: number;
  skipped: Record<string, number>;
  capped: boolean;
};

export async function runHnMachineSummaries(opts: {
  items: HnWireItem[];
  store: MachineSummaryStore;
  env?: Record<string, string | undefined>;
  nowMs?: number;
  fetchImpl?: typeof fetch;
  perRun?: number;
  clock?: () => number;
}): Promise<MachineSummaryRun> {
  const clock = opts.clock ?? Date.now;
  const startedAt = clock();
  const run: MachineSummaryRun = { enabled: false, written: 0, skipped: {}, capped: false };
  const config = machineSummaryConfig(opts.env);
  if (!config || !opts.store.available()) return run;
  run.enabled = true;
  const nowMs = opts.nowMs ?? Date.now();
  const day = new Date(nowMs).toISOString().slice(0, 10);
  const candidates = opts.items.filter((i) => needsMachineSummary(i, nowMs));
  const existing = await opts.store.read(candidates.map((i) => machineSummaryKey(i.id)));
  const todo = candidates.filter((i) => !existing.has(machineSummaryKey(i.id)));
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
      const outcome = await summariseArticle({
        url: item.url!, title: item.title, apiKey: config.apiKey, fetchImpl: opts.fetchImpl,
        now: () => new Date(nowMs),
      });
      if (outcome.ok) {
        await opts.store.write(machineSummaryKey(item.id), outcome.summary);
        await opts.store.claim(day);
        run.written += 1;
      } else {
        run.skipped[outcome.reason] = (run.skipped[outcome.reason] ?? 0) + 1;
      }
    } catch {
      run.skipped.store = (run.skipped.store ?? 0) + 1;
    }
  }
  return run;
}
