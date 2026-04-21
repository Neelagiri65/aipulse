/**
 * HN digest section composer.
 *
 * HN is the only section that is always "current state" — points-weighted
 * top stories right now. It's not diffed because the `hn:item:*` keys in
 * Redis TTL at 24h, so there's no "yesterday" to diff against, and the
 * reader-useful signal is "what are people reading on HN right now" not
 * "which stories gained points since yesterday". Still surfaced as
 * `mode: "diff"` at the section level — the body-mode selector ignores
 * HN when deciding whether the whole digest is quiet.
 */

import type { HnWireResult } from "@/lib/data/wire-hn";
import type { DigestSection } from "@/lib/digest/types";

const HN_SOURCE_URL = "https://news.ycombinator.com/";

export const HN_SECTION_DEFAULTS = {
  id: "hn" as const,
  title: "Top HN stories",
  anchorSlug: "hn",
};

export type ComposeHnInput = {
  hn: HnWireResult;
  topN?: number;
};

export function composeHnSection(input: ComposeHnInput): DigestSection {
  const topN = input.topN ?? 5;
  const top = [...input.hn.items]
    .sort((a, b) => b.points - a.points)
    .slice(0, topN);

  const items = top.map((it) => ({
    headline: it.title,
    detail: `${it.points} points · ${it.numComments} comments${
      it.locationLabel ? ` · ${it.locationLabel}` : ""
    }`,
    sourceLabel: "news.ycombinator.com",
    sourceUrl: `https://news.ycombinator.com/item?id=${it.id}`,
  }));

  return {
    ...HN_SECTION_DEFAULTS,
    mode: "diff",
    headline:
      items.length === 0
        ? "HN wire is empty right now (nothing fetched)"
        : `Top ${items.length} on HN right now`,
    items,
    sourceUrls: [HN_SOURCE_URL],
  };
}
