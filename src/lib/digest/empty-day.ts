/**
 * Empty-day detector for the digest composer.
 *
 * A day is "quiet" iff:
 *   - no tool-health incidents were observed in the last 24h, AND
 *   - every diff-bearing section (benchmarks, sdk-adoption, labs,
 *     tool-health) is in `mode: "quiet"`.
 *
 * HN is deliberately excluded from the quiet-detection logic: the HN
 * wire always has content, and its presence should never block the
 * "All quiet in the AI ecosystem" headline. The quiet-day email still
 * shows HN as a current-state tile — the quietness is about tracked
 * *movement*, not about whether the internet has news.
 */

import type { DigestSection } from "@/lib/digest/types";

const DIFF_BEARING_SECTIONS = new Set<DigestSection["id"]>([
  "tool-health",
  "benchmarks",
  "sdk-adoption",
  "labs",
]);

export type EmptyDayInput = {
  sections: DigestSection[];
  incidentCount24h: number;
};

export function detectEmptyDay(input: EmptyDayInput): boolean {
  if (input.incidentCount24h > 0) return false;
  const diffBearing = input.sections.filter((s) =>
    DIFF_BEARING_SECTIONS.has(s.id),
  );
  if (diffBearing.length === 0) return false;
  return diffBearing.every((s) => s.mode === "quiet");
}
