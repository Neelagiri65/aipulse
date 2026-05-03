/**
 * Agents digest section composer.
 *
 * Movement-gated: the section returns null on bootstrap (no 7d-old data),
 * null when no framework's |delta| exceeds the threshold, and a populated
 * DigestSection only when there's something worth showing. The threshold
 * lives as a single named constant so retuning after 14 days of observed
 * deltas is a one-line PR (per PRD §10).
 */

import { describe, it, expect } from "vitest";
import {
  composeAgentsSection,
  AGENTS_MOVEMENT_THRESHOLD_PCT,
} from "@/lib/digest/sections/agents";
import type { AgentsViewDto, AgentRowView } from "@/lib/data/agents-view";

const NOW = new Date("2026-05-03T07:00:00Z");

function row(overrides: Partial<AgentRowView>): AgentRowView {
  return {
    id: "fw",
    name: "FW",
    category: "alive",
    languages: ["python"],
    pypiPackage: "fw",
    npmPackage: null,
    githubRepo: "fw/fw",
    weeklyDownloads: 1_000_000,
    weeklyDeltaPct: null,
    deltaState: "bootstrap",
    stars: 10_000,
    openIssues: 100,
    pushedAt: "2026-05-03T00:00:00Z",
    archived: false,
    badge: null,
    caveat: null,
    ...overrides,
  };
}

function dto(...rows: AgentRowView[]): AgentsViewDto {
  return { rows, generatedAt: NOW.toISOString() };
}

describe("composeAgentsSection", () => {
  it("returns null when input is null (data unavailable)", () => {
    expect(composeAgentsSection({ agents: null })).toBeNull();
  });

  it("returns null in bootstrap (no row has a delta yet)", () => {
    const result = composeAgentsSection({
      agents: dto(
        row({ id: "a", weeklyDeltaPct: null, deltaState: "bootstrap" }),
        row({ id: "b", weeklyDeltaPct: null, deltaState: "bootstrap" }),
      ),
    });
    expect(result).toBeNull();
  });

  it("returns null when no row exceeds the threshold", () => {
    const result = composeAgentsSection({
      agents: dto(
        row({
          id: "a",
          weeklyDeltaPct: AGENTS_MOVEMENT_THRESHOLD_PCT - 0.1,
          deltaState: "fresh",
        }),
        row({
          id: "b",
          weeklyDeltaPct: -(AGENTS_MOVEMENT_THRESHOLD_PCT - 0.1),
          deltaState: "fresh",
        }),
      ),
    });
    expect(result).toBeNull();
  });

  it("renders a section listing all rows with |delta| > threshold, sorted by absolute delta desc", () => {
    const result = composeAgentsSection({
      agents: dto(
        row({ id: "a", name: "A", weeklyDeltaPct: 12, deltaState: "fresh" }),
        row({ id: "b", name: "B", weeklyDeltaPct: -25, deltaState: "fresh" }),
        row({ id: "c", name: "C", weeklyDeltaPct: 5, deltaState: "fresh" }),
      ),
    });
    expect(result).not.toBeNull();
    expect(result!.id).toBe("agents");
    expect(result!.mode).toBe("diff");
    const names = result!.items.map((i) => i.headline.split(" ")[0]);
    expect(names).toEqual(["B", "A"]);
  });

  it("includes new-from-zero rows even though their delta is null", () => {
    const result = composeAgentsSection({
      agents: dto(
        row({
          id: "a",
          name: "A",
          weeklyDeltaPct: null,
          deltaState: "new-from-zero",
        }),
      ),
    });
    expect(result).not.toBeNull();
    expect(result!.items[0].headline).toContain("A");
    expect(result!.items[0].headline).toContain("new");
  });

  it("ignores tombstones (legacy + dormant + archived) even if their delta exceeds threshold", () => {
    const result = composeAgentsSection({
      agents: dto(
        row({
          id: "tomb",
          name: "Tomb",
          weeklyDeltaPct: 200,
          deltaState: "fresh",
          badge: "dormant",
        }),
        row({
          id: "archived",
          name: "Arc",
          weeklyDeltaPct: 200,
          deltaState: "fresh",
          badge: "archived",
        }),
        row({
          id: "legacy",
          name: "Leg",
          weeklyDeltaPct: 200,
          deltaState: "fresh",
          badge: "legacy",
        }),
      ),
    });
    expect(result).toBeNull();
  });

  it("attaches sourceUrl pointing at the framework's primary registry page", () => {
    const result = composeAgentsSection({
      agents: dto(
        row({
          id: "crewai",
          name: "CrewAI",
          pypiPackage: "crewai",
          weeklyDeltaPct: 18,
          deltaState: "fresh",
        }),
        row({
          id: "openai-agents",
          name: "OpenAI Agents",
          pypiPackage: "openai-agents",
          npmPackage: "@openai/agents",
          languages: ["python", "javascript"],
          weeklyDeltaPct: 15,
          deltaState: "fresh",
        }),
      ),
    });
    const crew = result!.items.find((i) => i.headline.startsWith("CrewAI"));
    const openai = result!.items.find((i) =>
      i.headline.startsWith("OpenAI Agents"),
    );
    expect(crew?.sourceUrl).toContain("pypistats.org/packages/crewai");
    expect(openai?.sourceUrl).toContain("pypistats.org/packages/openai-agents");
  });

  it("propagates per-row caveat verbatim onto the digest item", () => {
    const result = composeAgentsSection({
      agents: dto(
        row({
          id: "autogen",
          name: "AutoGen",
          weeklyDeltaPct: 22,
          deltaState: "fresh",
          caveat: "Tracks the live `autogen-agentchat` package — verbatim.",
        }),
      ),
    });
    expect(result!.items[0].caveat).toContain("autogen-agentchat");
  });

  it("headline reflects the actual count of movers", () => {
    const result = composeAgentsSection({
      agents: dto(
        row({ id: "a", name: "A", weeklyDeltaPct: 15, deltaState: "fresh" }),
        row({ id: "b", name: "B", weeklyDeltaPct: -22, deltaState: "fresh" }),
      ),
    });
    expect(result!.headline).toMatch(/2 agent frameworks/);
  });

  it("singular grammar when one mover", () => {
    const result = composeAgentsSection({
      agents: dto(
        row({ id: "a", name: "A", weeklyDeltaPct: 15, deltaState: "fresh" }),
      ),
    });
    expect(result!.headline).toMatch(/1 agent framework/);
  });
});
