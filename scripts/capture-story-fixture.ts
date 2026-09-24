// Captures the article-shaped items gawk.dev holds right now into a story-clustering fixture.
// Public sources only, and minimal fields (headline, link, publisher, language, time) — no article text,
// because this repo is public.
//
//   npx tsx scripts/capture-story-fixture.ts src/lib/stories/__tests__/fixtures/articles-<date>.json
import { writeFileSync } from "fs";

type Item = {
  id: string;
  source: "rss" | "hn" | "reddit" | "producthunt";
  publisher: string;
  lang: string;
  country: string | null;
  title: string;
  url: string;
  ts: string;
  points?: number;
};

type FeedCard = {
  type: string;
  id: string;
  headline: string;
  sourceName: string;
  sourceUrl: string;
  timestamp: string;
  meta?: Record<string, unknown>;
};

const bust = () => `cb=${Date.now()}`;

async function main() {
  const capturedAt = new Date().toISOString();
  const items: Item[] = [];
  const seen = new Set<string>();
  const add = (i: Item) => {
    if (seen.has(i.url)) return;
    seen.add(i.url);
    items.push(i);
  };

  const rss = await (await fetch(`https://gawk.dev/api/rss?${bust()}`)).json();
  for (const i of rss.items)
    add({ id: `rss:${i.id}`, source: "rss", publisher: i.sourceDisplayName, lang: i.lang,
      country: i.country ?? null, title: i.title, url: i.url, ts: new Date(i.publishedTs * 1000).toISOString() });

  const hn = await (await fetch(`https://gawk.dev/api/hn?${bust()}`)).json();
  for (const i of hn.items)
    add({ id: `hn:${i.id}`, source: "hn", publisher: "Hacker News", lang: "en", country: null, title: i.title,
      url: i.url ?? `https://news.ycombinator.com/item?id=${i.id}`, ts: i.createdAt, points: i.points });

  // Product Hunt, Reddit and older Hacker News: the cards that surfaced in the live Feed and in the daily
  // feed snapshots in gawk-data (18–24 Sep). Threshold-passing stories only.
  const snaps: { cards?: FeedCard[] }[] = [(await (await fetch(`https://gawk.dev/api/v1/feed?${bust()}`)).json())];
  for (let d = 18; d <= 24; d++) {
    const r = await fetch(
      `https://raw.githubusercontent.com/Neelagiri65/gawk-data/main/snapshots/2026/09/2026-09-${d}/feed.json`);
    if (r.ok) snaps.push((await r.json()).record);
  }
  for (const s of snaps)
    for (const c of s.cards ?? []) {
      if (c.type === "PRODUCT_LAUNCH")
        add({ id: `ph:${c.id}`, source: "producthunt", publisher: "Product Hunt", lang: "en", country: null,
          title: c.headline, url: c.sourceUrl, ts: c.timestamp,
          points: typeof c.meta?.votes === "number" ? c.meta.votes : undefined });
      if (c.type === "NEWS") {
        const reddit = String(c.sourceName).startsWith("r/");
        add({ id: `${reddit ? "reddit" : "hn"}:${c.id}`, source: reddit ? "reddit" : "hn", publisher: c.sourceName,
          lang: "en", country: null, title: c.headline, url: c.sourceUrl, ts: c.timestamp,
          points: typeof c.meta?.points === "number" ? c.meta.points : undefined });
      }
    }

  items.sort((a, b) => a.ts.localeCompare(b.ts));
  const counts: Record<string, number> = {};
  for (const i of items) counts[i.source] = (counts[i.source] ?? 0) + 1;
  const out = {
    capturedAt,
    counts,
    coverage: {
      rss: "live /api/rss: every stored publisher item (~7 days)",
      hn: "live /api/hn (~1 day) + NEWS cards from the live feed and gawk-data daily snapshots 18–24 Sep (threshold-passing only)",
      reddit: "NEWS cards from the live feed and gawk-data daily snapshots 18–24 Sep only (threshold-passing only)",
      producthunt: "PRODUCT_LAUNCH cards from the live feed and gawk-data daily snapshots 18–24 Sep",
    },
    items,
  };
  writeFileSync(process.argv[2], JSON.stringify(out, null, 1) + "\n");
  console.log(capturedAt, counts, items.length);
}

main();
