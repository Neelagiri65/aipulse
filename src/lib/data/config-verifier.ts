/**
 * Content verifier — answers "does this candidate file look like a real
 * AI-tool config, or is it an empty stub / template / binary noise?"
 *
 * Pipeline:
 *   1. Fetch the file via GitHub Contents API (authenticated, default
 *      branch, works for repos whose default ref is `main` OR `master`
 *      without needing to know which).
 *   2. Base64-decode up to the first 500 bytes of the body. We never
 *      look beyond the first 500 bytes — that's enough signal to tell
 *      a real config from a stub, and it caps memory + transfer cost.
 *   3. Run deterministic pattern heuristics to score config-shape.
 *      No LLM. Per project non-negotiable: "deterministic AI config
 *      detection only".
 *
 * Scoring bands (markdown/text kinds — CLAUDE.md, AGENTS.md,
 * .cursorrules, .windsurfrules, copilot-instructions):
 *   +0.20 non-whitespace bytes ≥ 50
 *   +0.20 has a markdown header (^#+\s+\S)
 *   +0.30 contains at least one instruction verb ("you are", "don't",
 *         "when", "use", etc.)
 *   +0.20 has a role/context label ("role:", "instructions:", etc.)
 *   +0.10 references code concepts (backticks, function/class/file)
 *   Max 1.0. Verified threshold: ≥ 0.40.
 *
 * JSON kind (.continue/config.json):
 *   Passes if it parses as JSON with at least one expected key
 *   (models/rules/customCommands/contextProviders). A valid prefix of
 *   truncated JSON (starts with `{` and mentions one of the expected
 *   keys as a string literal) counts as a weaker pass.
 *
 * Disqualifiers (hard reject, score = 0):
 *   - Too short (<30 non-whitespace bytes).
 *   - Binary-looking (>10 non-printable bytes in first 500).
 *   - Template stubs ("lorem ipsum", "TODO: write your rules here",
 *     "[your instructions here]", HTML insert comments).
 *
 * Graceful failure: network / 404 / rate-limit errors return
 * verified=false with a clear `reason`. The discovery pipeline never
 * crashes because one candidate couldn't be fetched.
 */

import type { ConfigKind } from "./repo-registry";

const VERIFY_BYTE_LIMIT = 500;

export type VerifyResult = {
  /** Whether the file passed verification (score >= 0.4). */
  verified: boolean;
  /** 0..1 rounded to 2dp. */
  score: number;
  /**
   * UTF-8 first-500-bytes quote of the fetched file. Kept for transparency
   * downstream (/archives, /sources pages can show "this is the text that
   * made us count it"). Empty string when fetch failed.
   */
  sample: string;
  /** One-line explanation of the verdict. Used in logs and /audit. */
  reason: string;
};

type ContentsResponse = {
  type?: string;
  size?: number;
  encoding?: string;
  content?: string;
  message?: string;
};

/**
 * Fetch + verify. Returns structured result regardless of success —
 * callers just check `verified`.
 */
export async function verifyConfigFile(
  owner: string,
  repo: string,
  path: string,
  kind: ConfigKind,
): Promise<VerifyResult> {
  const token = process.env.GH_TOKEN;
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let json: ContentsResponse;
  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (res.status === 404) {
      return { verified: false, score: 0, sample: "", reason: "404 not found" };
    }
    if (!res.ok) {
      return {
        verified: false,
        score: 0,
        sample: "",
        reason: `http ${res.status}`,
      };
    }
    json = (await res.json()) as ContentsResponse;
  } catch (err) {
    return {
      verified: false,
      score: 0,
      sample: "",
      reason: `fetch error: ${(err as Error).message}`,
    };
  }

  if (json.type !== "file") {
    return {
      verified: false,
      score: 0,
      sample: "",
      reason: `not a file (${json.type ?? "unknown"})`,
    };
  }

  const text = decodePrefix(json.content ?? "", json.encoding ?? "");
  if (!text) {
    return {
      verified: false,
      score: 0,
      sample: "",
      reason: "empty or undecodable body",
    };
  }

  return scoreContent(text, kind);
}

/**
 * Pure scorer — exported for unit testing and for offline rescoring of
 * existing registry samples if the heuristics ever change.
 */
export function scoreContent(text: string, kind: ConfigKind): VerifyResult {
  const capped = text.slice(0, VERIFY_BYTE_LIMIT);
  const trimmed = capped.trim();
  const nonWs = trimmed.replace(/\s/g, "").length;

  if (nonWs < 30) {
    return { verified: false, score: 0, sample: capped, reason: "too short" };
  }
  if (isLikelyBinary(capped)) {
    return {
      verified: false,
      score: 0,
      sample: "",
      reason: "binary content",
    };
  }
  if (isTemplateStub(trimmed)) {
    return {
      verified: false,
      score: 0,
      sample: capped,
      reason: "template stub",
    };
  }

  if (kind === "continue-config") {
    return scoreJson(trimmed, capped);
  }

  return scoreMarkdownLike(trimmed, capped, nonWs);
}

function scoreMarkdownLike(
  trimmed: string,
  original: string,
  nonWs: number,
): VerifyResult {
  const lower = trimmed.toLowerCase();
  let score = 0;

  if (nonWs >= 50) score += 0.2;
  if (/^#+\s+\S/m.test(trimmed)) score += 0.2;

  const verbs = [
    "you are",
    "do not",
    "don't",
    "never",
    "always",
    "when ",
    "if ",
    "use ",
    "prefer",
    "avoid",
    "respond",
    "treat",
    "assistant",
    "should",
    "must ",
  ];
  if (verbs.some((v) => lower.includes(v))) score += 0.3;

  if (
    /(^|\n)\s*(role|context|instructions?|rules|guidelines|tone|style|behaviour|behavior)\s*:/i.test(
      trimmed,
    )
  ) {
    score += 0.2;
  }

  if (/`[^`]+`|\bfunction\b|\bclass\b|\bfile\b|\brepo(?:sitory)?\b/i.test(trimmed)) {
    score += 0.1;
  }

  score = Math.min(1, score);
  const verified = score >= 0.4;
  return {
    verified,
    score: round2(score),
    sample: original,
    reason: verified ? "config-shaped" : "shape signals insufficient",
  };
}

function scoreJson(trimmed: string, original: string): VerifyResult {
  const expectedKeys = [
    "models",
    "model",
    "rules",
    "customcommands",
    "contextproviders",
    "slashcommands",
    "systemmessage",
  ];
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const keys = Object.keys(parsed).map((k) => k.toLowerCase());
      if (keys.some((k) => expectedKeys.includes(k))) {
        return {
          verified: true,
          score: 0.8,
          sample: original,
          reason: "valid continue config",
        };
      }
      return {
        verified: false,
        score: 0.2,
        sample: original,
        reason: "json lacks continue keys",
      };
    }
  } catch {
    // fall through to prefix check — our 500-byte slice may have truncated valid JSON
  }
  if (
    trimmed.startsWith("{") &&
    expectedKeys.some((k) => new RegExp(`"${k}"`, "i").test(trimmed))
  ) {
    return {
      verified: true,
      score: 0.6,
      sample: original,
      reason: "continue-shaped json prefix",
    };
  }
  return {
    verified: false,
    score: 0,
    sample: original,
    reason: "not continue config",
  };
}

function isLikelyBinary(text: string): boolean {
  let nonPrintable = 0;
  const len = Math.min(text.length, VERIFY_BYTE_LIMIT);
  for (let i = 0; i < len; i++) {
    const c = text.charCodeAt(i);
    // Allow \t (9), \n (10), \r (13). Reject other C0 controls.
    if (c < 9 || (c > 13 && c < 32) || c === 127) nonPrintable++;
  }
  return nonPrintable > 10;
}

function isTemplateStub(text: string): boolean {
  if (/lorem ipsum/i.test(text)) return true;
  if (/todo\s*:\s*(write|add|fill|insert|replace)\b/i.test(text)) return true;
  if (/<!--\s*(insert|todo|replace|your)/i.test(text)) return true;
  if (/\[\s*your\s+(rules|instructions?|prompt|config)\s+here\s*\]/i.test(text)) {
    return true;
  }
  // "# My Project\n\nTODO" style empty stubs.
  if (/^#\s+[^\n]{1,40}\n{1,3}\s*$/.test(text)) return true;
  return false;
}

function decodePrefix(content: string, encoding: string): string {
  if (!content) return "";
  if (encoding === "base64") {
    // The Contents API wraps base64 at 60 chars with \n — strip those.
    const compact = content.replace(/\s+/g, "");
    // Take just enough base64 to cover 500 decoded bytes (500 * 4 / 3 ≈ 667).
    const prefix = compact.slice(0, 700);
    try {
      // Buffer is available in Node runtime (our API routes use runtime="nodejs").
      return Buffer.from(prefix, "base64").toString("utf-8").slice(0, VERIFY_BYTE_LIMIT);
    } catch {
      return "";
    }
  }
  if (encoding === "none" || !encoding) {
    // Contents API returns empty `content` + `encoding: "none"` for files
    // >1MB. That's not plausible for an AI config, but handle it by
    // bailing — caller records "file too large" via `reason`.
    return "";
  }
  // Unknown encoding — treat as raw text (shouldn't happen per API docs).
  return content.slice(0, VERIFY_BYTE_LIMIT);
}

function encodePath(path: string): string {
  // Path segments need encodeURIComponent, but slashes stay as-is so
  // nested paths (.github/copilot-instructions.md) resolve correctly.
  return path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
