/**
 * ArXiv Research fetch — top 20 recent cs.AI / cs.LG papers.
 *
 * Source: https://export.arxiv.org/api/query
 *   - search_query=cat:cs.AI+OR+cat:cs.LG → AI + machine-learning papers
 *   - sortBy=submittedDate&sortOrder=descending → newest first
 *   - max_results=20 → top 20 latest submissions
 *   - No auth required. ArXiv asks for a 3s inter-call courtesy window;
 *     our 30-min Next.js Data Cache puts us two orders of magnitude
 *     below that so the politeness rule is satisfied by caching alone.
 *
 * Response format: Atom 1.0 XML. We parse with a minimal hand-rolled
 * scanner (split on </entry>, regex-extract fields) rather than pull in
 * an XML library — the shape is stable, the fields we read are
 * unambiguous, and every field is optional on the output type so a
 * missing tag never crashes the row.
 *
 * Trust contract: we echo arxiv's submitted/updated timestamps verbatim
 * and link out to arxiv.org for every row. No re-ranking, no editorial
 * filter, no citation enrichment (that's a v2 consideration).
 */

export type ArxivPaper = {
  /** arxiv id, e.g. "2604.15306v1". Derived from the entry <id> URL. */
  id: string;
  /** Paper title. Whitespace-collapsed so wrapped titles render cleanly. */
  title: string;
  /** List of author names in submission order. */
  authors: string[];
  /** ISO timestamp of initial submission (arxiv <published>). */
  published: string;
  /** ISO timestamp of latest revision (arxiv <updated>). */
  updated: string;
  /** arxiv primary category, e.g. "cs.AI". Drives the row badge. */
  primaryCategory: string;
  /** All categories the paper was filed under. */
  categories: string[];
  /** arxiv abstract page — canonical link for the row. */
  abstractUrl: string;
};

export type ResearchResult = {
  ok: boolean;
  papers: ArxivPaper[];
  generatedAt: string;
  /** True when we served stale/fallback data because arxiv failed. */
  stale?: boolean;
  error?: string;
};

const ARXIV_URL =
  "https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG&sortBy=submittedDate&sortOrder=descending&start=0&max_results=20";

export async function fetchRecentPapers(): Promise<ResearchResult> {
  const generatedAt = new Date().toISOString();
  try {
    const res = await fetch(ARXIV_URL, {
      headers: { Accept: "application/atom+xml" },
      next: { revalidate: 60 * 30, tags: ["arxiv-papers"] },
    });
    if (!res.ok) {
      return {
        ok: false,
        papers: [],
        generatedAt,
        stale: true,
        error: `arxiv /api/query returned ${res.status}`,
      };
    }
    const xml = await res.text();
    const papers = parseAtomFeed(xml).slice(0, 20);
    if (papers.length === 0) {
      return {
        ok: false,
        papers: [],
        generatedAt,
        stale: true,
        error: "arxiv returned zero entries — feed shape may have drifted",
      };
    }
    return { ok: true, papers, generatedAt };
  } catch (err) {
    return {
      ok: false,
      papers: [],
      generatedAt,
      stale: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// --------------------------------------------------------------------------
// Atom parser — minimal, shape-specific. We split the feed body on </entry>
// and extract named tags. Two reasons over an XML library:
//   1. Zero dependencies. The feed has no attributes we care about beyond
//      the ones on <link> and <category>, and those are regex-trivial.
//   2. Deterministic failure: if a tag is missing, the field is empty
//      rather than a thrown exception. Aligns with the trust contract
//      ("missing data means blank, not synthesised").
// --------------------------------------------------------------------------

function parseAtomFeed(xml: string): ArxivPaper[] {
  const entries: ArxivPaper[] = [];
  const blocks = xml.split(/<entry>/).slice(1);
  for (const raw of blocks) {
    const body = raw.split(/<\/entry>/)[0] ?? "";
    const entry = parseEntry(body);
    if (entry) entries.push(entry);
  }
  return entries;
}

function parseEntry(body: string): ArxivPaper | null {
  const idUrl = textTag(body, "id");
  if (!idUrl) return null;
  const id = idUrl.replace(/^https?:\/\/arxiv\.org\/abs\//, "").trim();
  const title = collapseWs(textTag(body, "title") ?? "");
  const published = textTag(body, "published") ?? "";
  const updated = textTag(body, "updated") ?? "";

  const authors: string[] = [];
  const authorBlocks = body.split(/<author>/).slice(1);
  for (const ab of authorBlocks) {
    const inner = ab.split(/<\/author>/)[0] ?? "";
    const name = collapseWs(textTag(inner, "name") ?? "");
    if (name) authors.push(name);
  }

  const categories = new Set<string>();
  const catRegex = /<category[^>]*term="([^"]+)"/g;
  let catMatch: RegExpExecArray | null;
  while ((catMatch = catRegex.exec(body)) !== null) {
    categories.add(catMatch[1]);
  }
  const primaryMatch = /<arxiv:primary_category[^>]*term="([^"]+)"/.exec(body);
  const primaryCategory =
    primaryMatch?.[1] ?? Array.from(categories)[0] ?? "cs.AI";

  // <link rel="alternate" type="text/html" href="..."/> is the abstract URL.
  let abstractUrl = "";
  const linkRegex = /<link[^>]*\/>/g;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRegex.exec(body)) !== null) {
    const tag = linkMatch[0];
    if (/rel="alternate"/.test(tag)) {
      const hrefMatch = /href="([^"]+)"/.exec(tag);
      if (hrefMatch) {
        abstractUrl = hrefMatch[1];
        break;
      }
    }
  }
  if (!abstractUrl) {
    abstractUrl = `https://arxiv.org/abs/${id}`;
  }

  return {
    id,
    title,
    authors,
    published,
    updated,
    primaryCategory,
    categories: Array.from(categories),
    abstractUrl,
  };
}

function textTag(body: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const m = re.exec(body);
  if (!m) return undefined;
  return decodeEntities(m[1]).trim();
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}
