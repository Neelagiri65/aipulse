/**
 * Regional RSS sources — typed registry + schema validator.
 *
 * Companion to `docs/prd-regional-rss.md` (session 21). Each source is a
 * non-HN, non-SV publisher whose HQ coordinates are verifiable from a
 * public source. The registry intentionally keeps five slots; scope
 * expansion (6+) is a session-22+ decision.
 *
 * Discipline mirrors `labs-registry.ts`:
 *   - hqSourceUrl must be https and citation-grade.
 *   - country is ISO 3166-1 alpha-2, uppercase.
 *   - rssUrl must be https and return a parseable RSS 2.0 or Atom feed.
 *   - keywordFilterScope declares whether the ingest pipeline should
 *     apply the AI-keyword filter (for publication-wide feeds like
 *     Heise) or trust the publisher's own AI-topic scope (Register AI,
 *     MIT TR AI, MarkTechPost, Synced Review).
 *
 * Every change to this file is a CHECKPOINT under the dual-model build
 * protocol. AUDITOR-REVIEW: PENDING until the feature branch merges to
 * main with explicit sign-off.
 */

export type RssFeedFormat = "rss" | "atom";
export type RssFilterScope = "all" | "ai-only";

export type RssSource = {
  /** Stable kebab-case id; used as Redis key component and citation anchor. */
  id: string;
  /** Human-readable display name shown in UI. */
  displayName: string;
  /** Publisher's headquarters city, as users recognise it. */
  city: string;
  /** ISO 3166-1 alpha-2 country code, uppercase. "UK" preferred over "GB" per lay convention. */
  country: string;
  /** Latitude of the publisher's HQ. */
  lat: number;
  /** Longitude of the publisher's HQ. */
  lng: number;
  /** BCP-47 short language tag of the feed content (lowercase). */
  lang: string;
  /** The actual RSS/Atom feed URL we poll. Must be https. */
  rssUrl: string;
  /** Public URL substantiating the HQ city claim. */
  hqSourceUrl: string;
  /** Feed serialisation format. */
  feedFormat: RssFeedFormat;
  /**
   * "all" trusts the publisher's own topic scope and keeps every item.
   * "ai-only" applies the deterministic AI-keyword filter before storing.
   */
  keywordFilterScope: RssFilterScope;
  /** Optional transparency caveat surfaced next to the source in UI. */
  caveat?: string;
};

export type RssSourcesValidation =
  | { ok: true; entries: RssSource[] }
  | { ok: false; error: string };

const FEED_FORMATS: ReadonlySet<RssFeedFormat> = new Set(["rss", "atom"]);
const FILTER_SCOPES: ReadonlySet<RssFilterScope> = new Set(["all", "ai-only"]);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isHttpsUrl(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("https://");
}

function isIsoCountry(v: unknown): v is string {
  return typeof v === "string" && /^[A-Z]{2}$/.test(v);
}

function isLowercaseLang(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v === v.toLowerCase();
}

function validateEntry(e: unknown, index: number): RssSource | string {
  if (!e || typeof e !== "object") {
    return `entry[${index}] is not an object`;
  }
  const x = e as Record<string, unknown>;
  if (!isNonEmptyString(x.id)) return `entry[${index}] missing id`;
  if (!isNonEmptyString(x.displayName)) {
    return `entry[${index}] (${x.id}) missing displayName`;
  }
  if (!isNonEmptyString(x.city)) {
    return `entry[${index}] (${x.id}) missing city`;
  }
  if (!isIsoCountry(x.country)) {
    return `entry[${index}] (${x.id}) invalid country: ${String(x.country)}`;
  }
  if (!isFiniteNumber(x.lat) || x.lat < -90 || x.lat > 90) {
    return `entry[${index}] (${x.id}) lat out of range: ${String(x.lat)}`;
  }
  if (!isFiniteNumber(x.lng) || x.lng < -180 || x.lng > 180) {
    return `entry[${index}] (${x.id}) lng out of range: ${String(x.lng)}`;
  }
  if (!isLowercaseLang(x.lang)) {
    return `entry[${index}] (${x.id}) lang must be non-empty lowercase`;
  }
  if (!isHttpsUrl(x.rssUrl)) {
    return `entry[${index}] (${x.id}) rssUrl must be https://`;
  }
  if (!isHttpsUrl(x.hqSourceUrl)) {
    return `entry[${index}] (${x.id}) hqSourceUrl must be https://`;
  }
  if (
    typeof x.feedFormat !== "string" ||
    !FEED_FORMATS.has(x.feedFormat as RssFeedFormat)
  ) {
    return `entry[${index}] (${x.id}) invalid feedFormat: ${String(x.feedFormat)}`;
  }
  if (
    typeof x.keywordFilterScope !== "string" ||
    !FILTER_SCOPES.has(x.keywordFilterScope as RssFilterScope)
  ) {
    return `entry[${index}] (${x.id}) invalid keywordFilterScope: ${String(
      x.keywordFilterScope,
    )}`;
  }
  if (x.caveat !== undefined && typeof x.caveat !== "string") {
    return `entry[${index}] (${x.id}) caveat must be string when present`;
  }
  return {
    id: x.id,
    displayName: x.displayName,
    city: x.city,
    country: x.country,
    lat: x.lat,
    lng: x.lng,
    lang: x.lang,
    rssUrl: x.rssUrl,
    hqSourceUrl: x.hqSourceUrl,
    feedFormat: x.feedFormat as RssFeedFormat,
    keywordFilterScope: x.keywordFilterScope as RssFilterScope,
    caveat: x.caveat as string | undefined,
  };
}

export function validateRssSources(input: unknown): RssSourcesValidation {
  if (!Array.isArray(input)) {
    return { ok: false, error: "registry must be a top-level array" };
  }
  if (input.length === 0) {
    return { ok: false, error: "registry must contain at least one source" };
  }
  const seen = new Set<string>();
  const entries: RssSource[] = [];
  for (let i = 0; i < input.length; i++) {
    const res = validateEntry(input[i], i);
    if (typeof res === "string") {
      return { ok: false, error: res };
    }
    if (seen.has(res.id)) {
      return { ok: false, error: `duplicate id: ${res.id}` };
    }
    seen.add(res.id);
    entries.push(res);
  }
  return { ok: true, entries };
}

// ---------------------------------------------------------------------------
// The curated five
// ---------------------------------------------------------------------------

export const RSS_SOURCES: readonly RssSource[] = [
  {
    id: "the-register-ai",
    displayName: "The Register — AI/ML",
    city: "London",
    country: "UK",
    lat: 51.5074,
    lng: -0.1278,
    lang: "en",
    rssUrl: "https://www.theregister.com/software/ai_ml/headlines.atom",
    hqSourceUrl: "https://en.wikipedia.org/wiki/The_Register",
    feedFormat: "atom",
    keywordFilterScope: "all",
    caveat:
      "Topic-scoped Atom feed (AI/ML section). UK tech press tone; skews toward enterprise IT and security angles rather than research.",
  },
  {
    id: "heise-ai",
    displayName: "Heise Online",
    city: "Hannover",
    country: "DE",
    lat: 52.3759,
    lng: 9.732,
    lang: "de",
    rssUrl: "https://www.heise.de/rss/heise-atom.xml",
    hqSourceUrl: "https://en.wikipedia.org/wiki/Heise_online",
    feedFormat: "atom",
    keywordFilterScope: "ai-only",
    caveat:
      "Heise Online does not publish a topic-scoped AI feed; the global publication Atom is used and filtered with the same deterministic keyword list applied to HN (English + German AI terms). No LLM inference. Titles remain in German.",
  },
  {
    id: "synced-review",
    displayName: "Synced Review",
    city: "Beijing",
    country: "CN",
    lat: 39.9042,
    lng: 116.4074,
    lang: "en",
    rssUrl: "https://syncedreview.com/feed/",
    hqSourceUrl: "https://syncedreview.com/about/",
    feedFormat: "rss",
    keywordFilterScope: "all",
    caveat:
      "English-language publication covering Chinese and global AI research. Editorial team headquartered in Beijing; this is a curated-and-translated layer, not a native Chinese-language primary source.",
  },
  {
    id: "marktechpost",
    displayName: "MarkTechPost",
    city: "New Delhi",
    country: "IN",
    lat: 28.6139,
    lng: 77.209,
    lang: "en",
    rssUrl: "https://www.marktechpost.com/feed/",
    hqSourceUrl: "https://www.marktechpost.com/about-us/",
    feedFormat: "rss",
    keywordFilterScope: "all",
    caveat:
      "AI-research-focused publication with an India-based editorial team (CoFounder/Editor: Asif Razzaq, named on the publisher's About page). The publisher does not disclose a specific HQ city on its own About or Contact pages; pin is a Delhi NCR approximation, not a primary-source claim. AUDITOR-PENDING.",
  },
  {
    id: "mit-tech-review-ai",
    displayName: "MIT Technology Review — AI",
    city: "Cambridge",
    country: "US",
    lat: 42.3736,
    lng: -71.1097,
    lang: "en",
    rssUrl:
      "https://www.technologyreview.com/topic/artificial-intelligence/feed/",
    hqSourceUrl: "https://en.wikipedia.org/wiki/MIT_Technology_Review",
    feedFormat: "rss",
    keywordFilterScope: "all",
    caveat:
      "Topic-scoped AI feed from MIT's publication; US-based but an editorial counterweight to the SF/HN axis within the US.",
  },
] as const;
