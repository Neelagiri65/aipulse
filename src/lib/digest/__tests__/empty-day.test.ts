import { describe, expect, it } from "vitest";
import { detectEmptyDay } from "@/lib/digest/empty-day";
import type { DigestSection } from "@/lib/digest/types";

function sec(
  id: DigestSection["id"],
  mode: DigestSection["mode"],
): DigestSection {
  return {
    id,
    title: id,
    anchorSlug: id,
    mode,
    headline: "test",
    items: [],
    sourceUrls: [],
  };
}

describe("detectEmptyDay", () => {
  it("returns true when every diff-bearing section is quiet and no incidents", () => {
    expect(
      detectEmptyDay({
        sections: [
          sec("tool-health", "quiet"),
          sec("benchmarks", "quiet"),
          sec("sdk-adoption", "quiet"),
          sec("labs", "quiet"),
          sec("hn", "diff"),
        ],
        incidentCount24h: 0,
      }),
    ).toBe(true);
  });

  it("returns false when any incident is present", () => {
    expect(
      detectEmptyDay({
        sections: [
          sec("tool-health", "quiet"),
          sec("benchmarks", "quiet"),
          sec("sdk-adoption", "quiet"),
          sec("labs", "quiet"),
        ],
        incidentCount24h: 1,
      }),
    ).toBe(false);
  });

  it("returns false when any diff-bearing section is in diff mode", () => {
    expect(
      detectEmptyDay({
        sections: [
          sec("tool-health", "quiet"),
          sec("benchmarks", "diff"),
          sec("sdk-adoption", "quiet"),
          sec("labs", "quiet"),
        ],
        incidentCount24h: 0,
      }),
    ).toBe(false);
  });

  it("ignores HN mode entirely", () => {
    expect(
      detectEmptyDay({
        sections: [
          sec("tool-health", "quiet"),
          sec("benchmarks", "quiet"),
          sec("sdk-adoption", "quiet"),
          sec("labs", "quiet"),
          sec("hn", "diff"),
        ],
        incidentCount24h: 0,
      }),
    ).toBe(true);
  });

  it("returns false when there are no diff-bearing sections at all", () => {
    expect(
      detectEmptyDay({
        sections: [sec("hn", "diff")],
        incidentCount24h: 0,
      }),
    ).toBe(false);
  });

  it("treats bootstrap mode as not-quiet", () => {
    expect(
      detectEmptyDay({
        sections: [
          sec("tool-health", "bootstrap"),
          sec("benchmarks", "quiet"),
          sec("sdk-adoption", "quiet"),
          sec("labs", "quiet"),
        ],
        incidentCount24h: 0,
      }),
    ).toBe(false);
  });
});
