/**
 * Content gates for the daily video pipeline — the founder's content-quality
 * rules as pure, testable functions.
 *
 * These rules previously lived as unexported functions and inline logic in
 * scripts/video/generate-daily-script.ts, outside vitest's include pattern —
 * enforced at runtime but silently regressable. Same failure class as the
 * lead-freshness incident (six identical lead titles, 06-30 → 07-05), one
 * step earlier: encoded but ungated. Extracted here so the tests can pin
 * each rule to the incident that created it.
 *
 * Rules covered:
 *  - Verifiable-metric story gate (no filler Reddit/HN noise)
 *  - Personal/complaint/anecdote filters
 *  - Leaderboard top-5 duplicate exclusion
 *  - SDK package-name dedup normalisation
 *  - Narration trimming at clause boundaries (never chop mid-thought)
 *  - Headline distillation (strip personal framing)
 */

export type StoryMetrics = {
  rank?: number;
  deltaPct?: number;
  stars?: number;
  points?: number;
  comments?: number;
  [key: string]: unknown;
};

export type GateVerdict =
  | { ok: true }
  | { ok: false; reason: "no-metric" | "personal-complaint" | "personal-project" };

/**
 * A story earns a slot only with a verifiable number behind it: a hard
 * metric (rank / deltaPct / stars), high engagement, a parseable rank
 * change in the headline, or research provenance (arXiv). Personal
 * anecdotes are rejected even with engagement unless a hard metric backs
 * them.
 */
export function storyGate(
  headline: string,
  metrics: StoryMetrics | undefined,
  source: string | undefined,
): GateVerdict {
  const m = metrics ?? {};
  const hasHardMetric = m.rank !== undefined || m.deltaPct !== undefined || m.stars !== undefined;
  const hasHighEngagement = (m.points ?? 0) >= 100 || (m.comments ?? 0) >= 50;
  const hasRankInHeadline = /\b(up|down)\s+\d+\s+ranks?\b/i.test(headline);
  const isResearch = source === "arxiv";
  if (!hasHardMetric && !hasHighEngagement && !hasRankInHeadline && !isResearch) {
    return { ok: false, reason: "no-metric" };
  }

  if (/^(Tell HN|Ask HN):/i.test(headline) && !hasHardMetric) {
    return { ok: false, reason: "personal-complaint" };
  }
  if (/^(I built|I made|I created|My |Am I )/i.test(headline) && !hasHardMetric) {
    return { ok: false, reason: "personal-project" };
  }

  return { ok: true };
}

/**
 * A model shown in the leaderboard top-5 must not also get its own
 * rank-change card — all five rows, not just #1 (the Kimi duplication).
 */
export function duplicatesLeaderboard(headline: string, leaderboardModelNames: Set<string>): boolean {
  if (leaderboardModelNames.size === 0) return false;
  const headlineLower = headline.toLowerCase();
  return [...leaderboardModelNames].some(name => headlineLower.includes(name));
}

/**
 * Normalise a package name so the same SDK can't appear twice under
 * wording drift (the HuggingFace curated-narrative vs SDK-supplement
 * duplication): lowercase, hyphens stripped.
 */
export function normalisePackageName(name: string): string {
  return name.toLowerCase().replace(/-/g, "");
}

/**
 * Fit narration inside the hold window at natural speech pace (2.5
 * words/sec) without truncating meaning: keep whole sentences when
 * possible, otherwise cut at a clause boundary and never leave a dangling
 * conjunction. "…I used to play in high." is worse than no narration.
 */
export function trimNarration(text: string, holdSec: number): string {
  const maxWords = Math.floor(holdSec * 2.5);
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;

  // Try splitting on sentence boundaries first — keep complete sentences that fit
  const sentences = text.split(/(?<=[.!?])\s+/);
  let result = "";
  for (const s of sentences) {
    const candidate = result ? `${result} ${s}` : s;
    if (candidate.split(/\s+/).length <= maxWords) {
      result = candidate;
    } else break;
  }
  if (result && result.split(/\s+/).length >= 4) {
    return result.endsWith(".") || result.endsWith("!") || result.endsWith("?") ? result : `${result}.`;
  }

  // Fallback: cut at a clause boundary (comma, dash, semicolon)
  let trimmed = words.slice(0, maxWords).join(" ");
  const clauseEnd = Math.max(trimmed.lastIndexOf(","), trimmed.lastIndexOf(" —"), trimmed.lastIndexOf(" -"), trimmed.lastIndexOf(";"));
  if (clauseEnd > trimmed.length * 0.4) {
    trimmed = trimmed.slice(0, clauseEnd);
  }
  trimmed = trimmed.replace(/\s+(and|but|or|the|a|an|in|on|at|for|of|with|from|to|is|was|that|this)$/i, "");
  if (!trimmed.endsWith(".") && !trimmed.endsWith("!") && !trimmed.endsWith("?")) trimmed += ".";
  return trimmed;
}

/** Distil verbose headlines (Reddit/HN style) into broadcast-friendly sentences. */
export function distilHeadline(headline: string): string {
  let h = headline;
  // Strip personal framing ("I built...", "I catalogued...", "Is anyone...")
  h = h.replace(/^I('ve)?\s+(built|made|created|catalogued|wrote|found|discovered|vibed)\s+(up\s+)?/i, (_, _ve, verb) => {
    const past: Record<string, string> = {
      built: "New tool:", made: "New tool:", created: "New tool:", vibed: "Recreation:",
      catalogued: "Study:", wrote: "New:", found: "Finding:", discovered: "Discovery:",
    };
    return past[verb.toLowerCase()] + " ";
  });
  h = h.replace(/^Is\s+Anyone\s+/i, "Community asks: ");
  // Strip trailing commentary after comma/dash ("here's what I found", "it's been fun")
  h = h.replace(/[,\s]+here'?s?\s+what.*$/i, ".");
  h = h.replace(/[,\s]+and\s+(?:here|it).*$/i, ".");
  // Strip personal relative clauses
  h = h.replace(/\s+I\s+used\s+to\s+.*$/i, ".");
  h = h.replace(/\s+\d+\s+years?\s+ago$/i, ".");
  if (!h.endsWith(".") && !h.endsWith("!") && !h.endsWith("?")) h += ".";
  return h;
}
