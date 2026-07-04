import { describe, expect, it } from "vitest";

import { deltaDirection } from "@/lib/email/delta";

describe("deltaDirection", () => {
  it("classifies gains", () => {
    expect(deltaDirection("+2.3M 24h downloads day-over-day")).toBe("up");
    expect(deltaDirection("climbed +44 to #6")).toBe("up");
    expect(deltaDirection("▲ 320.5k pulls")).toBe("up");
  });

  it("classifies losses (ascii hyphen AND unicode minus)", () => {
    expect(deltaDirection("−22.1k 24h downloads day-over-day")).toBe("down");
    expect(deltaDirection("slipped -38 to #47")).toBe("down");
    expect(deltaDirection("Pydantic AI · -44%")).toBe("down");
  });

  it("never matches hyphenated words or slugs", () => {
    expect(deltaDirection("day-over-day comparison window")).toBe("neutral");
    expect(deltaDirection("claude-opus-4-6-thinking holds #1")).toBe("neutral");
    expect(deltaDirection("No rank changes in the LMArena top 3")).toBe(
      "neutral",
    );
  });

  it("first signed token wins on mixed lines", () => {
    expect(deltaDirection("+44 to #6 (was -3 last week)")).toBe("up");
    expect(deltaDirection("-38 to #47 (recovering +2 today)")).toBe("down");
  });

  it("falls through undefined/unsigned texts to the first signal", () => {
    expect(deltaDirection(undefined, "holds steady", "−1.9k 30d")).toBe("down");
    expect(deltaDirection(undefined, undefined)).toBe("neutral");
  });
});
