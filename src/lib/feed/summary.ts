/**
 * The source's own words for a card (`Card.summary`): a publisher's RSS description, an arXiv
 * abstract, a Product Hunt description — cleaned to plain text and cut at a sentence. Never written,
 * paraphrased or summarised by gawk.dev: every word shown is the source's, in the source's order.
 *
 * Cleaning is mechanical: markup removed (HTML tags; markdown links keep their text, emphasis marks go), entities decoded, whitespace collapsed, the WordPress
 * "The post … appeared first on …" footer dropped. Cutting keeps whole sentences up to `maxChars`;
 * a trailing fragment the source itself cut off ("…" mid-sentence, as MIT Technology Review's feed
 * does) is dropped rather than shown as if complete. Returns undefined when nothing is left, or
 * when the text only repeats the headline — a summary that adds nothing is not shown.
 */
export function toSummary(raw: string | null | undefined, headline = "", maxChars = 300): string | undefined {
  if (!raw) return undefined;
  let s = raw
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s)
    // Markdown, as OpenRouter writes its model descriptions: a link keeps its text, emphasis marks go.
    .replace(/!?\[([^\]]*)\]\([^)\s]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/\s*The post .{1,300}? appeared first on .{1,120}?\.?$/i, "").trim();
  // WordPress marks its excerpt cut with "[…]" or "[...]": the same as the source's own "…".
  s = s.replace(/\s*\[(?:…|\.\.\.)\]$/, "…");
  if (!s) return undefined;

  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  if (headline && norm(s) === norm(headline)) return undefined;

  // A sentence ends at . ! ? or … followed by a space — never inside "GLiNER2.5" or "e.g.x".
  const sentences = s.split(/(?<=[.!?…]["'”’)\]]*)\s+/u);
  let out = "";
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    // The source's own cut ("that’s…") is not a sentence.
    if (sentence.endsWith("…") || sentence.endsWith("...")) break;
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > maxChars) break;
    out = next;
  }
  if (!out) {
    // One sentence longer than the cap: cut at a word, and say it was cut.
    const cut = s.slice(0, maxChars).replace(/\s+\S*$/, "").replace(/[\s,;:–—-]+$/, "");
    out = cut ? `${cut}…` : "";
  }
  return out || undefined;
}

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}
