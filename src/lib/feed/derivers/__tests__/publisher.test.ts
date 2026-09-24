/**
 * Regional publishers into the Feed (founder, 2026-09-24: "regional ones … never surface in any
 * of the tabs"). One NEWS card per recent article, in the publisher's own order, capped per
 * publisher so Heise (≈92 AI stories a week) cannot bury the rest. No re-ranking, no rewriting.
 */
import { describe, expect, it } from "vitest";
import { derivePublisherCards } from "@/lib/feed/derivers/publisher";
import { FEED_TRIGGERS } from "@/lib/feed/thresholds";
import type { RssWireItem } from "@/lib/data/wire-rss";

const NOW = Date.parse("2026-09-23T20:00:00Z");
const hoursAgo = (h: number) => Math.floor((NOW - h * 3600_000) / 1000);
let n = 0;
function item(sourceId: string, h: number, extra: Partial<RssWireItem> = {}): RssWireItem {
  n += 1;
  const id = n.toString(16).padStart(16, "0");
  return {
    id, sourceId, title: `${sourceId} story ${n}`, url: `https://example.com/${sourceId}/${n}`,
    publishedTs: hoursAgo(h), firstSeenTs: "x", lastRefreshTs: "x", description: "", imageUrl: null,
    kind: "rss", sourceDisplayName: sourceId === "heise-ai" ? "Heise Online" : "MarkTechPost",
    city: sourceId === "heise-ai" ? "Hannover" : "New Delhi", country: sourceId === "heise-ai" ? "DE" : "IN",
    lat: 0, lng: 0, lang: sourceId === "heise-ai" ? "de" : "en", ...extra,
  };
}

describe("derivePublisherCards", () => {
  it("one PRESS card per recent article, title verbatim, linked to the article, attributed to the publisher", () => {
    const [c] = derivePublisherCards([item("marktechpost", 1)], NOW);
    expect(c.type).toBe("PRESS");
    expect(c.headline).toBe("marktechpost story " + n);
    expect(c.sourceName).toBe("MarkTechPost");
    expect(c.sourceUrl).toBe(`https://example.com/marktechpost/${n}`);
    expect(c.meta.publisher).toBe("marktechpost");
    expect(c.meta.country).toBe("IN");
    expect(c.meta.lang).toBe("en");
  });
  it("caps each publisher per window, keeping the publisher's own order", () => {
    const items = [item("heise-ai", 1), item("heise-ai", 2), item("heise-ai", 3), item("heise-ai", 4), item("marktechpost", 1)];
    const cards = derivePublisherCards(items, NOW);
    const heise = cards.filter((c) => c.meta.publisher === "heise-ai");
    expect(heise).toHaveLength(FEED_TRIGGERS.NEWS_PUBLISHER_MAX_PER_SOURCE);
    expect(heise.map((c) => c.headline)).toEqual(items.slice(0, FEED_TRIGGERS.NEWS_PUBLISHER_MAX_PER_SOURCE).map((i) => i.title));
    expect(cards.filter((c) => c.meta.publisher === "marktechpost")).toHaveLength(1);
  });
  it("drops articles older than the window and future-dated ones", () => {
    const cards = derivePublisherCards([item("marktechpost", FEED_TRIGGERS.NEWS_PUBLISHER_WINDOW_HOURS + 1), item("marktechpost", -1)], NOW);
    expect(cards).toHaveLength(0);
  });
  it("carries the gawk.dev image path only when the publisher attached an image", () => {
    const withImg = item("heise-ai", 1, { imageUrl: "https://www.heise.de/a.jpg" });
    const [a, b] = derivePublisherCards([withImg, item("heise-ai", 2)], NOW);
    expect(a.meta.imagePath).toBe(`/api/rss/image/${withImg.id}`);
    expect(b.meta.imagePath).toBeUndefined();
  });
  it("marks non-English titles by language, and never rewrites them", () => {
    const de = item("heise-ai", 1, { title: "Bundestags-KI: Eigener Chatbot soll Schatten-KI im Parlament ablösen" });
    const [c] = derivePublisherCards([de], NOW);
    expect(c.headline).toBe(de.title);
    expect(c.meta.lang).toBe("de");
  });
  it("re-applies the AI filter to keyword-filtered publishers, so items stored under the old substring rule stop surfacing", () => {
    const phone = item("heise-ai", 1, { title: "Xiaomi 18 Pro und 18 Pro Max: Top-Handys mit neuen Snapdragon-Chips" });
    const ki = item("heise-ai", 2, { title: "Schäden durch KI: EU diskutiert neue Haftungsregeln" });
    const cards = derivePublisherCards([phone, ki], NOW);
    expect(cards.map((c) => c.headline)).toEqual([ki.title]);
  });
});
