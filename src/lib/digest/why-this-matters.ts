/**
 * "Why this matters" educational framing per digest section.
 *
 * Pure deterministic copy keyed off the section id. Renders under the
 * section headline in both the email template and the public web
 * digest. The line is evergreen — it explains why the section exists
 * regardless of whatever the day's numbers happened to do — so it
 * never needs an LLM at compose time and can never fabricate a take
 * that the underlying data doesn't support.
 *
 * Trust contract:
 *   - Each line is one short sentence. Educational, not opinion.
 *   - No scoring language ("best", "winning", "leader"). No invented
 *     causality ("because X did Y"). No reactive copy that depends on
 *     daily data — that path slides into editorialising.
 *   - Copy is centrally edited here. If a section's framing needs to
 *     change, that's one file, one PR, no migration.
 *
 * Tone calibration: a smart-generalist developer / CTO who already
 * subscribed to Gawk. They know the basics; they want the lens.
 */

import type { DigestSectionId } from "@/lib/digest/types";

const COPY: Record<DigestSectionId, string> = {
  "tool-health":
    "Provider outages and degradations cause retry storms upstream. Tracking the 7-day shape catches flapping providers before they page you.",
  hn:
    "What developers debate on Hacker News often previews which models, frameworks, and patterns they'll actually adopt next.",
  benchmarks:
    "Public benchmarks are gameable, but rank shuffles still hint at where the frontier is genuinely moving.",
  "sdk-adoption":
    "Package install volume is where developers place real bets — distinct from where labs are shipping marketing.",
  agents:
    "Agent frameworks rise and fall on weekly download velocity and open-issue trajectory, not GitHub stars.",
  labs:
    "GitHub event volume on a lab's own repos is the cleanest publicly-verifiable proxy for engineering activity we have.",
  "model-usage":
    "OpenRouter rankings reflect API-first developer spend; direct customers like consumer ChatGPT are invisible by construction.",
};

export function whyThisMatters(sectionId: DigestSectionId): string {
  return COPY[sectionId];
}

/** Sorted list of section ids, exposed for tests that want to assert
 *  every monitored section has copy. Mirror of the COPY map keys. */
export const WHY_THIS_MATTERS_SECTION_IDS: readonly DigestSectionId[] =
  Object.keys(COPY).sort() as DigestSectionId[];
