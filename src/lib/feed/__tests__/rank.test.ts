import { describe, expect, it } from "vitest";
import { diversifyCards, rankCards } from "@/lib/feed/rank";
import type { Card, CardType, Severity } from "@/lib/feed/types";

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

function typedCard(type: CardType, id: string, severity: Severity = 60): Card {
  return {
    id,
    type,
    severity,
    headline: id,
    sourceName: "test",
    sourceUrl: "https://example.com",
    timestamp: "2026-04-29T12:00:00Z",
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

describe("diversifyCards", () => {
  it("returns the input unchanged when no run exceeds the cap", () => {
    const input = [
      typedCard("TOOL_ALERT", "t"),
      typedCard("MODEL_MOVER", "m"),
      typedCard("SDK_TREND", "s"),
    ];
    expect(diversifyCards(input).map((c) => c.id)).toEqual(["t", "m", "s"]);
  });

  it("interleaves a long single-type run with the next different type", () => {
    // Real-world shape from 2026-04-29 prod: 1 TOOL_ALERT, 10 MODEL_MOVER,
    // 13 SDK_TREND. Without diversity the feed reads as 10 MODEL_MOVERs
    // before the first SDK_TREND.
    const input: Card[] = [
      typedCard("TOOL_ALERT", "tool", 100),
      ...Array.from({ length: 10 }, (_, i) =>
        typedCard("MODEL_MOVER", `mm${i}`, 80),
      ),
      ...Array.from({ length: 13 }, (_, i) =>
        typedCard("SDK_TREND", `sdk${i}`, 60),
      ),
    ];
    const out = diversifyCards(input, 2);
    // Loss-free.
    expect(out).toHaveLength(input.length);
    expect(new Set(out.map((c) => c.id))).toEqual(
      new Set(input.map((c) => c.id)),
    );
    // The TOOL_ALERT still leads.
    expect(out[0].id).toBe("tool");
    // Whichever type runs out first, the OTHER type is forced to flush
    // at the tail (no alternates left to interleave with). Find that
    // boundary; no 3-in-a-row should appear before it.
    const lastType = out[out.length - 1].type;
    let interleavedZone = out.length;
    for (let i = out.length - 1; i >= 0; i -= 1) {
      if (out[i].type !== lastType) {
        interleavedZone = i + 1;
        break;
      }
    }
    for (let i = 0; i + 2 < interleavedZone; i += 1) {
      const triple = [out[i].type, out[i + 1].type, out[i + 2].type];
      const allSame = triple.every((t) => t === triple[0]);
      expect(allSame).toBe(false);
    }
    // Concrete shape check on the first few positions: tool, MM, MM,
    // SDK, MM, MM, SDK ... — confirms the look-ahead is doing real
    // interleaving rather than just preserving order.
    expect(out.slice(0, 7).map((c) => c.type)).toEqual([
      "TOOL_ALERT",
      "MODEL_MOVER",
      "MODEL_MOVER",
      "SDK_TREND",
      "MODEL_MOVER",
      "MODEL_MOVER",
      "SDK_TREND",
    ]);
  });

  it("flushes the tail when no other type remains", () => {
    const input = [
      typedCard("MODEL_MOVER", "m1"),
      typedCard("MODEL_MOVER", "m2"),
      typedCard("MODEL_MOVER", "m3"),
      typedCard("MODEL_MOVER", "m4"),
    ];
    const out = diversifyCards(input, 2);
    expect(out.map((c) => c.id)).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      typedCard("MODEL_MOVER", "m1"),
      typedCard("MODEL_MOVER", "m2"),
      typedCard("MODEL_MOVER", "m3"),
      typedCard("SDK_TREND", "s1"),
    ];
    const before = [...input];
    diversifyCards(input, 2);
    expect(input).toEqual(before);
  });

  it("handles empty input", () => {
    expect(diversifyCards([])).toEqual([]);
  });

  it("is a no-op when maxConsecutive < 1", () => {
    const input = [
      typedCard("MODEL_MOVER", "m1"),
      typedCard("MODEL_MOVER", "m2"),
    ];
    expect(diversifyCards(input, 0).map((c) => c.id)).toEqual(["m1", "m2"]);
  });
});
