import { describe, expect, it } from "vitest";
import { rankCards } from "@/lib/feed/rank";
import type { Card, Severity } from "@/lib/feed/types";

function card(severity: Severity, ts: string, id = `${severity}-${ts}`): Card {
  return {
    id,
    type: severity === 100 ? "TOOL_ALERT" : "MODEL_MOVER",
    severity,
    headline: `s=${severity} ts=${ts}`,
    sourceName: "test",
    sourceUrl: "https://example.com",
    timestamp: ts,
    meta: {},
  };
}

describe("rankCards", () => {
  it("sorts strictly by severity descending", () => {
    const a = card(20, "2026-04-27T12:00:00Z", "a");
    const b = card(100, "2026-04-27T11:00:00Z", "b");
    const c = card(60, "2026-04-27T10:00:00Z", "c");
    expect(rankCards([a, b, c]).map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks ties on timestamp descending within the same tier", () => {
    const a = card(60, "2026-04-27T10:00:00Z", "a");
    const b = card(60, "2026-04-27T12:00:00Z", "b");
    const c = card(60, "2026-04-27T11:00:00Z", "c");
    expect(rankCards([a, b, c]).map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input array", () => {
    const input = [card(20, "x"), card(100, "y")];
    const before = [...input];
    rankCards(input);
    expect(input).toEqual(before);
  });

  it("handles empty input", () => {
    expect(rankCards([])).toEqual([]);
  });

  it("is stable for identical severity + timestamp", () => {
    const a = card(40, "2026-04-27T12:00:00Z", "a");
    const b = card(40, "2026-04-27T12:00:00Z", "b");
    const c = card(40, "2026-04-27T12:00:00Z", "c");
    const out = rankCards([a, b, c]);
    expect(out).toHaveLength(3);
    expect(new Set(out.map((x) => x.id))).toEqual(new Set(["a", "b", "c"]));
  });
});
