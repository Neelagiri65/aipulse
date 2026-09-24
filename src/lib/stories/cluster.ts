/**
 * gawk.dev — story clustering (slice A of the Story feed plan, 2026-09-24). Pure and deterministic:
 * the same items in any order give the same stories with the same ids. No model, no network.
 *
 * Two items are one story when they are within WINDOW_HOURS of each other and either
 *  - point at the same article (canonical URL, tracking parameters removed), or
 *  - share at least one NAME (a capitalised or digit-bearing word: "Opus", "GPT-6", "Medicare") and
 *    the words they share are rare enough: the sum of their inverse document frequencies over the
 *    corpus (the trailing window of all article-shaped items) reaches MIN_SCORE — and
 *  - they are not two articles of the same publisher. A publisher writes one article per story; two
 *    of its items together were its adverts, a multi-part series, or a round-up beside its own article.
 *    Hacker News and Reddit are exempt: many people post there, and a repost is the same story.
 * Stories are the connected components of those links.
 *
 * Measured on the hand-labelled golden set (231 real items, 18–24 Sep, labelled before this code):
 * 55/79 true pairs found, 3 false pairs, 11 of 12 named near-misses kept apart. The one it merges —
 * two different GPT-6 Astra stories posted to Hacker News the same day — shares only the product's
 * name, which no word-matching rule can tell apart. German↔English pairs that share only one name
 * ("Gemini … drei Firmen" / "Gemini … 3 Companies") are missed rather than guessed.
 */

export type ArticleItem = {
  id: string;
  source: "rss" | "hn" | "reddit" | "producthunt";
  publisher: string;
  lang: string;
  country?: string | null;
  title: string;
  url: string;
  /** ISO time the item was published / posted. */
  ts: string;
  points?: number;
};

export type Story = {
  /** Stable: derived from the earliest member's canonical URL. */
  id: string;
  memberIds: string[];
  /** The earliest publisher article, else the earliest item. The headline shown is the lead's, unedited. */
  leadId: string;
  firstSeen: string;
};

export const WINDOW_HOURS = 48;
export const MIN_SCORE = 9;

const AGGREGATORS = new Set<ArticleItem["source"]>(["hn", "reddit"]);

const TRACKING = /^(utm_|wt_|fbclid$|gclid$|ref$|source$|cmpid$|mc_)/i;

export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const kept = [...u.searchParams].filter(([k]) => !TRACKING.test(k));
    const query = kept.length ? `?${new URLSearchParams(kept).toString()}` : "";
    return `${u.protocol}//${host}${u.pathname.replace(/\/+$/, "")}${query}`;
  } catch {
    return url;
  }
}

// Function words, announcement verbs and site furniture, English and German. They are not names even
// when a headline capitalises them.
const STOP = new Set(
  `a an the and or of for with in on to from by at as is are be it its this that these those your you we
   our my i how why what who when where new show hn ai ki llm llms api releases release released launches
   launch launched introduces introduce update updates says say said vs via into over after before than more
   most und der die das den dem des für mit von im zu ein eine einer eines auf aus bei nach über vor wie was
   wer wird werden ist sind nicht noch auch nur heise heise-angebot heise+ ainews`.split(/\s+/),
);

const WORD = /[\p{L}\p{N}]+(?:[.\-'’][\p{L}\p{N}]+)*/gu;

type Token = { word: string; name: boolean };

function tokens(title: string): Token[] {
  const out: Token[] = [];
  for (const raw of title.match(WORD) ?? []) {
    const w = raw.replace(/['’]s$/u, "");
    // "GPT-6", "Qwen-Image-2.1" stay whole (the digits make them one model); "OpenAI-Agent" splits.
    const parts = /\d/.test(w) || !w.includes("-") ? [w] : w.split("-");
    for (const p of parts) {
      const word = p.toLowerCase();
      if (word.length < 2 || STOP.has(word)) continue;
      out.push({ word, name: /[\p{Lu}\p{N}]/u.test(p) });
    }
  }
  return out;
}

/** The capitalised or digit-bearing words of a headline, lowercased, stop words removed. */
export function nameTokens(title: string): string[] {
  return [...new Set(tokens(title).filter((t) => t.name).map((t) => t.word))];
}

function fnv1a(s: string): string {
  // Deterministic, dependency-free 64-bit-ish id (two 32-bit FNV-1a passes), hex.
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export function clusterStories(
  items: readonly ArticleItem[],
  opts: { corpus?: readonly ArticleItem[]; windowHours?: number; minScore?: number } = {},
): Story[] {
  const windowMs = (opts.windowHours ?? WINDOW_HOURS) * 3_600_000;
  const minScore = opts.minScore ?? MIN_SCORE;
  // Order-independent: work on a sorted copy.
  const list = [...items].sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id));
  const n = list.length;

  const toks = list.map((i) => tokens(i.title));
  const names = toks.map((t) => new Set(t.filter((x) => x.name).map((x) => x.word)));
  const words = toks.map((t) => new Set(t.map((x) => x.word)));
  const canon = list.map((i) => canonicalUrl(i.url));
  const ms = list.map((i) => Date.parse(i.ts));

  // Document frequency over the corpus (the trailing window), plus the items themselves.
  const docs = new Map<string, Set<string>>();
  for (const i of [...(opts.corpus ?? []), ...list]) {
    if (docs.has(i.id)) continue;
    docs.set(i.id, new Set(tokens(i.title).map((t) => t.word)));
  }
  const df = new Map<string, number>();
  for (const set of docs.values()) for (const w of set) df.set(w, (df.get(w) ?? 0) + 1);
  const total = docs.size;
  const idf = (w: string) => Math.log(total / (df.get(w) ?? 1));

  const parent = list.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++) {
      if (ms[b] - ms[a] > windowMs) break; // sorted by time: nothing later is closer
      if (canon[a] === canon[b]) { union(a, b); continue; }
      const A = list[a], B = list[b];
      if (!AGGREGATORS.has(A.source) && A.source === B.source && A.publisher === B.publisher) continue;
      let anchored = false;
      for (const w of names[a]) if (names[b].has(w)) { anchored = true; break; }
      if (!anchored) continue;
      let score = 0;
      for (const w of words[a]) if (words[b].has(w)) score += idf(w);
      if (score >= minScore) union(a, b);
    }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(i); else groups.set(r, [i]);
  }
  const stories: Story[] = [];
  for (const members of groups.values()) {
    const first = members[0]; // list is time-sorted, so the lowest index is the earliest
    const lead = members.find((m) => list[m].source === "rss") ?? first;
    stories.push({
      id: fnv1a(canon[first]),
      memberIds: members.map((m) => list[m].id),
      leadId: list[lead].id,
      firstSeen: list[first].ts,
    });
  }
  return stories.sort((a, b) => a.firstSeen.localeCompare(b.firstSeen) || a.id.localeCompare(b.id));
}
