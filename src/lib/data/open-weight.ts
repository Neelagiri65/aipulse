/**
 * Open-weight model classification — pure helper used by:
 *   - The OPEN badge on the Model Usage panel (OpenRouter rows).
 *   - The NEW_RELEASE feed deriver (HF rows) to label the card.
 *
 * Slug-pattern allowlist: a model is considered open-weight iff the
 * slug after the publisher prefix matches one of `OPEN_WEIGHT_PATTERNS`.
 * This is deliberately a curated heuristic, NOT license-string parsing
 * (license fields vary inconsistently across providers — "Apache 2.0"
 * vs "MIT License" vs "Llama 3 Community Custom" — and OpenRouter's API
 * does not return a normalised license today).
 *
 * Trade-off:
 *  - org-level allowlist over-tags Google's proprietary Gemini as open
 *    (because Google ships Gemma open-weight too).
 *  - license-string matching is fully general but requires new ingest +
 *    a non-trivial classifier.
 *  - slug-pattern wins by being deterministic + auditable + extensible
 *    in one regex commit, at the cost of missing UNKNOWN families until
 *    we add them to the list.
 *
 * AUDITOR-PENDING — this list will need an entry for every new
 * open-weight family that ships. The rule should be "explicit list, not
 * inference": if a family isn't here, the model renders without an OPEN
 * badge by design — better than over-claiming.
 */

/**
 * Lower-cased substrings matched against the slug AFTER the publisher
 * prefix. Order doesn't matter — first hit wins. Each entry should
 * correspond to a model FAMILY (e.g. "gemma" matches "gemma-3-27b" but
 * not "gemini-2.5-pro").
 *
 * Sources for inclusion (each must be verifiable open-weight as of
 * 2026-04 — Apache / MIT / Llama Community / Modified MIT / Gemma
 * Terms): qwen, deepseek, llama-*, mistral, mixtral, kimi, phi-* (incl.
 * phi-3 / phi-4), yi, gemma, grok-1 (note: grok-2/3 are proprietary).
 */
export const OPEN_WEIGHT_PATTERNS: readonly string[] = [
  "gemma",
  "qwen",
  "deepseek",
  "llama",
  "mistral",
  "mixtral",
  "kimi",
  "phi",
  "yi",
  "grok-1",
] as const;

/**
 * Slug-pattern allowlist check. Pure.
 *
 * Accepts either a full slug ("moonshotai/kimi-k2.6") or a bare model
 * name ("kimi-k2.6"). Lowercases before matching so "Llama-4-Scout"
 * still hits. Returns false on null / undefined / empty input rather
 * than throwing — callers don't need defensive guards.
 */
export function isOpenWeight(slug: string | null | undefined): boolean {
  if (!slug) return false;
  const lower = slug.toLowerCase();
  const slash = lower.indexOf("/");
  // Strip publisher prefix when present so "google/gemini-2.5-pro" is
  // matched on "gemini-2.5-pro" rather than "google" — the family name
  // after the slash is the canonical identifier.
  const family = slash >= 0 ? lower.slice(slash + 1) : lower;
  if (family.length === 0) return false;
  for (const pattern of OPEN_WEIGHT_PATTERNS) {
    if (family.includes(pattern)) return true;
  }
  return false;
}
