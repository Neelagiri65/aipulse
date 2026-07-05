/**
 * Source → brand-mark resolver for the digest tile board.
 *
 * Maps a digest item's source (label, headline, or URL) to one of the
 * repo's self-hosted SVG marks (`public/marks/`, imported from the
 * Nativerse blog asset set) — crisp at tile scale where scraped favicons
 * pixelate. Sources without a mark yet fall back to the favicon service;
 * unknown sources return null and render text-only. Pure and total.
 *
 * Marks are ink-black SVGs, so tiles must set them on a light ground
 * (the warm-paper tile rule) — never on ink.
 */

const MARK_RULES: Array<{ pattern: RegExp; mark: string }> = [
  { pattern: /anthropic|claude/i, mark: "anthropic.svg" },
  { pattern: /openai|chatgpt/i, mark: "openai.svg" },
  { pattern: /hugg?ing\s?face|hf\b/i, mark: "huggingface.svg" },
  { pattern: /pypi|pypistats|python/i, mark: "python.svg" },
  { pattern: /github/i, mark: "github.svg" },
  { pattern: /ollama/i, mark: "ollama.svg" },
  { pattern: /meta\b|llama/i, mark: "meta.svg" },
  { pattern: /mistral/i, mark: "mistralai.svg" },
  { pattern: /gemini|deepmind|google/i, mark: "googlegemini.svg" },
  // Map by owning platform to a mark we actually have:
  { pattern: /codex/i, mark: "openai.svg" },
  { pattern: /copilot/i, mark: "github.svg" },
];

/** Neutral fallback mark (a plain repo/box glyph) so a tile/row is NEVER
 *  blank — an empty icon reads as broken. Used when no brand mark matches. */
export const FALLBACK_MARK = "/marks/generic.svg";

/** Resolve a self-hosted mark path ("/marks/x.svg") or null. */
export function markFor(
  ...texts: Array<string | undefined>
): string | null {
  for (const t of texts) {
    if (!t) continue;
    for (const rule of MARK_RULES) {
      if (rule.pattern.test(t)) return `/marks/${rule.mark}`;
    }
  }
  return null;
}

/** Like markFor but never null — falls back to the neutral generic mark
 *  so no surface renders a blank icon. */
export function markOrFallback(...texts: Array<string | undefined>): string {
  return markFor(...texts) ?? FALLBACK_MARK;
}

/** PNG variant of a mark path for email surfaces — Gmail blocks SVG in
 *  <img>, so email uses the pre-rendered 48px charcoal PNGs. Strict
 *  monochrome: email has NO favicon fallback (CSS filters are stripped
 *  by mail clients, so a colour favicon could not be normalised there);
 *  markless items render without an icon. */
export function markPngFor(
  ...texts: Array<string | undefined>
): string {
  const svg = markFor(...texts) ?? FALLBACK_MARK;
  return svg.replace("/marks/", "/marks/png/").replace(".svg", ".png");
}

/** Favicon fallback for sources without a mark. Null on unparsable URLs. */
export function faviconFallback(sourceUrl: string | undefined): string | null {
  if (!sourceUrl) return null;
  try {
    const host = new URL(sourceUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch {
    return null;
  }
}

/** Tile icon: self-hosted mark first, favicon fallback second. */
export function tileIcon(item: {
  sourceLabel?: string;
  headline?: string;
  sourceUrl?: string;
}): { src: string; selfHosted: boolean } | null {
  // Headline first: it names the SUBJECT (OpenAI Agents, ollama/ollama);
  // the source label often names the REGISTRY (pypistats) and would win
  // with a generic mark.
  const mark = markFor(item.headline, item.sourceLabel, item.sourceUrl);
  if (mark) return { src: mark, selfHosted: true };
  const fav = faviconFallback(item.sourceUrl);
  return fav ? { src: fav, selfHosted: false } : null;
}
