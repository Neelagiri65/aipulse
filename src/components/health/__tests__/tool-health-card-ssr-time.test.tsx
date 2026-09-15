/**
 * Server HTML of the health card must never carry a client-only relative time.
 * It rendered "checked 0s ago" (Date.now() at the server's instant); the client
 * then rendered the real elapsed time — a hydration text mismatch (React #418)
 * on every homepage load, which threw the whole card tree away and re-rendered
 * it client-side. The server snapshot of the shared clock is 0, and at 0 every
 * time renders as an absolute UTC clock time.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ToolHealthCard } from "@/components/health/ToolHealthCard";
import { TOOLS, type ToolHealthData } from "@/components/health/tools";

const config = TOOLS.find((t) => t.id === "codex")!;
const data: ToolHealthData = {
  status: "operational",
  statusSourceId: "openai-status",
  lastCheckedAt: "2026-07-05T12:34:56Z",
  activeIncidents: [
    { id: "inc-1", name: "Codex slow in FedRAMP", status: "investigating", createdAt: "2026-07-05T09:10:00Z" },
  ],
};

describe("ToolHealthCard — server HTML carries absolute times, never '…s ago'", () => {
  it("source footer says 'checked HH:MM UTC' on the server", () => {
    const html = renderToStaticMarkup(<ToolHealthCard config={config} data={data} defaultOpen />);
    expect(html).toContain("checked 12:34 UTC");
    expect(html).not.toMatch(/\d+[smhd] ago/);
  });

  it("incident timestamps follow the same rule", () => {
    const html = renderToStaticMarkup(<ToolHealthCard config={config} data={data} defaultOpen />);
    expect(html).toContain("09:10 UTC");
  });

  it("two server renders seconds apart are byte-identical (no clock in the markup)", async () => {
    const a = renderToStaticMarkup(<ToolHealthCard config={config} data={data} defaultOpen />);
    await new Promise((r) => setTimeout(r, 1100));
    const b = renderToStaticMarkup(<ToolHealthCard config={config} data={data} defaultOpen />);
    expect(b).toBe(a);
  });
});
