/**
 * Layer A trust test — RSS ingest + wire assembly.
 *
 * Output-invariant (prd-trust-harness §1). RSS items carry an arbitrary
 * publisher URL, so attribution is `checkResolvableSource` (well-formed
 * https, no nested-host) rather than a fixed host. The gate that keeps the
 * feed trustworthy lives in `normaliseItem`: an item with no link (no
 * attribution) or an unparseable pubDate (freshness unverifiable) is
 * DROPPED at ingest — never stored, never served. This test pins that gate
 * and asserts every assembled wire item is attributed.
 */

import { describe, expect, it } from "vitest";

import {
  assembleRssWire,
  normaliseItem,
  type RssItem,
  type RssRawItem,
} from "@/lib/data/wire-rss";
import type { RssSource } from "@/lib/data/rss-sources";
import { checkResolvableSource } from "@/lib/trust/invariants";

const NOW = Date.parse("2026-04-30T12:00:00.000Z");
const NOW_ISO = new Date(NOW).toISOString();

const source: RssSource = {
  id: "latent-space",
  displayName: "Latent Space",
  city: "San Francisco",
  country: "US",
  lat: 37.77,
  lng: -122.42,
  lang: "en",
  rssUrl: "https://www.latent.space/feed",
  hqSourceUrl: "https://www.latent.space/about",
  publisherUrl: "https://www.latent.space",
  feedFormat: "rss",
  keywordFilterScope: "all",
};

function raw(overrides: Partial<RssRawItem>): RssRawItem {
  return {
    title: overrides.title ?? "A post about LLMs",
    link: overrides.link ?? "https://www.latent.space/p/some-post",
    pubDate: overrides.pubDate ?? new Date(NOW - 2 * 60 * 60 * 1000).toUTCString(),
    guid: overrides.guid ?? "guid-1",
    description: overrides.description ?? "body",
  };
}

describe("RSS — Layer A trust invariants", () => {
  it("a well-formed item normalises and its url is attributed (resolvable, https)", () => {
    const item = normaliseItem(raw({}), source, NOW_ISO);
    expect(item).not.toBeNull();
    expect(checkResolvableSource(item!.url)).toBeNull();
  });

  it("INCIDENT (no attribution): an item with no link is DROPPED, never stored", () => {
    expect(normaliseItem(raw({ link: "" }), source, NOW_ISO)).toBeNull();
  });

  it("INCIDENT (freshness unverifiable): an item with an unparseable pubDate is DROPPED", () => {
    expect(normaliseItem(raw({ pubDate: "not-a-date" }), source, NOW_ISO)).toBeNull();
    expect(normaliseItem(raw({ pubDate: "" }), source, NOW_ISO)).toBeNull();
  });

  it("every assembled wire item is attributed (resolvable source url)", () => {
    const items: RssItem[] = [
      normaliseItem(raw({ guid: "a", link: "https://www.latent.space/p/a" }), source, NOW_ISO)!,
      normaliseItem(raw({ guid: "b", link: "https://www.latent.space/p/b" }), source, NOW_ISO)!,
    ];
    const wire = assembleRssWire({
      orderedIds: items.map((i) => i.id),
      itemsMap: new Map(items.map((i) => [i.id, i])),
      statusMap: new Map(),
      meta: null,
      sources: [source],
      nowMs: NOW,
      source: "redis",
    });
    expect(wire.items.length).toBe(2);
    for (const it of wire.items) {
      expect(checkResolvableSource(it.url)).toBeNull();
    }
  });
});
