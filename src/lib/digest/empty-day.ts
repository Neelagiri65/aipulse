/**
 * Empty-day detector for the digest composer.
 *
 * A day is "quiet" iff:
 *   - no tool-health incidents were observed in the last 24h, AND
 *   - every diff-bearing section (benchmarks, sdk-adoption, agents,
 *     labs, tool-health) is in `mode: "quiet"`.
 *
 * Agents are movement-gated upstream — the section only appears in
 * `sections` when at least one framework's |delta| exceeded the
 * threshold. So if an agents section is present here at all, it is by
 * definition `mode: "diff"` and the day is not quiet.
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
  "agents",
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
