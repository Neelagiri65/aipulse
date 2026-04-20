import { describe, expect, it } from "vitest";
import {
  assembleRssWire,
  RSS_RECENT_ITEMS_PER_SOURCE,
  RSS_STALE_HOURS_THRESHOLD,
  type RssItem,
  type RssSourceStatus,
  type RssIngestMeta,
} from "@/lib/data/wire-rss";
import type { RssSource } from "@/lib/data/rss-sources";

/**
 * Tests for the pure panel-shape assembler. Proves the 4-input-produces-
 * deterministic-output contract that /api/rss depends on. No Redis, no
 * network — this layer is tested in isolation so a schema regression
 * shows up here, not in a prod smoke.
 */

const NOW_ISO = "2026-04-20T12:00:00.000Z";
const NOW_MS = Date.parse(NOW_ISO);

function mkSource(partial: Partial<RssSource> & { id: string }): RssSource {
  return {
    displayName: `${partial.id} publisher`,
    city: "Nowhere",
    country: "XX",
    lat: 0,
    lng: 0,
    lang: "en",
    rssUrl: "https://example.com/feed",
    hqSourceUrl: "https://example.com/about",
    feedFormat: "rss",
    keywordFilterScope: "all",
    ...partial,
  };
}

function mkItem(
  id: string,
  sourceId: string,
  publishedTs: number,
  title = `item ${id}`,
): RssItem {
  return {
    id,
    sourceId,
    title,
    url: `https://example.com/${id}`,
    publishedTs,
    firstSeenTs: NOW_ISO,
    lastRefreshTs: NOW_ISO,
    description: "",
  };
}

function mkStatus(
  id: string,
  partial: Partial<RssSourceStatus> = {},
): RssSourceStatus {
  return {
    id,
    lastFetchOkTs: NOW_ISO,
    lastFetchAttemptTs: NOW_ISO,
    lastError: null,
    itemsSeenTotal: 0,
    itemsWritten24h: 0,
    ...partial,
  };
}

describe("assembleRssWire · graceful degradation", () => {
  it("returns unavailable shape with empty arrays when source flag is unavailable", () => {
    const res = assembleRssWire({
      orderedIds: [],
      itemsMap: new Map(),
      statusMap: new Map(),
      meta: null,
      sources: [],
      nowMs: NOW_MS,
      source: "unavailable",
    });
    expect(res.source).toBe("unavailable");
    expect(res.items).toEqual([]);
    expect(res.sources).toEqual([]);
    expect(res.meta.lastFetchOkTs).toBeNull();
  });

  it("still emits a row per configured source when there are zero items", () => {
    const sources = [mkSource({ id: "foo" })];
    const res = assembleRssWire({
      orderedIds: [],
      itemsMap: new Map(),
      statusMap: new Map(),
      meta: null,
      sources,
      nowMs: NOW_MS,
      source: "redis",
    });
    expect(res.sources).toHaveLength(1);
    expect(res.sources[0].id).toBe("foo");
    expect(res.sources[0].itemsLast24h).toBe(0);
    expect(res.sources[0].itemsLast7d).toBe(0);
    expect(res.sources[0].recentItems).toEqual([]);
    // No status ⇒ null lastFetchOkTs ⇒ stale = true
    expect(res.sources[0].stale).toBe(true);
  });
});

describe("assembleRssWire · per-source aggregation", () => {
  const sources: readonly RssSource[] = [
    mkSource({ id: "foo", displayName: "Foo News" }),
    mkSource({ id: "bar", displayName: "Bar Daily", country: "DE", lang: "de" }),
  ];

  it("counts itemsLast24h against the publishedTs cutoff, not firstSeenTs", () => {
    const nowSec = Math.floor(NOW_MS / 1000);
    const within24h = nowSec - 60 * 60; // 1h ago
    const outside24h = nowSec - 48 * 60 * 60; // 48h ago
    const items = [
      mkItem("a", "foo", within24h),
      mkItem("b", "foo", outside24h),
    ];
    const res = assembleRssWire({
      orderedIds: ["a", "b"],
      itemsMap: new Map(items.map((i) => [i.id, i])),
      statusMap: new Map([["foo", mkStatus("foo")]]),
      meta: null,
      sources,
      nowMs: NOW_MS,
      source: "redis",
    });
    const foo = res.sources.find((s) => s.id === "foo")!;
    expect(foo.itemsLast24h).toBe(1);
    expect(foo.itemsLast7d).toBe(2);
  });

  it("caps recentItems per source at RSS_RECENT_ITEMS_PER_SOURCE", () => {
    const nowSec = Math.floor(NOW_MS / 1000);
    const items: RssItem[] = [];
    for (let i = 0; i < 12; i++) {
      items.push(mkItem(`x${i}`, "foo", nowSec - i * 60));
    }
    const orderedIds = items.map((i) => i.id); // already desc by publishedTs
    const res = assembleRssWire({
      orderedIds,
      itemsMap: new Map(items.map((i) => [i.id, i])),
      statusMap: new Map([["foo", mkStatus("foo")]]),
      meta: null,
      sources,
      nowMs: NOW_MS,
      source: "redis",
    });
    const foo = res.sources.find((s) => s.id === "foo")!;
    expect(foo.recentItems).toHaveLength(RSS_RECENT_ITEMS_PER_SOURCE);
    expect(foo.itemsLast7d).toBe(12);
    // recentItems preserves ZRANGE order (most recent first)
    expect(foo.recentItems[0].id).toBe("x0");
    expect(foo.recentItems[RSS_RECENT_ITEMS_PER_SOURCE - 1].id).toBe(
      `x${RSS_RECENT_ITEMS_PER_SOURCE - 1}`,
    );
  });

  it("joins source registry fields (displayName, lat/lng, lang) onto each wire item", () => {
    const nowSec = Math.floor(NOW_MS / 1000);
    const item = mkItem("a", "bar", nowSec - 60);
    const res = assembleRssWire({
      orderedIds: ["a"],
      itemsMap: new Map([["a", item]]),
      statusMap: new Map([["bar", mkStatus("bar")]]),
      meta: null,
      sources,
      nowMs: NOW_MS,
      source: "redis",
    });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].kind).toBe("rss");
    expect(res.items[0].sourceDisplayName).toBe("Bar Daily");
    expect(res.items[0].country).toBe("DE");
    expect(res.items[0].lang).toBe("de");
  });

  it("drops orphaned items whose sourceId is not in the registry", () => {
    const nowSec = Math.floor(NOW_MS / 1000);
    const orphan = mkItem("z", "retired-source", nowSec - 60);
    const res = assembleRssWire({
      orderedIds: ["z"],
      itemsMap: new Map([["z", orphan]]),
      statusMap: new Map(),
      meta: null,
      sources,
      nowMs: NOW_MS,
      source: "redis",
    });
    expect(res.items).toEqual([]);
    expect(res.sources.every((s) => s.recentItems.length === 0)).toBe(true);
  });
});

describe("assembleRssWire · staleness", () => {
  const sources = [mkSource({ id: "foo" })];

  it("marks a source stale when lastFetchOkTs is older than the threshold", () => {
    const stale = new Date(
      NOW_MS - (RSS_STALE_HOURS_THRESHOLD + 1) * 3600 * 1000,
    ).toISOString();
    const res = assembleRssWire({
      orderedIds: [],
      itemsMap: new Map(),
      statusMap: new Map([
        ["foo", mkStatus("foo", { lastFetchOkTs: stale })],
      ]),
      meta: null,
      sources,
      nowMs: NOW_MS,
      source: "redis",
    });
    expect(res.sources[0].stale).toBe(true);
    expect(res.sources[0].staleHours).toBeGreaterThan(
      RSS_STALE_HOURS_THRESHOLD,
    );
  });

  it("marks a source fresh when lastFetchOkTs is within the threshold", () => {
    const fresh = new Date(NOW_MS - 2 * 3600 * 1000).toISOString();
    const res = assembleRssWire({
      orderedIds: [],
      itemsMap: new Map(),
      statusMap: new Map([
        ["foo", mkStatus("foo", { lastFetchOkTs: fresh })],
      ]),
      meta: null,
      sources,
      nowMs: NOW_MS,
      source: "redis",
    });
    expect(res.sources[0].stale).toBe(false);
    expect(res.sources[0].staleHours).toBe(2);
  });

  it("marks a source stale when there is no successful fetch recorded", () => {
    const res = assembleRssWire({
      orderedIds: [],
      itemsMap: new Map(),
      statusMap: new Map([
        ["foo", mkStatus("foo", { lastFetchOkTs: null })],
      ]),
      meta: null,
      sources,
      nowMs: NOW_MS,
      source: "redis",
    });
    expect(res.sources[0].stale).toBe(true);
    expect(res.sources[0].staleHours).toBeNull();
  });
});

describe("assembleRssWire · global meta", () => {
  const sources = [mkSource({ id: "foo" })];

  it("converts meta.lastFetchOkTs into staleMinutes", () => {
    const lastOk = new Date(NOW_MS - 15 * 60 * 1000).toISOString();
    const meta: RssIngestMeta = {
      lastFetchOkTs: lastOk,
      lastFetchAttemptTs: lastOk,
      lastError: null,
      sourcesOk: 1,
      sourcesFailed: 0,
    };
    const res = assembleRssWire({
      orderedIds: [],
      itemsMap: new Map(),
      statusMap: new Map(),
      meta,
      sources,
      nowMs: NOW_MS,
      source: "redis",
    });
    expect(res.meta.lastFetchOkTs).toBe(lastOk);
    expect(res.meta.staleMinutes).toBe(15);
  });

  it("returns null staleMinutes when the ingest has never succeeded", () => {
    const res = assembleRssWire({
      orderedIds: [],
      itemsMap: new Map(),
      statusMap: new Map(),
      meta: null,
      sources,
      nowMs: NOW_MS,
      source: "redis",
    });
    expect(res.meta.lastFetchOkTs).toBeNull();
    expect(res.meta.staleMinutes).toBeNull();
  });
});
