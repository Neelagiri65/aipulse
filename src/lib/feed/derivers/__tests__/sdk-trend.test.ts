import { describe, expect, it } from "vitest";
import { deriveSdkTrendCards } from "@/lib/feed/derivers/sdk-trend";
import type {
  SdkAdoptionDto,
  SdkAdoptionPackage,
} from "@/lib/data/sdk-adoption";

function pkg(
  partial: Partial<SdkAdoptionPackage> &
    Pick<SdkAdoptionPackage, "id" | "label" | "registry">,
): SdkAdoptionPackage {
  return {
    id: partial.id,
    label: partial.label,
    registry: partial.registry,
    latest: partial.latest ?? {
      count: 1_000_000,
      fetchedAt: "2026-04-27T06:00:00.000Z",
    },
    days: partial.days ?? [],
    firstParty: partial.firstParty ?? true,
    caveat: partial.caveat ?? null,
    counterName: partial.counterName ?? "lastDay",
    counterUnits: partial.counterUnits ?? "downloads/day",
  };
}

const baseDto: SdkAdoptionDto = {
  packages: [],
  generatedAt: "2026-04-27T06:00:00.000Z",
};

describe("deriveSdkTrendCards", () => {
  it("returns no cards when the latest day's delta is null (no baseline yet)", () => {
    const dto: SdkAdoptionDto = {
      ...baseDto,
      packages: [
        pkg({
          id: "pypi:anthropic",
          label: "anthropic",
          registry: "pypi",
          days: [{ date: "2026-04-27", count: 100, delta: null }],
        }),
      ],
    };
    expect(deriveSdkTrendCards(dto)).toEqual([]);
  });

  it("does NOT fire when |delta| === 0.10 (boundary, threshold is strictly greater)", () => {
    const dto: SdkAdoptionDto = {
      ...baseDto,
      packages: [
        pkg({
          id: "pypi:anthropic",
          label: "anthropic",
          registry: "pypi",
          days: [{ date: "2026-04-27", count: 110, delta: 0.1 }],
        }),
      ],
    };
    expect(deriveSdkTrendCards(dto)).toEqual([]);
  });

  it("fires when |delta| > 0.10", () => {
    const dto: SdkAdoptionDto = {
      ...baseDto,
      packages: [
        pkg({
          id: "pypi:anthropic",
          label: "anthropic",
          registry: "pypi",
          days: [
            { date: "2026-04-25", count: 90, delta: 0.0 },
            { date: "2026-04-26", count: 95, delta: 0.05 },
            { date: "2026-04-27", count: 130, delta: 0.15 },
          ],
        }),
      ],
    };
    const cards = deriveSdkTrendCards(dto);
    expect(cards).toHaveLength(1);
    expect(cards[0].severity).toBe(60);
    expect(cards[0].type).toBe("SDK_TREND");
    expect(cards[0].sourceName).toContain("PyPI");
  });

  it("fires on negative deltas too (downward trend)", () => {
    const dto: SdkAdoptionDto = {
      ...baseDto,
      packages: [
        pkg({
          id: "npm:openai",
          label: "openai",
          registry: "npm",
          days: [{ date: "2026-04-27", count: 50, delta: -0.25 }],
        }),
      ],
    };
    const cards = deriveSdkTrendCards(dto);
    expect(cards).toHaveLength(1);
    expect(cards[0].sourceName).toContain("npm");
  });

  it("uses latest.fetchedAt as the card timestamp", () => {
    const dto: SdkAdoptionDto = {
      ...baseDto,
      packages: [
        pkg({
          id: "pypi:anthropic",
          label: "anthropic",
          registry: "pypi",
          latest: { count: 130, fetchedAt: "2026-04-27T06:00:00.000Z" },
          days: [{ date: "2026-04-27", count: 130, delta: 0.15 }],
        }),
      ],
    };
    const cards = deriveSdkTrendCards(dto);
    expect(cards[0].timestamp).toBe("2026-04-27T06:00:00.000Z");
  });

  it("returns [] on empty packages", () => {
    expect(deriveSdkTrendCards(baseDto)).toEqual([]);
  });
});
