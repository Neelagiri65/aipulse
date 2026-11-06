/**
 * Integrity probe for the machine-summary model (added 2026-11-06).
 *
 * openai/gpt-oss-20b stayed listed in the NIM catalogue but timed out on every call for at least
 * a week; no summary was written after 2026-10-29 and nothing paged, because failures were only
 * counted per item. This reads the cross-item streak (msum:model) and FAILs past a threshold, so
 * the integrity-watch workflow pages Discord.
 *
 * The board is public: the report carries counts and timestamps only — never an error body.
 */

import { buildReport, type IntegrityReport } from "@/lib/integrity/checks";
import type { ModelHealth } from "@/lib/summaries/store";

/** Model calls in a row with no answer before it pages. Each item is tried at most 3 times with
 *  15 min / 1 h waits, so 3 in a row spans more than one item or more than an hour: not a blip. */
export const MODEL_FAIL_STREAK_PAGE = 3;

export function evaluateMachineSummaries(args: {
  enabled: boolean;
  /** "unreadable" when Redis could not be read — distinct from "no record yet". */
  health: ModelHealth | null | "unreadable";
  now: number;
}): IntegrityReport {
  const observedAt = new Date(args.now).toISOString();
  const report = (ok: boolean, severity: "critical" | "warn" | "info", detail: string) =>
    buildReport({ source: "machine-summaries", observedAt, checks: [{ name: "model-answers", ok, severity, detail }] });

  if (!args.enabled) return report(true, "info", "machine summaries are off");
  if (args.health === "unreadable") return report(false, "warn", "could not read the model's record (Redis)");
  if (!args.health) return report(true, "info", "no model call recorded yet");

  const { failStreak, lastOkAt } = args.health;
  if (failStreak >= MODEL_FAIL_STREAK_PAGE) {
    return report(
      false,
      "critical",
      `model failed ${failStreak} consecutive calls; last answer ${lastOkAt ?? "never"}`,
    );
  }
  return report(true, "info", `model answering (${failStreak} failed since last answer ${lastOkAt ?? "never"})`);
}
