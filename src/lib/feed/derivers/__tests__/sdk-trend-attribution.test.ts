/**
 * A package trend names a tool only when the package IS the tool
 * (src/lib/feed/attribution.ts). Pinned end to end: the deriver sets
 * meta.toolId for a mapped package, omits it for an unmapped one, and the
 * feed's cardToolId() reads it back.
 */
import { describe, expect, it } from "vitest";
import { deriveSdkTrendCards } from "@/lib/feed/derivers/sdk-trend";
import { cardToolId } from "@/lib/feed/stack";
import type { SdkAdoptionDto, SdkAdoptionPackage } from "@/lib/data/sdk-adoption";

function pkg(id: string, registry: SdkAdoptionPackage["registry"]): SdkAdoptionPackage {
  const label = id.slice(id.indexOf(":") + 1);
  return {
    id,
    label,
    registry,
    latest: { count: 1_000_000, fetchedAt: "2026-09-15T06:00:00.000Z" },
    days: [{ date: "2026-09-15", count: 1_250_000, delta: 0.25 }],
    firstParty: true,
    caveat: null,
    counterName: "lastDay",
    counterUnits: "downloads/day",
  };
}

const dto: SdkAdoptionDto = {
  generatedAt: "2026-09-15T06:00:00.000Z",
  packages: [
    pkg("vscode:GitHub.copilot", "vscode"),
    pkg("npm:openai", "npm"),
    pkg("npm:@anthropic-ai/sdk", "npm"),
    pkg("vscode:saoudrizwan.claude-dev", "vscode"),
  ],
};

describe("deriveSdkTrendCards × attribution", () => {
  const cards = deriveSdkTrendCards(dto);
  const byLabel = Object.fromEntries(cards.map((c) => [c.meta.packageLabel as string, c]));

  it("fires one card per package in the fixture (the fixture crosses the trigger)", () => {
    expect(cards).toHaveLength(4);
  });

  it("the tool's own package carries its tool id, readable by the feed", () => {
    expect(byLabel["GitHub.copilot"].meta.toolId).toBe("copilot");
    expect(cardToolId(byLabel["GitHub.copilot"])).toBe("copilot");
    expect(byLabel["openai"].meta.toolId).toBe("openai-api");
  });

  it("a vendor-named package that is not the tool carries no tool id at all", () => {
    expect("toolId" in byLabel["@anthropic-ai/sdk"].meta).toBe(false);
    expect("toolId" in byLabel["saoudrizwan.claude-dev"].meta).toBe(false);
    expect(cardToolId(byLabel["@anthropic-ai/sdk"])).toBeNull();
  });

  it("the rest of the meta shape is unchanged", () => {
    expect(byLabel["openai"].meta).toEqual({
      registry: "npm",
      packageLabel: "openai",
      deltaPct: 25,
      latestCount: 1_250_000,
      toolId: "openai-api",
    });
  });
});
