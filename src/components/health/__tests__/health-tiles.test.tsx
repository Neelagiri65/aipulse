import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HealthTiles } from "@/components/health/HealthTiles";
import type { LabsPayload } from "@/lib/data/fetch-labs";

describe("HealthTiles", () => {
  it("renders four tiles; pending ones say so with their source and no time", () => {
    const html = renderToStaticMarkup(<HealthTiles />);
    expect((html.match(/class="ap-tile ap-htile"/g) ?? []).length).toBe(4);
    expect((html.match(/data-pending="1"/g) ?? []).length).toBe(4);
    expect(html).toContain("waiting for the first read");
    expect(html).not.toMatch(/ap-htile__num[^>]*>0</);
  });

  it("a live tile shows the number, the label, the source link and the UTC stamp", () => {
    const labs = { labs: Array.from({ length: 52 }, (_, i) => ({ id: String(i) })), generatedAt: "2026-09-07T18:04:20Z", failures: [] } as unknown as LabsPayload;
    const html = renderToStaticMarkup(<HealthTiles labs={labs} />);
    expect(html).toMatch(/data-tile="labs"(?!.*data-pending="1")/);
    expect(html).toContain(">52<");
    expect(html).toContain("HQs on the registry");
    expect(html).toContain('href="https://github.com/Neelagiri65/aipulse/blob/main/data/ai-labs.json"');
    expect(html).toContain("07/09/2026 18:04 UTC");
  });
});
