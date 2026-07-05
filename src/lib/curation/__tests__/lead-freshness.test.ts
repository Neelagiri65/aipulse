/**
 * Cross-day lead freshness — pinned against the REAL six-day incident
 * titles (2026-06-30 → 07-05, all "DeepSeek V4 Flash takes/holds #1 on
 * OpenRouter"). The rule that was recorded as implemented but never
 * existed in code, caught by the founder watching the channel.
 */
import { describe, expect, it } from "vitest";

import {
  leadTokens,
  rotateLeadForFreshness,
  sameLead,
} from "@/lib/curation/lead-freshness";

// Verbatim from data/upload-log.json, newest first.
const REAL_RECENT_TITLES = [
  "DeepSeek V4 Flash holds #1 on OpenRouter | Gawk Daily — 4 July 2026",
  "DeepSeek V4 Flash holds #1 on OpenRouter | Gawk Daily — 3 July 2026",
  "DeepSeek V4 Flash holds #1 on OpenRouter | Gawk Daily — 2 July 2026",
  "DeepSeek V4 Flash holds #1 on OpenRouter | Gawk Daily — 1 July 2026",
  "DeepSeek V4 Flash takes #1 on OpenRouter | Gawk Daily — 30 June 2026",
];

const n = (headline: string) => ({ headline });

describe("sameLead — wording drift still counts as the same story", () => {
  it('"takes #1" and "holds #1" are the SAME lead', () => {
    expect(
      sameLead(
        "DeepSeek V4 Flash takes #1 on OpenRouter",
        "DeepSeek V4 Flash holds #1 on OpenRouter",
      ),
    ).toBe(true);
  });

  it("a genuinely different story is NOT the same lead", () => {
    expect(
      sameLead(
        "DeepSeek V4 Flash holds #1 on OpenRouter",
        "Anthropic ships Claude Opus 4.8",
      ),
    ).toBe(false);
  });

  it("the Gawk Daily date suffix never affects matching", () => {
    expect(
      leadTokens("X | Gawk Daily — 5 July 2026").has("july"),
    ).toBe(false);
  });
});

describe("rotateLeadForFreshness", () => {
  it("THE INCIDENT: day-6 of the same lead rotates to the first distinct story", () => {
    const result = rotateLeadForFreshness(
      [
        n("DeepSeek V4 Flash holds #1 on OpenRouter"),
        n("langchain downloads jump 18% week-over-week"),
        n("Anthropic leads 7-day GitHub activity"),
      ],
      REAL_RECENT_TITLES,
    );
    expect(result.rotated).toBe(true);
    expect(result.narratives[0].headline).toBe(
      "langchain downloads jump 18% week-over-week",
    );
    // The repeated story stays IN the video — still true, just not the lead.
    expect(result.narratives.map((x) => x.headline)).toContain(
      "DeepSeek V4 Flash holds #1 on OpenRouter",
    );
    expect(result.narratives).toHaveLength(3);
  });

  it("a second consecutive day is allowed (limit is 2)", () => {
    const result = rotateLeadForFreshness(
      [n("DeepSeek V4 Flash holds #1 on OpenRouter"), n("Other story")],
      [REAL_RECENT_TITLES[0]] , // led exactly 1 prior day
    );
    expect(result.rotated).toBe(false);
  });

  it("a third consecutive day rotates", () => {
    const result = rotateLeadForFreshness(
      [n("DeepSeek V4 Flash holds #1 on OpenRouter"), n("Other story")],
      REAL_RECENT_TITLES.slice(0, 2), // led the 2 prior days
    );
    expect(result.rotated).toBe(true);
    expect(result.narratives[0].headline).toBe("Other story");
  });

  it("no distinct alternative → kept, with the decision disclosed (never silent)", () => {
    const result = rotateLeadForFreshness(
      [
        n("DeepSeek V4 Flash holds #1 on OpenRouter"),
        n("DeepSeek V4 Flash still holds #1 on OpenRouter"),
      ],
      REAL_RECENT_TITLES,
    );
    expect(result.rotated).toBe(false);
    expect(result.reason).toContain("NO distinct alternative");
  });

  it("a fresh lead passes through untouched", () => {
    const input = [n("Anthropic ships Claude Opus 4.8"), n("Other")];
    const result = rotateLeadForFreshness(input, REAL_RECENT_TITLES);
    expect(result.rotated).toBe(false);
    expect(result.narratives).toEqual(input);
  });

  it("non-consecutive history does not accumulate (only the streak counts)", () => {
    const result = rotateLeadForFreshness(
      [n("DeepSeek V4 Flash holds #1 on OpenRouter"), n("Other story")],
      [
        "Anthropic ships Claude Opus 4.8 | Gawk Daily — 4 July 2026",
        ...REAL_RECENT_TITLES,
      ],
    );
    expect(result.rotated).toBe(false);
  });
});
