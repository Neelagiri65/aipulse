import { describe, expect, it } from "vitest";
import {
  WHY_THIS_MATTERS_SECTION_IDS,
  whyThisMatters,
} from "@/lib/digest/why-this-matters";
import type { DigestSectionId } from "@/lib/digest/types";

const ALL_SECTION_IDS: readonly DigestSectionId[] = [
  "tool-health",
  "hn",
  "benchmarks",
  "sdk-adoption",
  "agents",
  "labs",
  "model-usage",
];

describe("whyThisMatters", () => {
  it("returns a non-empty single sentence for every monitored section", () => {
    for (const id of ALL_SECTION_IDS) {
      const copy = whyThisMatters(id);
      expect(copy.length).toBeGreaterThan(0);
      // One sentence: no double-period (would suggest a run-on).
      const periods = (copy.match(/\./g) ?? []).length;
      expect(periods).toBeGreaterThan(0);
      expect(periods).toBeLessThanOrEqual(2);
      // Length sanity: short enough to read at a glance, long enough to
      // teach. Tuned generously — copy can be edited freely within this band.
      expect(copy.length).toBeGreaterThanOrEqual(40);
      expect(copy.length).toBeLessThanOrEqual(220);
    }
  });

  it("registers copy for every section id surfaced via the constant", () => {
    for (const id of WHY_THIS_MATTERS_SECTION_IDS) {
      expect(typeof whyThisMatters(id)).toBe("string");
    }
    expect([...WHY_THIS_MATTERS_SECTION_IDS].sort()).toEqual(
      [...ALL_SECTION_IDS].sort(),
    );
  });

  it("contains no invented causality language ('because X did Y')", () => {
    // Trust contract: copy is evergreen, not reactive. A section line
    // that asserts a daily cause-and-effect would slide into
    // editorialising. Pin it: we ban a small set of giveaway phrases.
    const banned = [/\bbecause\b/i, /\bproves\b/i, /\bwinning\b/i];
    for (const id of ALL_SECTION_IDS) {
      const copy = whyThisMatters(id);
      for (const re of banned) {
        expect(copy).not.toMatch(re);
      }
    }
  });

  it("pins the tool-health copy verbatim — change here = explicit edit", () => {
    expect(whyThisMatters("tool-health")).toBe(
      "Provider outages and degradations cause retry storms upstream. Tracking the 7-day shape catches flapping providers before they page you.",
    );
  });
});
