/**
 * Digest RSS builder. The feed drives the Zapier → LinkedIn cross-post,
 * so the contract that matters: items are the already-published archive
 * verbatim (subject/tldr, real /digest/{date} links), XML-significant
 * characters are escaped (subjects contain "·" and free text), and an
 * empty archive yields a valid empty channel rather than an error.
 */
import { describe, expect, it } from "vitest";

import { buildDigestRssXml, escapeXml } from "@/lib/digest/rss";

const item = {
  date: "2026-07-05",
  subject: "Gawk — 2026-07-05 · 2 tool incidents & benchmarks moved",
  tldr: "2 tool incidents · 4 benchmark movers",
  generatedAt: "2026-07-05T07:20:00.000Z",
};

describe("buildDigestRssXml", () => {
  it("renders an item verbatim from the archived digest", () => {
    const xml = buildDigestRssXml([item], "https://gawk.dev");
    expect(xml).toContain("<title>Gawk — 2026-07-05 · 2 tool incidents &amp; benchmarks moved</title>");
    expect(xml).toContain("<link>https://gawk.dev/digest/2026-07-05</link>");
    expect(xml).toContain('<guid isPermaLink="true">https://gawk.dev/digest/2026-07-05</guid>');
    expect(xml).toContain("<pubDate>Sun, 05 Jul 2026 07:20:00 GMT</pubDate>");
    expect(xml).toContain("<description>2 tool incidents · 4 benchmark movers</description>");
  });

  it("escapes XML-significant characters — subjects are free text", () => {
    const xml = buildDigestRssXml(
      [{ ...item, subject: `<script>&"'` }],
      "https://gawk.dev",
    );
    expect(xml).toContain("<title>&lt;script&gt;&amp;&quot;&apos;</title>");
    expect(xml).not.toContain("<script>");
  });

  it("empty archive → valid empty channel, not an error", () => {
    const xml = buildDigestRssXml([], "https://gawk.dev");
    expect(xml).toContain("<rss version=\"2.0\">");
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });

  it("missing tldr falls back to a fixed line, never fabricated content", () => {
    const xml = buildDigestRssXml(
      [{ ...item, tldr: undefined }],
      "https://gawk.dev",
    );
    expect(xml).toContain("<description>Daily brief from the Gawk observatory.</description>");
  });

  it("strips a trailing slash on the base URL", () => {
    const xml = buildDigestRssXml([item], "https://gawk.dev/");
    expect(xml).toContain("<link>https://gawk.dev/digest/2026-07-05</link>");
  });
});

describe("escapeXml", () => {
  it("escapes all five significant characters", () => {
    expect(escapeXml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&apos;");
  });
});
