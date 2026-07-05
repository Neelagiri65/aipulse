/**
 * Vendor self-disagreement disclosure on the tool health card (#63
 * posture: surface disagreements, don't resolve them by fiat).
 *
 * Reconstructed live state (2026-07-05): OpenAI declared the Codex
 * components operational while running a page-level incident naming
 * Codex — the card showed OPERATIONAL two rows above ONGOING·DEGRADED
 * with nothing connecting them. The disclosure line renders exactly
 * when the declared badge is operational AND active incidents exist.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ToolHealthCard } from "@/components/health/ToolHealthCard";
import { TOOLS, type ToolHealthData } from "@/components/health/tools";

const codexConfig = TOOLS.find((t) => t.id === "codex")!;

function dataWith(overrides: Partial<ToolHealthData>): ToolHealthData {
  return {
    status: "operational",
    statusSourceId: "openai-status",
    lastCheckedAt: "2026-07-05T12:00:00Z",
    ...overrides,
  };
}

const fedRampIncident = {
  id: "inc-1",
  name: "Codex … not working in FedRAMP workspaces",
  status: "investigating",
  createdAt: "2026-07-01T03:38:18Z",
};

describe("ToolHealthCard — declared-vs-incident disagreement disclosure", () => {
  it("operational badge + active incident → disclosure line renders", () => {
    const html = renderToStaticMarkup(
      <ToolHealthCard
        config={codexConfig}
        data={dataWith({ activeIncidents: [fedRampIncident] })}
      />,
    );
    expect(html).toContain("incident-status-disagreement");
    expect(html).toContain("both shown as the");
  });

  it("degraded badge + active incident → no disclosure (signals agree)", () => {
    const html = renderToStaticMarkup(
      <ToolHealthCard
        config={codexConfig}
        data={dataWith({
          status: "degraded",
          activeIncidents: [fedRampIncident],
        })}
      />,
    );
    expect(html).not.toContain("incident-status-disagreement");
  });

  it("operational badge + no incidents → no incident block at all", () => {
    const html = renderToStaticMarkup(
      <ToolHealthCard config={codexConfig} data={dataWith({})} />,
    );
    expect(html).not.toContain("incident-status-disagreement");
    expect(html).not.toContain("active incident");
  });
});
