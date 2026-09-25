/**
 * gawk.dev — a new release's model card, first paragraph (registry: hf-model-card)
 *
 * The publisher's own description of a model, as the first prose paragraph of its README:
 * front-matter, headings, images, badges, HTML, tables, quotes and code are skipped;
 * markdown links and emphasis are reduced to their text. Quoted on a NEW_RELEASE card as
 * the source's own words — never rewritten, never generated.
 */

import { HF_MODEL_CARD } from "@/lib/data-sources";

/** Stored with the model (last-known cache); the card cuts it at a sentence boundary. */
export const MODEL_CARD_PARAGRAPH_MAX_CHARS = 1000;
/** New releases per feed build whose card is read. The gate lets through a handful a day. */
export const MODEL_CARD_FETCH_CAP = 10;

const FETCH_TIMEOUT_MS = 5_000;
const REVALIDATE_SECONDS = 24 * 60 * 60;
const SKIP_PREFIXES = ["#", "<", "![", "[![", "|", ">", "="];

/** The first paragraph of prose in a README, markdown reduced to text; undefined when there is none. */
export function firstProseParagraph(markdown: string): string | undefined {
  let text = markdown.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  // Fenced code blocks can contain blank lines; drop them whole before splitting.
  text = text.replace(/```[\s\S]*?```/g, "\n\n").replace(/~~~[\s\S]*?~~~/g, "\n\n");
  for (const block of text.split(/\r?\n\s*\r?\n/)) {
    const para = block.trim();
    if (!para) continue;
    if (SKIP_PREFIXES.some((p) => para.startsWith(p))) continue;
    if (/^(\d+\.|[-*+])\s/.test(para)) continue; // list items
    const plain = para
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/(\*\*|__)(.+?)\1/g, "$2")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    if (plain.length >= 20 && /[a-z]/i.test(plain)) return plain.slice(0, MODEL_CARD_PARAGRAPH_MAX_CHARS);
  }
  return undefined;
}

/** The card's first paragraph for one model. Never throws: no card, no paragraph. */
export async function fetchModelCardParagraph(
  modelId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  const url = HF_MODEL_CARD.apiUrl!.replace("{id}", modelId);
  try {
    const res = await fetchImpl(url, {
      next: { revalidate: REVALIDATE_SECONDS, tags: [HF_MODEL_CARD.id] },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    } as RequestInit);
    if (!res.ok) return undefined;
    return firstProseParagraph(await res.text());
  } catch {
    return undefined;
  }
}
