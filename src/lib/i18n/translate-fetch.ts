/**
 * Inline translation fetcher (S61).
 *
 * Calls Google's undocumented `translate_a/single` endpoint that the
 * Translate browser extension uses. Public, no auth, CORS-permissive
 * (`access-control-allow-origin: *`) — verified empirically on
 * 2026-05-04 against German + Chinese sample text.
 *
 * Trust contract:
 *   - This is on-CLICK, client-side only. Translation never lands in
 *     Redis, never lands in a snapshot, never feeds the ingest pipeline.
 *     The "no LLM in ingest" constraint is satisfied by construction.
 *   - The translated text MUST display a "via Google Translate"
 *     attribution at the call site so a reader doesn't think Gawk
 *     authored the translation.
 *   - On any failure (HTTP non-2xx, parse error, network drop) the
 *     caller is expected to fall back to the original text + a link
 *     to the legacy `translate.google.com/translate?u=...` redirect.
 *
 * Endpoint stability: undocumented. Google could change/kill the
 * shape without notice. The parser is defensive: any deviation from
 * the expected nested-array structure returns null, and the caller
 * surfaces the failure to the user honestly.
 */

const ENDPOINT = "https://translate.googleapis.com/translate_a/single";

export type TranslationResult = {
  /** The translated text, segments concatenated. */
  translated: string;
  /** ISO 639-1 source language detected by Google ("de", "zh-CN", etc.).
   *  Falls back to "auto" when the response doesn't carry it. */
  sourceLang: string;
};

/**
 * Pure parser over the nested-array response shape. Exposed so tests
 * can pin the shape without touching network. Returns null on any
 * deviation rather than throwing — the caller decides whether to
 * retry, fall back, or surface the failure.
 *
 * Expected shape (truncated):
 *   [[["Hello World","Hallo Welt",null,null,10]],null,"de",...]
 *   ↑ segments  ↑ first segment  ↑ source-lang at index 2
 */
export function parseTranslateResponse(
  json: unknown,
): TranslationResult | null {
  if (!Array.isArray(json) || json.length < 1) return null;
  const segments = json[0];
  if (!Array.isArray(segments)) return null;
  let translated = "";
  for (const seg of segments) {
    if (Array.isArray(seg) && typeof seg[0] === "string") {
      translated += seg[0];
    }
  }
  if (translated === "") return null;
  const sourceLang =
    json.length > 2 && typeof json[2] === "string" ? json[2] : "auto";
  return { translated, sourceLang };
}

export type TranslateOpts = {
  signal?: AbortSignal;
  /** Test seam: replace `globalThis.fetch` for unit tests. */
  fetchImpl?: typeof fetch;
  /** Test seam: override the endpoint base for resilience testing. */
  endpoint?: string;
};

/**
 * Fetch a translation. Throws on non-2xx, on network failure, and on
 * shape parse failure — the caller wraps in try/catch and renders a
 * "translation failed" UI affordance.
 */
export async function translateText(
  text: string,
  opts: TranslateOpts = {},
): Promise<TranslationResult> {
  if (!text || text.trim() === "") {
    throw new Error("translate: empty text");
  }
  const f = opts.fetchImpl ?? fetch;
  const base = opts.endpoint ?? ENDPOINT;
  const params = new URLSearchParams({
    client: "gtx",
    sl: "auto",
    tl: "en",
    dt: "t",
    q: text,
  });
  const url = `${base}?${params.toString()}`;
  const res = await f(url, { signal: opts.signal });
  if (!res.ok) {
    throw new Error(`translate: HTTP ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  const parsed = parseTranslateResponse(json);
  if (!parsed) {
    throw new Error("translate: unexpected response shape");
  }
  return parsed;
}
