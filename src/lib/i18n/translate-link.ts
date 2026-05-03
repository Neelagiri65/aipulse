/**
 * Translate-link helper (S60 Build 4).
 *
 * Returns a Google Translate URL that loads `sourceUrl` translated to
 * English when the source language is non-English, or null when the
 * language is English / unset / unknown. Strict `lang !== "en"` rule —
 * the pill never fires on English content because translating an
 * already-English article reads as condescending.
 *
 * Used by:
 *   - Wire panel publisher rows + article rows (RegionalWirePanel)
 *   - Source detail card (SourceCard)
 *   - Digest section items where DigestSectionItem.sourceLang is set
 *
 * Trust contract: zero backend, zero network. Pure URL construction.
 * The user clicks through to Google Translate and reads the upstream
 * article in their browser; Gawk never proxies, caches, or rewrites
 * the source content.
 */

/**
 * Build a Google Translate URL that opens `sourceUrl` translated to
 * English (auto-detect source language). Returns null when the lang
 * indicates English content, when lang is missing/empty, or when the
 * sourceUrl is not a parseable URL — in any of those cases the caller
 * should NOT render a translate pill.
 *
 * URL format pinned to the legacy `/translate?` path; both that and
 * the modern `/?op=translate` work today, the legacy form is what
 * every doc + every other site links to and is the most stable bet.
 */
export function deriveTranslateUrl(
  sourceUrl: string | null | undefined,
  lang: string | null | undefined,
): string | null {
  if (!sourceUrl || !lang) return null;
  const normalised = lang.toLowerCase().trim();
  if (normalised === "" || normalised === "en" || normalised.startsWith("en-")) {
    return null;
  }
  // Validate the source URL — refuse to wrap a malformed URL because
  // Google Translate would silently fail or open a junk redirect.
  try {
    const u = new URL(sourceUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return `https://translate.google.com/translate?sl=auto&tl=en&u=${encodeURIComponent(sourceUrl)}`;
}

/**
 * Short user-facing label for the translate affordance. Single source
 * of truth so the pill copy stays consistent across the wire panel,
 * the source card, and the digest renderer.
 */
export const TRANSLATE_LABEL = "🌐 Translate";
