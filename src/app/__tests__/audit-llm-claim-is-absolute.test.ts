/**
 * The product tells the reader it calls no LLM. That claim must match the code.
 *
 * One subject: the user-visible copy that describes /audit's engine.
 *
 * Two phrasings shipped side by side. `/audit` itself said "no LLM calls"
 * (absolute); the More menu said "no LLM **by default**" (hedged). A hedge is
 * not a softer way of saying the same thing — it tells the reader an opt-in
 * LLM path exists and that their input may reach a model if they enable it.
 * On 2026-09-19 a full search of `src/` for deep-scan code returned **zero**
 * hits: every `gemini`/`deep scan` match was the word as a SUBJECT (keyword
 * allowlists, an icon map, model taxonomy), never a call. There is no opt-in
 * path. The hedge described a feature that does not exist, on the one page
 * whose entire value is that it does not think.
 *
 * So this file pins both halves, because either one alone can drift:
 *   1. No user-visible copy hedges the LLM claim.
 *   2. No LLM client is imported or called anywhere in `src/`, which is what
 *      makes the absolute claim true. If deep scan is ever built, THIS test
 *      fails first and forces the copy to be re-decided before it ships.
 *
 * Scope: `src/`, and the boundary is load-bearing rather than incidental.
 * `scripts/video/*` DOES call an LLM — `curate-stories.ts:52` and
 * `generate-script.ts:176` both POST to
 * `https://integrate.api.nvidia.com/v1/chat/completions` (NVIDIA NIM, keyed by
 * `NVIDIA_NIM_KEY`, with `GEMINI_API_KEY` as an alternative) to phrase the
 * daily video's narration. That is a build-time content pipeline, it is not
 * the dashboard, and it makes no /audit claim — so it does not falsify the
 * copy this file pins. But nothing here should be read as "gawk.dev never
 * calls an LLM": it does, in the video pipeline, and that surface needs its
 * own disclosure decision rather than silence.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.join(process.cwd(), "src");

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      out.push(...filesUnder(full));
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

/** The hedge, in the forms it could plausibly be rewritten into. */
const HEDGED_CLAIM = /no LLM\s+(?:calls?\s+)?by default|LLM\s+(?:calls?\s+)?(?:are\s+)?opt-in/i;

/**
 * An actual inference call — deliberately NOT "mentions a provider".
 *
 * gawk legitimately names these providers all over `src/`: Tool Health probes
 * `api.anthropic.com/v1/models` and `api.openai.com/v1/models` (auth-reachability
 * checks that send no prompt), and SDK Adoption tracks `"@anthropic-ai/sdk"` as a
 * package NAME in a registry list. A pattern that flags those would fail on the
 * product working as designed, so it would be deleted rather than heeded.
 *
 * What actually constitutes calling a model is either of:
 *   - importing a generative SDK (an `import ... from "@anthropic-ai/sdk"`
 *     statement — not the same string inside an array of package names), or
 *   - hitting an INFERENCE endpoint: /v1/messages, /chat/completions,
 *     :generateContent. Listing endpoints like /v1/models are not inference.
 */
const LLM_SDK_IMPORT =
  /(?:^|\s)(?:import|require)\b[^\n]*["'\`](?:@anthropic-ai\/|@google\/gen(?:erative-)?ai|openai|@mistralai\/|cohere-ai)/;
const LLM_INFERENCE_ENDPOINT =
  /\/v1\/messages\b|\/chat\/completions\b|:generateContent\b|\/v1\/complete\b/i;
const LLM_CLIENT = new RegExp(
  `${LLM_SDK_IMPORT.source}|${LLM_INFERENCE_ENDPOINT.source}`,
  "i",
);

describe("the /audit no-LLM claim", () => {
  const files = filesUnder(SRC);

  it("finds the files it is meant to guard", () => {
    // Guards against a vacuous pass if the walker ever stops finding source.
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith("components/dashboard/MoreView.tsx"))).toBe(true);
    expect(files.some((f) => f.endsWith("app/audit/page.tsx"))).toBe(true);
  });

  it("is stated absolutely everywhere — no copy hedges it with 'by default'", () => {
    const offenders = files
      .map((f) => ({ f, lines: fs.readFileSync(f, "utf8").split("\n") }))
      .flatMap(({ f, lines }) =>
        lines
          .map((line, i) => ({ line, n: i + 1 }))
          .filter(({ line }) => HEDGED_CLAIM.test(line))
          .map(({ line, n }) => `${path.relative(SRC, f)}:${n} — ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });

  it("calls no LLM anywhere in src/, which is what makes the claim true", () => {
    const callers = files
      .map((f) => ({ f, lines: fs.readFileSync(f, "utf8").split("\n") }))
      .flatMap(({ f, lines }) =>
        lines
          .map((line, i) => ({ line, n: i + 1 }))
          .filter(({ line }) => LLM_CLIENT.test(line))
          .map(({ line, n }) => `${path.relative(SRC, f)}:${n} — ${line.trim()}`),
      );
    expect(callers).toEqual([]);
  });
});
