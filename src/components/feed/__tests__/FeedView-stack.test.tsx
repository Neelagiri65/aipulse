/**
 * The Feed with and without a stack. Mirrors health-card-grid-stack.test.tsx:
 * useStack() is mocked so the view can be rendered with a chosen value.
 * Constraint 3 (nothing hidden) and constraint 5 (server HTML identical
 * whatever is stored) are the assertions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Card, FeedResponse } from "@/lib/feed/types";

let stack: string[] | null = null;
vi.mock("@/lib/hooks/use-stack", () => ({
  useStack: () => ({ stack, setStack: vi.fn() }),
}));

import { FeedView } from "@/components/feed/FeedView";

const card = (id: string, type: Card["type"], meta: Card["meta"] = {}): Card => ({
  id,
  type,
  severity: type === "TOOL_ALERT" ? 100 : 50,
  headline: `headline ${id}`,
  sourceName: "src",
  sourceUrl: "https://example.test",
  timestamp: "2026-09-15T08:00:00.000Z",
  meta,
});

const response: FeedResponse = {
  cards: [
    card("alert-cursor", "TOOL_ALERT", { toolId: "cursor" }),
    card("news-1", "NEWS"),
    card("alert-copilot", "TOOL_ALERT", { toolId: "copilot" }),
    card("release-1", "NEW_RELEASE"),
  ],
  quietDay: false,
  currentState: {
    topModel: { name: "Claude", sourceUrl: "https://openrouter.ai" },
    toolHealth: { operational: 4, degraded: 2, total: 6 },
    latestPaper: { title: "Latest", sourceUrl: "https://arxiv.org/abs/2604.0" },
  },
  lastComputed: "2026-09-15T09:00:00.000Z",
};

const rowOrder = (html: string) => [...html.matchAll(/ap-trow__title">headline ([a-z0-9-]+)</g)].map((m) => m[1]);
const render = () => renderToStaticMarkup(<FeedView initialResponse={response} disablePolling />);

describe("FeedView × stack", () => {
  beforeEach(() => {
    stack = null;
  });

  it("no stack (server snapshot): today's heading, every card in rank order, no divider", () => {
    const html = render();
    expect(html).toContain("Feed · since the last quiet hour");
    expect(rowOrder(html)).toEqual(["alert-cursor", "news-1", "alert-copilot", "release-1"]);
    expect(html).not.toContain("feed-stack-divider");
    expect(html).toContain('data-stack="0"');
  });

  it("with a stack: stack cards first, one divider, everything else after in rank order, nothing hidden", () => {
    stack = ["copilot"];
    const html = render();
    expect(html).toContain("Your stack · 1 of 4");
    expect(rowOrder(html)).toEqual(["alert-copilot", "alert-cursor", "news-1", "release-1"]);
    expect(html.match(/feed-stack-divider/g)).toHaveLength(1);
    expect(html).toContain("Everything else · 3 · still ranked, nothing hidden");
    expect(html).toContain('data-stack="1"');
    expect(html).toContain('data-stack-mine="1"');
    expect(html).toContain('data-stack-rest="3"');
    // The divider is a label, not a row: never an ap-trow, never a card type.
    expect(html).toMatch(/<li class="ap-feed-list-divider" data-testid="feed-stack-divider">/);
  });

  it("a stack no card names: honest empty state above every card, nothing hidden", () => {
    stack = ["windsurf"];
    const html = render();
    expect(html).toContain("Your stack · 0 of 4");
    expect(html).toContain("Nothing among these 4 cards names a tool in your stack · today only incident cards carry a tool · all 4 below");
    expect(rowOrder(html)).toEqual(["alert-cursor", "news-1", "alert-copilot", "release-1"]);
  });

  it("the kind chip filter and the stack compose: partition applies to the filtered set", () => {
    stack = ["cursor", "copilot"];
    // Only TOOL_ALERT cards exist in a TOOL_ALERT view; both are in the stack → no divider.
    const html = renderToStaticMarkup(
      <FeedView initialResponse={{ ...response, cards: response.cards.filter((c) => c.type === "TOOL_ALERT") }} disablePolling />,
    );
    expect(html).toContain("Your stack · 2 of 2");
    expect(html).not.toContain("feed-stack-divider");
  });

  it("the first visible row is the first stack card, so the reading surface answers for the stack", () => {
    stack = ["copilot"];
    const html = render();
    expect(html.indexOf('aria-current="true"')).toBeGreaterThan(-1);
    const selectedIdx = html.indexOf('aria-current="true"');
    expect(html.slice(selectedIdx, selectedIdx + 400)).toContain("headline alert-copilot");
  });
});

describe("server HTML does not depend on storage (constraint 5)", () => {
  it("useStack's server snapshot is null: two renders with different localStorage are byte-identical", async () => {
    vi.doUnmock("@/lib/hooks/use-stack");
    vi.resetModules();
    const { FeedView: Real } = await import("@/components/feed/FeedView");
    const g = globalThis as { localStorage?: unknown };
    const a = renderToStaticMarkup(<Real initialResponse={response} disablePolling />);
    g.localStorage = { getItem: () => JSON.stringify(["copilot"]) };
    const b = renderToStaticMarkup(<Real initialResponse={response} disablePolling />);
    delete g.localStorage;
    expect(b).toBe(a);
    expect(a).not.toContain("feed-stack-divider");
    expect(a).not.toContain("Your stack ·");
  });
});
