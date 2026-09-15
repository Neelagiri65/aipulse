/**
 * The Health panel with and without a stack. The stack comes from
 * useStack(); mocked here so the grid can be rendered with a chosen value.
 * Constraint 3 (nothing hidden) and constraint 5 (server HTML identical
 * whatever is stored) are the assertions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TOOLS, type ToolHealthData } from "@/components/health/tools";

let stack: string[] | null = null;
vi.mock("@/lib/hooks/use-stack", () => ({
  useStack: () => ({ stack, setStack: vi.fn() }),
}));

import { HealthCardGrid } from "@/components/health/HealthCardGrid";

const data = Object.fromEntries(
  TOOLS.map((t) => [t.id, { status: t.id === "cursor" ? "degraded" : "operational", statusSourceId: t.sourceIds[0], lastCheckedAt: "2026-09-12T08:00:00Z" } satisfies ToolHealthData]),
);
const rowOrder = (html: string) => [...html.matchAll(/data-testid="tool-row-([a-z-]+)"/g)].map((m) => m[1]);
const render = () => renderToStaticMarkup(<HealthCardGrid data={data} polledAt="2026-09-12T08:00:00Z" />);

describe("HealthCardGrid × stack", () => {
  beforeEach(() => {
    stack = null;
  });

  it("no stack (server snapshot): today's heading, every tool, no divider", () => {
    const html = render();
    expect(html).toContain("Tool health · incidents first");
    expect(rowOrder(html)).toHaveLength(TOOLS.length);
    expect(html).not.toContain('data-testid="stack-others"');
    expect(html).toContain("pick the tools you use");
  });

  it("with a stack: personal heading from the same severity derivation, stack first, others after a divider, nothing hidden", () => {
    stack = ["cursor", "claude-code"];
    const html = render();
    expect(html).toContain("Your stack · 1/2 operational · degraded");
    const order = rowOrder(html);
    expect(order.slice(0, 2)).toEqual(["cursor", "claude-code"]); // cursor first: incidents first inside the stack
    expect(order).toHaveLength(TOOLS.length);
    expect(html).toContain(`Not in your stack · ${TOOLS.length - 2}`);
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*data-testid="stack-chip-cursor"|<button[^>]*data-testid="stack-chip-cursor"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*data-testid="stack-chip-copilot"/);
    expect(html).toContain('data-testid="stack-clear"');
  });

  it("all operational stack reads without a state word", () => {
    stack = ["claude-code", "copilot"];
    expect(render()).toContain("Your stack · 2/2 operational<");
  });

  it("a stack whose tools have no data still renders their cards (no-data state), never throws", () => {
    stack = ["windsurf"];
    const html = renderToStaticMarkup(<HealthCardGrid data={{}} />);
    expect(html).toContain('data-testid="tool-row-windsurf"');
    expect(rowOrder(html)).toHaveLength(TOOLS.length);
  });
});

describe("server HTML does not depend on storage (constraint 5)", () => {
  it("useStack's server snapshot is null: two renders with different localStorage are byte-identical", async () => {
    vi.doUnmock("@/lib/hooks/use-stack");
    vi.resetModules();
    const { HealthCardGrid: Real } = await import("@/components/health/HealthCardGrid");
    const g = globalThis as { localStorage?: unknown; window?: unknown };
    const a = renderToStaticMarkup(<Real data={data} />);
    g.localStorage = { getItem: () => JSON.stringify(["cursor"]) };
    const b = renderToStaticMarkup(<Real data={data} />);
    delete g.localStorage;
    expect(b).toBe(a);
    expect(a).toContain("Tool health · incidents first");
  });
});
