import { describe, expect, it } from "vitest";
import { composeToolHealthSection } from "@/lib/digest/sections/tool-health";
import type { SnapshotTool } from "@/lib/data/snapshot";
import type { HistoricalIncident } from "@/lib/data/status-history";

function tool(id: string, status: string, active = 0): SnapshotTool {
  return { id, status, activeIncidents: active };
}

function inc(overrides: Partial<HistoricalIncident>): HistoricalIncident {
  return {
    id: "i1",
    name: "Elevated errors",
    status: "resolved",
    impact: "minor",
    createdAt: "2026-04-22T00:00:00Z",
    resolvedAt: "2026-04-22T01:00:00Z",
    ...overrides,
  };
}

describe("composeToolHealthSection — bootstrap", () => {
  it("emits bootstrap mode when yesterdayTools is null", () => {
    const sec = composeToolHealthSection({
      todayTools: [tool("openai", "operational"), tool("anthropic", "operational")],
      yesterdayTools: null,
      incidents24h: [],
    });
    expect(sec.mode).toBe("bootstrap");
    expect(sec.items).toHaveLength(2);
    expect(sec.headline).toContain("2 tracked tools");
  });
});

describe("composeToolHealthSection — diff", () => {
  it("surfaces status transitions as diff-mode items", () => {
    const sec = composeToolHealthSection({
      todayTools: [tool("openai", "degraded"), tool("anthropic", "operational")],
      yesterdayTools: [tool("openai", "operational"), tool("anthropic", "operational")],
      incidents24h: [],
    });
    expect(sec.mode).toBe("diff");
    expect(sec.items[0].headline).toContain("Operational");
    expect(sec.items[0].headline).toContain("Degraded");
  });

  it("surfaces incidents even when no status transition fires", () => {
    const sec = composeToolHealthSection({
      todayTools: [tool("openai", "operational")],
      yesterdayTools: [tool("openai", "operational")],
      incidents24h: [inc({ name: "OpenAI elevated latency" })],
    });
    expect(sec.mode).toBe("diff");
    expect(sec.items.some((i) => i.headline === "OpenAI elevated latency")).toBe(true);
  });
});

describe("composeToolHealthSection — quiet", () => {
  it("emits quiet mode with a current-state tile list when nothing moved", () => {
    const sec = composeToolHealthSection({
      todayTools: [tool("openai", "operational"), tool("anthropic", "operational")],
      yesterdayTools: [tool("openai", "operational"), tool("anthropic", "operational")],
      incidents24h: [],
    });
    expect(sec.mode).toBe("quiet");
    expect(sec.items).toHaveLength(2);
    expect(sec.headline).toContain("All tools operational");
  });
});

describe("composeToolHealthSection — source citations", () => {
  it("emits a per-tool Statuspage URL when the tool is known", () => {
    const sec = composeToolHealthSection({
      todayTools: [tool("openai", "operational")],
      yesterdayTools: null,
      incidents24h: [],
    });
    const item = sec.items.find((i) => i.headline === "OpenAI")!;
    expect(item.sourceUrl).toBe("https://status.openai.com/");
  });
});

describe("composeToolHealthSection — incident detail", () => {
  it("renders started/resolved UTC timestamps so the reader can verify the window", () => {
    const sec = composeToolHealthSection({
      todayTools: [tool("openai", "operational")],
      yesterdayTools: [tool("openai", "operational")],
      incidents24h: [
        inc({
          name: "Elevated errors on /v1/chat",
          createdAt: "2026-05-01T08:23:00Z",
          resolvedAt: "2026-05-01T09:15:00Z",
          impact: "minor",
          toolId: "openai",
        }),
      ],
    });
    const incidentItem = sec.items.find((i) =>
      i.headline.includes("Elevated errors"),
    )!;
    expect(incidentItem.detail).toContain("started 08:23 UTC");
    expect(incidentItem.detail).toContain("resolved 09:15 UTC");
    expect(incidentItem.detail).toContain("minor impact");
  });

  it('marks ongoing incidents as "ongoing" instead of a resolved time', () => {
    const sec = composeToolHealthSection({
      todayTools: [tool("openai", "operational")],
      yesterdayTools: [tool("openai", "operational")],
      incidents24h: [
        inc({
          name: "API errors",
          createdAt: "2026-05-01T08:23:00Z",
          resolvedAt: undefined,
          toolId: "openai",
        }),
      ],
    });
    const incidentItem = sec.items.find((i) => i.headline === "API errors")!;
    expect(incidentItem.detail).toContain("started 08:23 UTC");
    expect(incidentItem.detail).toContain("ongoing");
    expect(incidentItem.detail).not.toContain("resolved");
  });

  it("links each incident to the source tool's status page when toolId is set", () => {
    const sec = composeToolHealthSection({
      todayTools: [tool("openai", "operational")],
      yesterdayTools: [tool("openai", "operational")],
      incidents24h: [
        inc({
          id: "x",
          name: "OpenAI elevated latency",
          toolId: "openai",
        }),
      ],
    });
    const incidentItem = sec.items.find(
      (i) => i.headline === "OpenAI elevated latency",
    )!;
    expect(incidentItem.sourceUrl).toBe("https://status.openai.com/");
    expect(incidentItem.sourceLabel).toBe("OpenAI status page");
  });
});
