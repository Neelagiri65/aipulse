/**
 * Pre-composed share-link builders for the digest email.
 *
 * The email can't run JavaScript, so "one-click share" means a plain
 * href to LinkedIn's / X's compose intent with the text + URL already
 * prefilled. The recipient clicks, lands on the platform with the
 * post drafted, and posts it as-is.
 *
 * Keeping this pure + separate from the React template so we can test
 * the URL shape directly and the template stays focused on layout.
 */

export type SharePlatform = "linkedin" | "x";

export type BuildShareUrlOpts = {
  platform: SharePlatform;
  /** Sharer's landing URL — the section-anchored /digest/{date}#slug. */
  url: string;
  /** Pre-composed post body. LinkedIn uses the og: tags of `url`, so
   *  LinkedIn ignores `text`; X composes the tweet verbatim. */
  text: string;
};

export function buildShareUrl(opts: BuildShareUrlOpts): string {
  if (opts.platform === "linkedin") {
    // LinkedIn sharing intent — only `url` is respected. LinkedIn
    // auto-populates the post preview from the URL's og: tags, so our
    // section pages on /digest/{date} need good og:title + og:description
    // to make the pre-composed post look decent.
    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(opts.url)}`;
  }
  // X (Twitter) compose intent. `text` and `url` are both honoured and
  // shown as-is in the compose box.
  const params = new URLSearchParams({ text: opts.text, url: opts.url });
  return `https://x.com/intent/tweet?${params.toString()}`;
}

/** One-line share copy for a digest section. Pairs the section headline
 *  with the AI Pulse brand so the post stands alone in a feed. */
export function composeShareText(sectionTitle: string, headline: string): string {
  return `${sectionTitle}: ${headline} — via AI Pulse`;
}
