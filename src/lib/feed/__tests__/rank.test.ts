import { describe, expect, it } from "vitest";
import {
  dedupeCardsBySource,
  diversifyCards,
  rankCards,
} from "@/lib/feed/rank";
import type { Card, CardType, Severity } from "@/lib/feed/types";

function card(
  severity: Severity,
  ts: string,
  id = `${severity}-${ts}`,
  sourceUrl = "https://example.com",
): Card {
  return {
    id,
    type: severity === 100 ? "TOOL_ALERT" : "MODEL_MOVER",
    severity,
    headline: `s=${severity} ts=${ts}`,
    sourceName: "test",
    sourceUrl,
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

describe("dedupeCardsBySource", () => {
  it("returns the input unchanged when every card has a unique sourceUrl", () => {
    const a = card(60, "2026-04-29T12:00:00Z", "a", "https://x/1");
    const b = card(40, "2026-04-29T11:00:00Z", "b", "https://x/2");
    const c = card(20, "2026-04-29T10:00:00Z", "c", "https://x/3");
    const out = dedupeCardsBySource([a, b, c]);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("collapses same-sourceUrl cards within the 4h window, keeping the first (highest-ranked)", () => {
    // Caller passes a ranker-sorted list (severity desc, then time desc).
    // Within a 4h window, the earliest entry is the one we keep.
    const high = card(80, "2026-04-29T12:00:00Z", "high", "https://hn/1");
    const low = card(40, "2026-04-29T10:00:00Z", "low", "https://hn/1");
    const out = dedupeCardsBySource([high, low]);
    expect(out.map((x) => x.id)).toEqual(["high"]);
  });

  it("does NOT dedupe when the same sourceUrl appears outside the 4h window", () => {
    const t0 = card(60, "2026-04-29T12:00:00Z", "t0", "https://hn/1");
    const t5h = card(60, "2026-04-29T07:00:00Z", "t5h", "https://hn/1"); // 5h apart
    const out = dedupeCardsBySource([t0, t5h]);
    expect(out.map((x) => x.id)).toEqual(["t0", "t5h"]);
  });

  it("uses a sliding window — a third hit anchored on the second kept survivor extends coverage", () => {
    // Order is severity-desc/time-desc. Three cards on the same URL:
    //   k1 at 12:00 (kept), c2 at 10:00 (within 4h of k1 → drop),
    //   k3 at 07:00 (>4h from k1 BUT <4h from c2's bucket — but we only
    //   anchor on KEPT cards, not dropped ones). k3 is 5h from k1 → kept.
    const k1 = card(60, "2026-04-29T12:00:00Z", "k1", "https://hn/1");
    const c2 = card(60, "2026-04-29T10:00:00Z", "c2", "https://hn/1");
    const k3 = card(60, "2026-04-29T07:00:00Z", "k3", "https://hn/1");
    const out = dedupeCardsBySource([k1, c2, k3]);
    expect(out.map((x) => x.id)).toEqual(["k1", "k3"]);
  });

  it("scopes the window per sourceUrl — different URLs do not interfere", () => {
    const a1 = card(60, "2026-04-29T12:00:00Z", "a1", "https://hn/1");
    const b1 = card(60, "2026-04-29T11:00:00Z", "b1", "https://hn/2");
    const a2 = card(40, "2026-04-29T10:00:00Z", "a2", "https://hn/1"); // dup of a1
    const out = dedupeCardsBySource([a1, b1, a2]);
    expect(out.map((x) => x.id)).toEqual(["a1", "b1"]);
  });

  it("does not mutate the input array", () => {
    const a1 = card(60, "2026-04-29T12:00:00Z", "a1", "https://hn/1");
    const a2 = card(40, "2026-04-29T11:00:00Z", "a2", "https://hn/1");
    const input = [a1, a2];
    const before = [...input];
    dedupeCardsBySource(input);
    expect(input).toEqual(before);
  });

  it("handles empty input", () => {
    expect(dedupeCardsBySource([])).toEqual([]);
  });
});
