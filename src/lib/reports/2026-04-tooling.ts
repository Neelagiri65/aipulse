/**
 * Genesis Report #1 — "April 2026 in AI tooling: who's gaining, who's losing"
 *
 * Status at scaffold time: ENGINEERING-COMPLETE, EDITORIAL PENDING.
 *
 * The operator (Neelagiri) fills in:
 *   - title
 *   - subtitle
 *   - hero.caption
 *   - thesis
 *   - sections[].header
 *   - sections[].framing
 *
 * The engine fills in (already wired):
 *   - hero.stat + hero.sourceUrl + hero.sourceLabel (from the loader)
 *   - sections[].blockId → live data block at render time
 *   - publishedAt (set on launch day)
 *   - sanity warnings + provenance per row
 *
 * Until the operator overwrites the EDITORIAL_PLACEHOLDER fields, the
 * /reports/2026-04-tooling page renders "[editorial section pending]"
 * inline. The launch-readiness gate (G8) refuses to mark the report
 * launch-ready while any placeholder remains.
 *
 * Per the PRD acceptance criterion #8 — no LLM, no engine-generated
 * prose, ever. Editorial copy is a hard human gate.
 */

import {
  EDITORIAL_PLACEHOLDER,
  type GenesisReportConfig,
} from "@/lib/reports/types";

export const report202604Tooling: GenesisReportConfig = {
  slug: "2026-04-tooling",
  // Operator-edit zone — title + subtitle + hero caption + thesis.
  title: EDITORIAL_PLACEHOLDER,
  subtitle: EDITORIAL_PLACEHOLDER,
  window: "April 2026",
  // Set on launch day. Until then, "DRAFT" so the public OG / page
  // never claims a publication date the report doesn't have.
  publishedAt: "DRAFT",
  hero: {
    // Engine fills `stat` + `sourceUrl` + `sourceLabel` at render time
    // when the operator picks which block's headline drives the OG.
    // Until then, a deterministic placeholder.
    stat: EDITORIAL_PLACEHOLDER,
    caption: EDITORIAL_PLACEHOLDER,
    sourceUrl: "https://gawk.dev/sources",
    sourceLabel: "Gawk sources",
  },
  thesis: EDITORIAL_PLACEHOLDER,
  // Section ORDER is the editorial decision; the BLOCK IDs are the
  // engineering catalogue. The operator may reorder, swap, or drop
  // sections — but every section's blockId must exist in the loader
  // registry (G3 + G5).
  sections: [
    {
      header: EDITORIAL_PLACEHOLDER,
      framing: EDITORIAL_PLACEHOLDER,
      blockId: "sdk-adoption-gainers-30d",
    },
    {
      header: EDITORIAL_PLACEHOLDER,
      framing: EDITORIAL_PLACEHOLDER,
      blockId: "sdk-adoption-losers-30d",
    },
    {
      header: EDITORIAL_PLACEHOLDER,
      framing: EDITORIAL_PLACEHOLDER,
      blockId: "openrouter-rank-climbers-30d",
    },
    {
      header: EDITORIAL_PLACEHOLDER,
      framing: EDITORIAL_PLACEHOLDER,
      blockId: "openrouter-rank-fallers-30d",
    },
    {
      header: EDITORIAL_PLACEHOLDER,
      framing: EDITORIAL_PLACEHOLDER,
      blockId: "labs-activity-leaders-30d",
    },
    {
      header: EDITORIAL_PLACEHOLDER,
      framing: EDITORIAL_PLACEHOLDER,
      blockId: "tool-incidents-30d",
    },
    {
      header: EDITORIAL_PLACEHOLDER,
      framing: EDITORIAL_PLACEHOLDER,
      blockId: "agents-velocity-30d",
    },
  ],
};
