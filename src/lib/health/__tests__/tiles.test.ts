/**
 * The four Health tiles: each is a number the dashboard already shows, with source + time; pending
 * is "—" with no time, never 0; the mover tile names the same card as the highlights strip.
 */
import { describe, expect, it } from "vitest";
import { deriveHealthTiles } from "@/lib/health/tiles";
import { pickTopHighlights } from "@/lib/feed/highlights";
import type { Card, FeedResponse } from "@/lib/feed/types";
import type { StatusResult } from "@/lib/data/fetch-status";
import type { GlobeEventsResult } from "@/lib/data/fetch-events";
import type { LabsPayload } from "@/lib/data/fetch-labs";

const mover = (over: Partial<Card> & { meta?: Card["meta"] }): Card => ({
  id: "m1",
  type: "MODEL_MOVER",
  severity: 80,
  headline: "MiniMax: MiniMax M3 down 11 ranks on OpenRouter weekly",
  detail: "Now #16, was #5.",
  sourceName: "OpenRouter",
  sourceUrl: "https://openrouter.ai/minimax/minimax-m3",
  timestamp: "2026-09-07T13:00:04.412Z",
  meta: { slug: "minimax/minimax-m3", name: "MiniMax: MiniMax M3", currentRank: 16, previousRank: 5, delta: 11 },
  ...over,
});
const feedWith = (cards: Card[], over: Partial<FeedResponse> = {}): FeedResponse => ({
  cards,
  quietDay: false,
  currentState: { topModel: { name: "x", sourceUrl: "u" }, toolHealth: { operational: 6, degraded: 0, total: 6 }, latestPaper: { title: "t", sourceUrl: "u" } },
  lastComputed: "2026-09-07T18:00:00Z",
  ...over,
});

describe("deriveHealthTiles", () => {
  it("everything pending: four tiles, each '—' with a source and no time, never 0", () => {
    const tiles = deriveHealthTiles({});
    expect(tiles.map((t) => t.id)).toEqual(["mover", "tools", "aicfg", "labs"]);
    for (const t of tiles) {
      expect(t.value).toBe("—");
      expect(t.pending).toBe(true);
      expect(t.at).toBeNull();
      expect(t.source.length).toBeGreaterThan(0);
      expect(t.sourceUrl.length).toBeGreaterThan(0);
    }
  });

  it("mover: names the card the highlights strip shows first, rank + move + the snapshot semantics", () => {
    const older = mover({ id: "m0", headline: "Foo up 4 ranks on OpenRouter weekly", timestamp: "2026-09-06T13:00:00Z", meta: { slug: "a/foo", name: "Foo", currentRank: 3, previousRank: 7, delta: -4 } });
    const alert: Card = { ...mover({}), id: "t1", type: "TOOL_ALERT", severity: 100, headline: "Cursor outage" };
    const feed = feedWith([older, alert, mover({})]);
    const [tile] = deriveHealthTiles({ feed });
    const stripMover = pickTopHighlights(feed, 3).find((h) => h.card.type === "MODEL_MOVER")?.card;
    expect(stripMover?.id).toBe("m1");
    expect(tile.value).toBe("#16");
    expect(tile.label).toBe("MiniMax: MiniMax M3 · down 11 since yesterday 00:00 UTC · weekly ranking");
    expect(tile.sourceUrl).toBe("https://openrouter.ai/minimax/minimax-m3");
    expect(tile.at).toBe("2026-09-07T13:00:04.412Z");
    expect(tile.pending).toBe(false);
  });

  it("mover: falls back to the headline when meta has no name, and 'up' for a negative delta", () => {
    const [tile] = deriveHealthTiles({ feed: feedWith([mover({ headline: "Qwen: Qwen3 up 6 ranks on OpenRouter weekly", meta: { slug: "q/q", currentRank: 2, previousRank: 8, delta: -6 } })]) });
    expect(tile.value).toBe("#2");
    expect(tile.label).toContain("Qwen: Qwen3 · up 6 since yesterday");
  });

  it("mover: no card above the threshold → '—' with the threshold stated and the feed's time", () => {
    const [tile] = deriveHealthTiles({ feed: feedWith([]) });
    expect(tile.value).toBe("—");
    expect(tile.label).toBe("no model moved more than 3 ranks on OpenRouter weekly");
    expect(tile.at).toBe("2026-09-07T18:00:00Z");
    expect(tile.pending).toBe(false);
  });

  it("mover: quiet day and OpenRouter degraded are both honest, never a stale mover", () => {
    const quiet = deriveHealthTiles({ feed: feedWith([mover({})], { quietDay: true }) })[0];
    expect(quiet.value).toBe("—");
    const degraded = deriveHealthTiles({ feed: feedWith([mover({})], { degradedSources: [{ source: "OpenRouter", reason: "r" }] }) })[0];
    expect(degraded.value).toBe("—");
    expect(degraded.label).toContain("OpenRouter ranking degraded");
  });

  it("tools: operational / total from the same derivation as the answer pill, at the poll time", () => {
    const status = {
      data: { claude: { activeIncidents: [], status: "operational" }, cursor: { activeIncidents: [{ id: "i" }], status: "degraded" } },
      polledAt: "2026-09-07T18:05:00Z",
      failures: [],
    } as unknown as StatusResult;
    const tile = deriveHealthTiles({ status })[1];
    expect(tile.value).toBe("1/2");
    expect(tile.at).toBe("2026-09-07T18:05:00Z");
    expect(tile.label).toBe("tools operational at the last check");
  });

  it("ai-cfg: the coverage block's own numbers and window; a real 0 is shown as 0 once polled", () => {
    const events = { points: [], polledAt: "2026-09-07T18:07:11Z", coverage: { eventsReceived: 1302, eventsWithLocation: 900, locationCoveragePct: 69, windowSize: 1302, windowAiConfig: 0, windowMinutes: 240 } } as unknown as GlobeEventsResult;
    const tile = deriveHealthTiles({ events })[2];
    expect(tile.value).toBe("0");
    expect(tile.label).toBe("AI-cfg events · 240 min · of 1,302 received");
    expect(tile.pending).toBe(false);
  });

  it("labs: the registry count from the labs payload, at its generatedAt", () => {
    const labs = { labs: Array.from({ length: 52 }, (_, i) => ({ id: String(i) })), generatedAt: "2026-09-07T18:04:20Z", failures: [] } as unknown as LabsPayload;
    const tile = deriveHealthTiles({ labs })[3];
    expect(tile.value).toBe("52");
    expect(tile.at).toBe("2026-09-07T18:04:20Z");
  });
});
