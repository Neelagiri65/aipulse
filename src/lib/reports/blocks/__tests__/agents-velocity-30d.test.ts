import { describe, expect, it } from "vitest";
import { loadAgentsVelocity30dBlock } from "@/lib/reports/blocks/agents-velocity-30d";
import type { AgentsViewDto, AgentRowView } from "@/lib/data/agents-view";

function row(
  id: string,
  weeklyDeltaPct: number | null,
  overrides: Partial<AgentRowView> = {},
): AgentRowView {
  return {
    id,
    name: id,
    category: "alive",
    languages: ["python"],
    pypiPackage: id,
    npmPackage: null,
    githubRepo: `${id}/${id}`,
    weeklyDownloads: 10_000,
    weeklyDownloadsStaleSince: null,
    weeklyDeltaPct,
    deltaState: "fresh",
    stars: 1000,
    openIssues: 50,
    pushedAt: "2026-04-30T00:00:00Z",
    archived: false,
    githubStaleSince: null,
    badge: null,
    caveat: null,
    ...overrides,
  };
}

function view(...rows: AgentRowView[]): AgentsViewDto {
  return {
    rows,
    generatedAt: "2026-05-04T00:00:00Z",
  };
}

const FIXED_NOW = () => new Date("2026-05-04T00:00:00.000Z");

describe("loadAgentsVelocity30dBlock", () => {
  it("ranks rows by absolute weekly delta (biggest movers, either direction)", () => {
    const result = loadAgentsVelocity30dBlock({
      view: view(
        row("a", 5),
        row("b", -50),
        row("c", 30),
        row("d", -10),
      ),
      now: FIXED_NOW,
    });
    expect(result.rows.map((r) => r.label)).toEqual(["b", "c", "d", "a"]);
  });

  it("formats delta with sign + w/w unit", () => {
    const result = loadAgentsVelocity30dBlock({
      view: view(row("up", 12.345), row("down", -8.9)),
      now: FIXED_NOW,
    });
    const upRow = result.rows.find((r) => r.label === "up")!;
    const downRow = result.rows.find((r) => r.label === "down")!;
    expect(upRow.delta).toBe("+12.3% w/w");
    expect(downRow.delta).toBe("-8.9% w/w");
  });

  it("uses GitHub repo URL as the source link", () => {
    const result = loadAgentsVelocity30dBlock({
      view: view(row("langgraph", 25, { githubRepo: "langchain-ai/langgraph" })),
      now: FIXED_NOW,
    });
    expect(result.rows[0].sourceUrl).toBe(
      "https://github.com/langchain-ai/langgraph",
    );
    expect(result.rows[0].sourceLabel).toBe("github.com");
  });

  it("excludes archived frameworks (no 'velocity' framing for dead repos)", () => {
    const result = loadAgentsVelocity30dBlock({
      view: view(
        row("alive", 10),
        row("dead", 50, { archived: true }),
      ),
      now: FIXED_NOW,
    });
    expect(result.rows.map((r) => r.label)).toEqual(["alive"]);
  });

  it("excludes rows with null weeklyDeltaPct (no signal to rank by)", () => {
    const result = loadAgentsVelocity30dBlock({
      view: view(row("missing", null), row("real", 10)),
      now: FIXED_NOW,
    });
    expect(result.rows.map((r) => r.label)).toEqual(["real"]);
  });

  it("warns per stale row in the top-N (last-known values, not live)", () => {
    const result = loadAgentsVelocity30dBlock({
      view: view(
        row("fresh", 20),
        row("stale", 50, { weeklyDownloadsStaleSince: "2026-05-01T00:00:00Z" }),
      ),
      now: FIXED_NOW,
    });
    expect(result.sanityWarnings.length).toBe(1);
    expect(result.sanityWarnings[0]).toContain("stale");
    expect(result.sanityWarnings[0]).toContain("last-known values");
    // Row INCLUDED with the warning, not auto-suppressed.
    expect(result.rows.map((r) => r.label)).toContain("stale");
  });

  it("renders '—' for value when weeklyDownloads is null but delta is present", () => {
    const result = loadAgentsVelocity30dBlock({
      view: view(row("partial", 15, { weeklyDownloads: null })),
      now: FIXED_NOW,
    });
    expect(result.rows[0].value).toBe("—");
  });

  it("returns rows: [] for empty view", () => {
    const result = loadAgentsVelocity30dBlock({
      view: view(),
      now: FIXED_NOW,
    });
    expect(result.rows).toEqual([]);
  });

  it("respects topN cap", () => {
    const result = loadAgentsVelocity30dBlock({
      view: view(row("a", 10), row("b", 20), row("c", 30), row("d", 40)),
      topN: 2,
      now: FIXED_NOW,
    });
    expect(result.rows.map((r) => r.label)).toEqual(["d", "c"]);
  });
});
