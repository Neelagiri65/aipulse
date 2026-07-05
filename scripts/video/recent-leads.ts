/**
 * Previous days' actual video titles, newest first — the ground truth
 * for "what has a viewer already seen leading the channel". Read from
 * data/upload-log.json (heal-run stub entries without a title are
 * skipped). Fail-soft: a missing/corrupt log disables lead rotation,
 * it never blocks the pipeline.
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

export function readRecentLeadTitles(limit = 5): string[] {
  const logPath = resolve(process.cwd(), "data/upload-log.json");
  if (!existsSync(logPath)) return [];
  try {
    const log: Array<{ date?: string; title?: string }> = JSON.parse(
      readFileSync(logPath, "utf-8"),
    );
    return log
      .filter((e) => typeof e.title === "string")
      .slice(-limit)
      .reverse()
      .map((e) => e.title as string);
  } catch {
    return [];
  }
}
