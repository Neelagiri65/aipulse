import { describe, expect, it } from "vitest";
import { cardToolId, partitionCardsByStack } from "@/lib/feed/stack";
import type { Card } from "@/lib/feed/types";

const card = (id: string, meta: Card["meta"] = {}, type: Card["type"] = "NEWS"): Card => ({
  id,
  type,
  severity: 50,
  headline: id,
  sourceName: "src",
  sourceUrl: "https://example.test",
  timestamp: "2026-09-15T08:00:00Z",
  meta,
});

describe("cardToolId — a card names a tool only when its deriver said so", () => {
  it("reads a known tool id from meta.toolId, whatever the card type", () => {
    expect(cardToolId(card("a", { toolId: "copilot" }, "TOOL_ALERT"))).toBe("copilot");
    expect(cardToolId(card("b", { toolId: "cursor" }, "NEW_RELEASE"))).toBe("cursor");
  });
  it("returns null for no meta.toolId, an unknown id, or a non-string", () => {
    expect(cardToolId(card("a"))).toBeNull();
    expect(cardToolId(card("b", { toolId: "nope" }))).toBeNull();
    expect(cardToolId(card("c", { toolId: 7 }))).toBeNull();
    expect(cardToolId(card("d", { toolId: true }))).toBeNull();
  });
});

describe("partitionCardsByStack — nothing hidden, rank order kept in both halves", () => {
  const cards = [
    card("alert-cursor", { toolId: "cursor" }, "TOOL_ALERT"),
    card("news-1"),
    card("alert-copilot", { toolId: "copilot" }, "TOOL_ALERT"),
    card("release-1", { author: "anthropics" }, "NEW_RELEASE"),
    card("alert-claude", { toolId: "claude-code" }, "TOOL_ALERT"),
  ];
  const ids = (xs: Card[]) => xs.map((c) => c.id);

  it("no stack → every card is mine, nothing is rest — the feed reads exactly as today", () => {
    expect(ids(partitionCardsByStack(cards, null).mine)).toEqual(ids(cards));
    expect(partitionCardsByStack(cards, null).rest).toEqual([]);
    expect(partitionCardsByStack(cards, []).rest).toEqual([]);
  });

  it("with a stack: cards naming a stack tool first, everything else (other tools AND unattributed) after, in rank order", () => {
    const { mine, rest } = partitionCardsByStack(cards, ["copilot", "cursor"]);
    expect(ids(mine)).toEqual(["alert-cursor", "alert-copilot"]);
    expect(ids(rest)).toEqual(["news-1", "release-1", "alert-claude"]);
    expect(mine.length + rest.length).toBe(cards.length);
  });

  it("a stack that matches nothing keeps every card in rest, still in rank order", () => {
    const { mine, rest } = partitionCardsByStack(cards, ["windsurf"]);
    expect(mine).toEqual([]);
    expect(ids(rest)).toEqual(ids(cards));
  });

  it("does not mutate the input", () => {
    const before = ids(cards);
    partitionCardsByStack(cards, ["cursor"]);
    expect(ids(cards)).toEqual(before);
  });
});
