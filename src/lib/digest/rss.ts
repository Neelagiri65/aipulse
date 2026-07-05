/**
 * Digest RSS builder — pure XML assembly over already-archived digests.
 *
 * Exists for distribution automation (the Zapier → LinkedIn Pages
 * cross-post watches this feed), and doubles as a plain RSS surface for
 * anyone's reader. Content is strictly the already-published archive:
 * title = the digest's real subject line, link = the public
 * /digest/{date} page, description = the digest's own tldr/greeting —
 * nothing is composed or summarised here, so the feed can never say
 * something the sent email didn't.
 */

import type { DigestBody } from "@/lib/digest/types";

export type DigestRssItem = Pick<
  DigestBody,
  "date" | "subject" | "tldr" | "generatedAt"
>;

/** Escape the five XML-significant characters for element text. */
export function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildDigestRssXml(
  items: DigestRssItem[],
  baseUrl: string,
): string {
  const origin = baseUrl.replace(/\/$/, "");
  const channelItems = items
    .map((d) => {
      const link = `${origin}/digest/${d.date}`;
      const pubDate = new Date(d.generatedAt).toUTCString();
      const description = d.tldr ?? "Daily brief from the Gawk observatory.";
      return [
        "    <item>",
        `      <title>${escapeXml(d.subject)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${pubDate}</pubDate>`,
        `      <description>${escapeXml(description)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0">`,
    `  <channel>`,
    `    <title>The Daily Gawk</title>`,
    `    <link>${escapeXml(`${origin}/newsletter`)}</link>`,
    `    <description>One email a day on what actually moved in the AI ecosystem. Every number cites its public source.</description>`,
    `    <language>en</language>`,
    channelItems,
    `  </channel>`,
    `</rss>`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}
