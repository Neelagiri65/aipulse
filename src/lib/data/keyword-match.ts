/**
 * Deterministic keyword matching on WORDS, not substrings.
 *
 * Substring matching let "rag" match "Snapdragon" and " ai" match "AirPods", so phone launches
 * reached the AI Feed (found 2026-09-24 on live Heise titles). A title is split into word tokens
 * (letters and digits, any script); a keyword matches when:
 *   - short keywords (< 5 letters: ai, ki, rag, llm, gpt, mcp …) equal a whole token, or its plural;
 *   - longer keywords may also match the START of a token — "agent" → "Agenten",
 *     "chatbot" → "Chatbots", "embedding" → "embeddings" — German compounds and plurals;
 *   - phrases ("machine learning", "fine-tun") match consecutive tokens, the last one by prefix.
 * No inference, no model: the same list, applied honestly.
 */
export function titleTokens(title: string): string[] {
  return title.normalize("NFKC").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function tokenMatches(token: string, kw: string, allowPrefix: boolean): boolean {
  if (token === kw || token === `${kw}s` || token === `${kw}es`) return true;
  return allowPrefix && token.startsWith(kw);
}

export function matchesKeyword(tokens: readonly string[], keyword: string): boolean {
  const parts = titleTokens(keyword);
  if (parts.length === 0) return false;
  if (parts.length === 1) {
    const k = parts[0];
    return tokens.some((t) => tokenMatches(t, k, k.length >= 5));
  }
  for (let i = 0; i + parts.length <= tokens.length; i++) {
    let ok = true;
    for (let j = 0; j < parts.length && ok; j++) {
      const last = j === parts.length - 1;
      ok = tokenMatches(tokens[i + j], parts[j], last);
    }
    if (ok) return true;
  }
  return false;
}

export function titleHasKeyword(title: string, keywords: readonly string[]): boolean {
  const tokens = titleTokens(title);
  return keywords.some((k) => matchesKeyword(tokens, k));
}
