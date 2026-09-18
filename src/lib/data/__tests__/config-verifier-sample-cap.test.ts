/**
 * The 500-character sample cap must never split a surrogate pair.
 *
 * The regression, in full: `scoreContent` quoted `text.slice(0, 500)`, which
 * counts UTF-16 code units. `NVIDIA/cuopt`'s AGENTS.md had an emoji straddling
 * index 499, so the stored sample ended in a lone high surrogate.
 * `JSON.stringify` emitted it as `\ud83d` — fine for JS, invalid JSON to a
 * stricter reader — and on 2026-09-18 that one character made `jq` fail on the
 * whole 38MB `/api/v1/sources` response. Three configs, 40MB unreadable.
 */

import { describe, expect, it } from "vitest";

import { scoreContent } from "@/lib/data/config-verifier";

/** Enough config-shaped prose to clear the "too short" floor. */
const PROSE =
  "# CLAUDE.md\n\nThese are the rules for this repository. Follow the build " +
  "discipline, run the tests before committing, and keep the docs honest. ";

describe("scoreContent — the sample cap", () => {
  it("never ends in half an emoji, wherever the pair straddles the cut", () => {
    // Walk the emoji across the boundary: at one of these offsets the pair is
    // split by a 500-code-unit cut. The old `slice` failed here.
    for (let pad = 495; pad <= 503; pad++) {
      const text = PROSE + "x".repeat(Math.max(0, pad - PROSE.length)) + "🚀 go";
      const { sample } = scoreContent(text, "claude-md");
      expect(
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
          sample,
        ),
        `lone surrogate survived at pad=${pad}`,
      ).toBe(false);
      // And the sample must still round-trip through a strict parser.
      expect(() => JSON.parse(JSON.stringify({ sample }))).not.toThrow();
    }
  });

  it("still caps at 500 characters", () => {
    const { sample } = scoreContent(PROSE + "y".repeat(2000), "claude-md");
    expect(sample.length).toBeLessThanOrEqual(500);
    expect(sample.length).toBeGreaterThan(400);
  });

  it("keeps a whole emoji that fits inside the cap", () => {
    const { sample } = scoreContent(`${PROSE}ship it 🚀`, "claude-md");
    expect(sample).toContain("🚀");
  });

  it("leaves ordinary content byte-for-byte alone", () => {
    const { sample } = scoreContent(PROSE, "claude-md");
    expect(sample).toBe(PROSE);
  });
});
