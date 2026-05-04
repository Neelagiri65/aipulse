import { describe, expect, it } from "vitest";
import {
  EDITORIAL_PLACEHOLDER,
  isEditorialPlaceholder,
  reportEditorialFilled,
  type GenesisReportConfig,
} from "@/lib/reports/types";

function mkConfig(
  overrides: Partial<GenesisReportConfig> = {},
): GenesisReportConfig {
  return {
    slug: "test-report",
    title: "A Title",
    subtitle: "A Subtitle",
    window: "April 2026",
    publishedAt: "2026-05-04",
    hero: {
      stat: "184% w/w",
      caption: "torch downloads, week 4 of decline",
      sourceUrl: "https://example.com/source",
      sourceLabel: "Example",
    },
    thesis: "A real thesis paragraph that someone wrote.",
    sections: [
      {
        header: "Section A",
        framing: "Section A framing",
        blockId: "sdk-adoption-gainers-30d",
      },
      {
        header: "Section B",
        framing: "Section B framing",
        blockId: "sdk-adoption-losers-30d",
      },
    ],
    ...overrides,
  };
}

describe("EDITORIAL_PLACEHOLDER", () => {
  it("is a stable sentinel string", () => {
    expect(EDITORIAL_PLACEHOLDER).toBe("[EDITORIAL TBD]");
  });
});

describe("isEditorialPlaceholder", () => {
  it("returns true for the verbatim sentinel", () => {
    expect(isEditorialPlaceholder(EDITORIAL_PLACEHOLDER)).toBe(true);
  });

  it("returns true for the sentinel with surrounding whitespace", () => {
    expect(isEditorialPlaceholder(`  ${EDITORIAL_PLACEHOLDER}  `)).toBe(true);
  });

  it("returns false for any operator-written prose", () => {
    expect(isEditorialPlaceholder("Real prose")).toBe(false);
    expect(isEditorialPlaceholder("")).toBe(false);
  });
});

describe("reportEditorialFilled", () => {
  it("returns true when thesis + every section header + every section framing is non-placeholder", () => {
    expect(reportEditorialFilled(mkConfig())).toBe(true);
  });

  it("returns false when thesis is the placeholder", () => {
    expect(
      reportEditorialFilled(mkConfig({ thesis: EDITORIAL_PLACEHOLDER })),
    ).toBe(false);
  });

  it("returns false when ANY section header is the placeholder", () => {
    const config = mkConfig();
    config.sections[1].header = EDITORIAL_PLACEHOLDER;
    expect(reportEditorialFilled(config)).toBe(false);
  });

  it("returns false when ANY section framing is the placeholder", () => {
    const config = mkConfig();
    config.sections[0].framing = EDITORIAL_PLACEHOLDER;
    expect(reportEditorialFilled(config)).toBe(false);
  });

  it("treats all-placeholder configs as not-filled (engineering scaffold default)", () => {
    const config = mkConfig({
      thesis: EDITORIAL_PLACEHOLDER,
      sections: [
        {
          header: EDITORIAL_PLACEHOLDER,
          framing: EDITORIAL_PLACEHOLDER,
          blockId: "sdk-adoption-gainers-30d",
        },
      ],
    });
    expect(reportEditorialFilled(config)).toBe(false);
  });
});
