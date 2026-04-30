import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  normaliseRedditItem,
  runRedditIngest,
  type RedditItem,
  type RedditStoreSink,
} from "@/lib/data/reddit-feed";
import { REDDIT_SOURCES } from "@/lib/data/reddit-sources";

const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("REDDIT_SOURCES — registry shape", () => {
  it("ships exactly two subs (LocalLLaMA + ClaudeAI)", () => {
    expect(REDDIT_SOURCES.map((s) => s.id).sort()).toEqual([
      "reddit-claudeai",
      "reddit-localllama",
    ]);
  });

  it("every entry has https rssUrl + publisherUrl", () => {
    for (const s of REDDIT_SOURCES) {
      expect(s.rssUrl.startsWith("https://")).toBe(true);
      expect(s.publisherUrl.startsWith("https://")).toBe(true);
    }
  });

  it("polls top-of-day so sub editorial discipline ranks the items", () => {
    for (const s of REDDIT_SOURCES) {
      expect(s.rssUrl).toMatch(/sort=top&t=day/);
    }
  });
});

describe("normaliseRedditItem", () => {
  const source = REDDIT_SOURCES[0];
  const NOW = "2026-04-30T12:00:00.000Z";

  it("returns a stored item with stable id and seconds-since-epoch publishedTs", () => {
    const item = normaliseRedditItem(
      {
        title: "Hello LocalLLaMA",
        link: "https://www.reddit.com/r/LocalLLaMA/comments/abc/post/",
        pubDate: "2026-04-30T11:30:00Z",
        guid: "t3_abc",
        description: "",
      },
      source,
      NOW,
    );
    expect(item).not.toBeNull();
    expect(item!.id).toMatch(/^[0-9a-f]{16}$/);
    expect(item!.sourceId).toBe(source.id);
    expect(item!.sourceDisplayName).toBe(source.displayName);
    expect(item!.publishedTs).toBe(
      Math.floor(Date.parse("2026-04-30T11:30:00Z") / 1000),
    );
    expect(item!.url).toContain("reddit.com");
  });

  it("returns null when title is empty", () => {
    const item = normaliseRedditItem(
      {
        title: "",
        link: "https://example.com/post",
        pubDate: "2026-04-30T11:30:00Z",
        guid: "t3_x",
        description: "",
      },
      source,
      NOW,
    );
    expect(item).toBeNull();
  });

  it("returns null when link is empty", () => {
    const item = normaliseRedditItem(
      {
        title: "Hello",
        link: "",
        pubDate: "2026-04-30T11:30:00Z",
        guid: "t3_x",
        description: "",
      },
      source,
      NOW,
    );
    expect(item).toBeNull();
  });

  it("returns null when pubDate is unparseable", () => {
    const item = normaliseRedditItem(
      {
        title: "Hello",
        link: "https://x.com/y",
        pubDate: "not a date",
        guid: "t3_x",
        description: "",
      },
      source,
      NOW,
    );
    expect(item).toBeNull();
  });

  it("rejects far-future timestamps (Reddit edited-post bug)", () => {
    const farFuture = "2030-01-01T00:00:00Z";
    const item = normaliseRedditItem(
      {
        title: "Hello",
        link: "https://x.com/y",
        pubDate: farFuture,
        guid: "t3_x",
        description: "",
      },
      source,
      NOW,
    );
    expect(item).toBeNull();
  });

  it("uses link as id key when guid is missing (fallback)", () => {
    const a = normaliseRedditItem(
      {
        title: "Same post",
        link: "https://www.reddit.com/r/x/comments/abc/post/",
        pubDate: "2026-04-30T11:30:00Z",
        guid: "",
        description: "",
      },
      source,
      NOW,
    );
    const b = normaliseRedditItem(
      {
        title: "Same post different scrape",
        link: "https://www.reddit.com/r/x/comments/abc/post/",
        pubDate: "2026-04-30T11:31:00Z",
        guid: "",
        description: "",
      },
      source,
      NOW,
    );
    // Same link → same id (dedup invariant)
    expect(a!.id).toBe(b!.id);
  });
});

describe("runRedditIngest", () => {
  function fakeAtomFeed(entries: Array<{ title: string; id: string }>): string {
    const xml = entries
      .map(
        (e) => `
      <entry>
        <title>${e.title}</title>
        <id>${e.id}</id>
        <link rel="alternate" href="https://www.reddit.com/r/X/comments/${e.id.replace("t3_", "")}/" />
        <updated>2026-04-30T11:00:00Z</updated>
        <content type="html">body</content>
      </entry>`,
      )
      .join("");
    return `<?xml version="1.0"?><feed>${xml}</feed>`;
  }

  function makeSink(): RedditStoreSink & {
    items: RedditItem[];
    indexed: Array<{ id: string; score: number }>;
    pruned: number[];
  } {
    const items: RedditItem[] = [];
    const indexed: Array<{ id: string; score: number }> = [];
    const pruned: number[] = [];
    return {
      items,
      indexed,
      pruned,
      writeItem: async (i) => {
        items.push(i);
      },
      zaddIndex: async (id, score) => {
        indexed.push({ id, score });
      },
      zpruneIndex: async (cutoff) => {
        pruned.push(cutoff);
        return 0;
      },
    };
  }

  it("fetches each source, normalises, and writes all valid items", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        fakeAtomFeed([
          { title: "Post 1", id: "t3_aaa" },
          { title: "Post 2", id: "t3_bbb" },
        ]),
    }) as unknown as typeof fetch;
    const sink = makeSink();
    const result = await runRedditIngest({
      sink,
      nowIso: "2026-04-30T12:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    // 2 sources × 2 entries = 4 writes
    expect(sink.items).toHaveLength(4);
    expect(sink.indexed).toHaveLength(4);
    expect(sink.pruned).toHaveLength(1);
    // Per-source error fields are null on success
    expect(result.sources.every((s) => s.error === null)).toBe(true);
    expect(result.sources.every((s) => s.fetched === 2)).toBe(true);
    expect(result.sources.every((s) => s.written === 2)).toBe(true);
  });

  it("isolates per-source failures (one HTTP 503 doesn't kill the batch)", async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      call += 1;
      if (call === 1) {
        return {
          ok: false,
          status: 503,
          text: async () => "",
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        text: async () => fakeAtomFeed([{ title: "Post 1", id: "t3_x" }]),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const sink = makeSink();
    const result = await runRedditIngest({
      sink,
      nowIso: "2026-04-30T12:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    // First source failed, second succeeded.
    expect(result.sources[0].error).toContain("503");
    expect(result.sources[0].written).toBe(0);
    expect(result.sources[1].error).toBeNull();
    expect(result.sources[1].written).toBe(1);
    expect(sink.items).toHaveLength(1);
  });

  it("sends a non-default User-Agent so Reddit doesn't 429 us", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => fakeAtomFeed([]),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    await runRedditIngest({
      sink: makeSink(),
      nowIso: "2026-04-30T12:00:00.000Z",
    });
    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/gawk\.dev/);
  });

  it("returns ok with no writes when sink is null (pre-Redis env)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => fakeAtomFeed([{ title: "p", id: "t3_x" }]),
    }) as unknown as typeof fetch;
    const result = await runRedditIngest({
      sink: null,
      nowIso: "2026-04-30T12:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    expect(result.sources.every((s) => s.written === 0)).toBe(true);
    expect(result.sources.every((s) => s.fetched > 0)).toBe(true);
  });
});
