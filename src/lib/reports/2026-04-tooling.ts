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

import type { GenesisReportConfig } from "@/lib/reports/types";

export const report202604Tooling: GenesisReportConfig = {
  slug: "2026-04-tooling",
  // Editorial copy supplied by the operator (Neelagiri) on 2026-05-04
  // after reviewing the live data on prod. Section order matches the
  // editorial flow: lead with what climbed (the surprise), then the
  // mirror (what fell), then SDK / labs / tools / agents context.
  title: "Who's actually winning in AI tooling — April 2026",
  subtitle:
    "30 days of verified data across models, SDKs, and tools. Every number links to its source.",
  window: "April 2026",
  publishedAt: "DRAFT",
  hero: {
    // The hero stat is a one-line statement of the report's lead
    // finding. The engine doesn't fill this — the operator picks it
    // from the live blocks. Source URL points to the live OpenRouter
    // model page so a reader can verify in one click.
    stat:
      "Tencent Hy3 Preview climbed 25 OpenRouter ranks to #1 in April",
    caption:
      "Three Chinese open-weight models entered the top-25 while two OpenAI models fell out of the top-40.",
    sourceUrl: "https://openrouter.ai/rankings",
    sourceLabel: "openrouter.ai/rankings",
  },
  thesis:
    "April's biggest story isn't a model release — it's a shift in who developers are actually paying to use. Three Chinese models (Tencent Hy3, DeepSeek V4 Flash, MiniMax M2.5) climbed into OpenRouter's top 25 while two OpenAI models fell out of the top 40. The data doesn't say why. It says what happened.",
  // Section order matches the editorial flow. Every header is a
  // statement, not a category label — the body of the section is
  // the data, the framing is one short context line.
  sections: [
    {
      header: "Climbing the OpenRouter ranks",
      framing:
        "Rank changes between the start and end of the window. Climbers only — see the next section for fallers.",
      blockId: "openrouter-rank-climbers-30d",
    },
    {
      header: "Falling on OpenRouter",
      framing:
        "Same window, opposite direction. Movement here is request-volume movement, not capability change.",
      blockId: "openrouter-rank-fallers-30d",
    },
    {
      header: "SDK download gainers",
      framing:
        "Where developers are placing real install bets, ranked by % growth across PyPI / npm / crates / Docker / brew / VS Code.",
      blockId: "sdk-adoption-gainers-30d",
    },
    {
      header: "SDK download losers",
      framing:
        "Same registries, packages losing developer base. Steepest decline first.",
      blockId: "sdk-adoption-losers-30d",
    },
    {
      header: "AI labs by GitHub activity",
      framing:
        "Ranked by total public-event volume across each lab's flagship repos. Geographic spread visible per row.",
      blockId: "labs-activity-leaders-30d",
    },
    {
      header: "Provider incident-days",
      framing:
        "Active incidents on the public status pages, summed per UTC day captured. More incident-days = more days a provider was flapping.",
      blockId: "tool-incidents-30d",
    },
    {
      header: "Agent framework velocity",
      framing:
        "Weekly download delta across the tracked agent frameworks. Archived frameworks excluded.",
      blockId: "agents-velocity-30d",
    },
  ],
};
