/**
 * gawk.dev — machine summaries (registry: machine-summary-nim). AUDITOR-REVIEW: PENDING.
 *
 * The one place gawk.dev asks a model to write. Used ONLY where the source published no text
 * about the content a card links to (today: Hacker News link posts). Constraint test (PRD
 * prd-story-summaries-2026-09-26, founder calls recorded there):
 *   1. Never per view — generated in the ingest cron, once per item, stored, read by the feed.
 *   2. Only where the source gave no text; never beside or instead of the source's own words.
 *   3. Labelled wherever shown ("Machine summary · <model>"), carried on its own field.
 *   4. Grounded or dropped: every number and every capitalised name in the output must appear in
 *      the article text; ≤ 2 sentences, ≤ 60 words, no quotation marks.
 *   5. Traceable: model, prompt version, input URL, input hash, generatedAt stored with the text.
 *   6. Budgeted: a daily cap and a per-run cap; over either → no summary.
 *   7. Fails closed: no key, flag off, fetch or model failure → no summary, never a placeholder.
 */

/**
 * Chosen by measurement (scripts/machine-summary-smoke.ts, 2026-09-26, 8 HN front-page articles ×
 * 10 NIM models on the founder's free key): 4 models 404 for the account, 3 overloaded or timing
 * out; of the reachable ones gpt-oss-20b had the most grounded, readable answers and the fewest
 * failures (Nemotron Super mostly 503). meta/llama-4-maverick was no longer in the catalogue.
 */
export const MACHINE_SUMMARY_MODEL = "openai/gpt-oss-20b";
export const MACHINE_SUMMARY_PROMPT_VERSION = "ms-1";
const NIM_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";
const USER_AGENT = "gawk.dev-summary/1.0 (+https://gawk.dev/sources)";
const FETCH_TIMEOUT_MS = 10_000;
/** Large models reading a 12k-char article can take longer than a small one; 45 s still fits the run budget. */
const MODEL_TIMEOUT_MS = 45_000;
/** Article text sent to the model. Enough for a news story's substance, bounded for cost. */
export const ARTICLE_MAX_CHARS = 12_000;
/** Below this the page is a paywall stub, a video, or a link hub — nothing to summarise. */
export const ARTICLE_MIN_CHARS = 400;
export const SUMMARY_MAX_WORDS = 60;
export const SUMMARY_MIN_WORDS = 8;

/**
 * Per-model request options that switch reasoning off, so the answer is the summary and not the
 * model's thinking (measured: gpt-oss spent its tokens reasoning and answered nothing; the
 * Nemotrons wrote "Here's a thinking process: …" into the answer).
 */
export function modelOptions(model: string): Record<string, unknown> {
  if (model.startsWith("openai/gpt-oss")) return { reasoning_effort: "low", max_tokens: 1024 };
  if (model.startsWith("nvidia/nemotron")) return { chat_template_kwargs: { enable_thinking: false }, max_tokens: 200 };
  return { max_tokens: 160 };
}

export type MachineSummary = {
  text: string;
  model: string;
  promptVersion: string;
  inputUrl: string;
  /** SHA-256 of the article text the model read, hex. */
  inputHash: string;
  generatedAt: string;
};

export type SummariseOutcome =
  | { ok: true; summary: MachineSummary }
  | {
      ok: false;
      reason: "fetch" | "too-short" | "model" | "ungrounded";
      /** Why, for the operator: an HTTP status and body excerpt, an error name, or the rejected
       *  answer. Never shown to readers. */
      detail?: string;
    };

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** The article's paragraphs as plain text: <p> contents outside scripts, styles, nav, header, footer. */
export function articleText(html: string): string {
  const body = html
    .replace(/<(script|style|noscript|nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const paras = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => decode(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 40);
  return paras.join("\n").slice(0, ARTICLE_MAX_CHARS);
}

/**
 * The grounding check. Rejects a summary that states a number or a capitalised name the article
 * does not contain, quotes, runs past two sentences or SUMMARY_MAX_WORDS, or is empty. Crude on
 * purpose: it cannot prove a summary faithful, but it catches the invented figure and the
 * invented name, which are the failures a reader cannot check.
 */
/**
 * Typography is not content: models and publishers write the same token with different glyphs
 * (curly vs straight apostrophes, non-breaking hyphens, thin-space thousands separators). Both
 * sides are folded the same way before comparing, so a faithful "Pentagon's" or "150 000" is not
 * dropped as invented — measured on the 2026-09-26 smoke runs.
 */
export function foldTypography(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/(\d)[\s\u00A0\u202F\u2009,](?=\d{3}\b)/g, "$1");
}

export function isGrounded(summary: string, source: string): boolean {
  const text = foldTypography(summary.trim());
  source = foldTypography(source);
  if (!text) return false;
  // A summary is at least one real sentence: a fragment ("Here") contains no invented fact and
  // would pass every other check (smoke run, 2026-09-26).
  if (text.split(/\s+/).length < SUMMARY_MIN_WORDS || !/[.!?]$/.test(text)) return false;
  if (/["“”«»]/.test(text)) return false;
  if (text.split(/\s+/).length > SUMMARY_MAX_WORDS) return false;
  if ((text.match(/[.!?](\s|$)/g) ?? []).length > 2) return false;
  const numbers = text.match(/\d[\d,.]*\d|\d/g) ?? [];
  for (const n of numbers) if (!source.includes(n)) return false;
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).slice(1); // the first word of a sentence is capitalised anyway
    for (const raw of words) {
      // Possessive "'s" is grammar, not part of the name: "Pentagon's" is grounded by "Pentagon".
      const w = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").replace(/'s$/u, "");
      if (w.length >= 2 && /^\p{Lu}/u.test(w) && !source.includes(w)) return false;
    }
  }
  return true;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SYSTEM_PROMPT =
  "You summarise news articles for a dashboard. Write at most two plain sentences saying what the " +
  "article reports. Use only facts stated in the article text. Do not add opinions, predictions, " +
  "praise or context from outside the text. Do not use quotation marks. Do not mention the article, " +
  "the author or the publication. Every number and every name you write must appear in the text.";

/** Fetches the linked article, asks the model, checks the answer. Never throws. */
export async function summariseArticle(opts: {
  url: string;
  title: string;
  apiKey: string;
  /** Defaults to MACHINE_SUMMARY_MODEL; overridden only by the model comparison script. */
  model?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): Promise<SummariseOutcome> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let text: string;
  try {
    const res = await fetchImpl(opts.url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, reason: "fetch" };
    text = articleText(await res.text());
  } catch {
    return { ok: false, reason: "fetch" };
  }
  if (text.length < ARTICLE_MIN_CHARS) return { ok: false, reason: "too-short" };

  let answer: string;
  try {
    const res = await fetchImpl(NIM_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model ?? MACHINE_SUMMARY_MODEL,
        temperature: 0.2,
        ...modelOptions(opts.model ?? MACHINE_SUMMARY_MODEL),
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Headline: ${opts.title}\n\nArticle text:\n${text}` },
        ],
      }),
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });
    if (!res.ok) {
      const excerpt = (await res.text().catch(() => "")).slice(0, 200);
      return { ok: false, reason: "model", detail: `HTTP ${res.status} ${excerpt}` };
    }
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    answer = (body.choices?.[0]?.message?.content ?? "")
      // Reasoning models may prefix their thinking; only the answer after it is the summary.
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  } catch (e) {
    return { ok: false, reason: "model", detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
  if (!isGrounded(answer, `${opts.title}\n${text}`)) return { ok: false, reason: "ungrounded", detail: answer };

  return {
    ok: true,
    summary: {
      text: answer,
      model: opts.model ?? MACHINE_SUMMARY_MODEL,
      promptVersion: MACHINE_SUMMARY_PROMPT_VERSION,
      inputUrl: opts.url,
      inputHash: await sha256Hex(text),
      generatedAt: (opts.now?.() ?? new Date()).toISOString(),
    },
  };
}
