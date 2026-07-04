import { describe, expect, it } from "vitest";

import { deltaDirection, splitFirstSignedToken } from "@/lib/email/delta";

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

describe("splitFirstSignedToken", () => {
  it("splits a leading-signed figure with direction, keeping copy verbatim", () => {
    const r = splitFirstSignedToken("npm: openai gained +2.3M 24h downloads day-over-day.");
    expect(r).not.toBeNull();
    expect(r!.token).toBe("+2.3M");
    expect(r!.direction).toBe("up");
    expect(r!.before + r!.token + r!.after).toBe(
      "npm: openai gained +2.3M 24h downloads day-over-day.",
    );
  });

  it("handles unicode minus after a colon", () => {
    const r = splitFirstSignedToken(
      "diffusers downloads declined for the 3rd consecutive snapshot: −22.1k day-over-day.",
    );
    expect(r!.token).toBe("−22.1k");
    expect(r!.direction).toBe("down");
  });

  it("NEVER splits hyphenated slugs or words", () => {
    expect(
      splitFirstSignedToken("claude-opus-4-6-thinking holds #1 on LMArena for the 30th consecutive snapshot."),
    ).toBeNull();
    expect(splitFirstSignedToken("day-over-day comparison window")).toBeNull();
  });
});
