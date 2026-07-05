/**
 * Cross-day lead freshness — the gate that should have existed.
 *
 * THE INCIDENT (2026-07-05, founder-caught): the daily video led with
 * "DeepSeek V4 Flash takes/holds #1 on OpenRouter" for SIX consecutive
 * days (06-30 → 07-05). A "cross-day freshness for lead model" rule was
 * recorded as implemented but never existed in code — a prose rule
 * carried as fact, the exact S92 meta-failure class. A viewer sees a
 * channel repeating itself; "X still holds #1" is a standing state, not
 * news, and a standing state must not keep the lead slot.
 *
 * The rule, now executable: a story may LEAD at most MAX_CONSECUTIVE
 * days in a row. On the day it would exceed that, the first
 * sufficiently-different narrative is promoted to lead; the repeated
 * story stays IN the video (it is still true — trust contract), just
 * not as the lead/title. If no distinct alternative exists, the lead is
 * kept and the decision is disclosed loudly rather than silently.
 *
 * Matching is token-set Jaccard over normalised titles so wording
 * drift ("takes #1" vs "holds #1") still counts as the same story.
 */

export const LEAD_MAX_CONSECUTIVE_DAYS = 2;
const SAME_LEAD_JACCARD = 0.6;

/** Strip the "| Gawk Daily — date" suffix and reduce to a comparable
 *  token set. Tokens shorter than 2 chars are dropped (dates, "#1"'s
 *  digit) so rank numbers and punctuation don't mask sameness. */
export function leadTokens(title: string): Set<string> {
  const lead = title.split(" | ")[0] ?? title;
  return new Set(
    lead
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2),
  );
}

export function sameLead(a: string, b: string): boolean {
  const ta = leadTokens(a);
  const tb = leadTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return inter / union >= SAME_LEAD_JACCARD;
}

export type LeadRotation<T> = {
  narratives: T[];
  rotated: boolean;
  /** Human-readable decision, logged by the pipeline either way. */
  reason: string;
};

/**
 * @param narratives ranked narratives, best first (order otherwise preserved)
 * @param recentLeadTitles previous days' video titles, NEWEST FIRST
 *   (straight from upload-log; the Gawk Daily suffix is handled here)
 */
export function rotateLeadForFreshness<T extends { headline: string }>(
  narratives: T[],
  recentLeadTitles: string[],
  maxConsecutiveDays: number = LEAD_MAX_CONSECUTIVE_DAYS,
): LeadRotation<T> {
  if (narratives.length === 0) {
    return { narratives, rotated: false, reason: "no narratives" };
  }
  const lead = narratives[0];

  // How many consecutive prior days did this same story lead?
  let consecutive = 0;
  for (const title of recentLeadTitles) {
    if (sameLead(lead.headline, title)) consecutive++;
    else break;
  }

  if (consecutive < maxConsecutiveDays) {
    return {
      narratives,
      rotated: false,
      reason: `lead fresh (led ${consecutive} prior day${consecutive === 1 ? "" : "s"}, limit ${maxConsecutiveDays})`,
    };
  }

  const altIndex = narratives.findIndex(
    (n, i) => i > 0 && !sameLead(n.headline, lead.headline),
  );
  if (altIndex === -1) {
    return {
      narratives,
      rotated: false,
      reason: `lead repeated ${consecutive} days but NO distinct alternative exists — kept, disclosed`,
    };
  }

  const rotated = [
    narratives[altIndex],
    ...narratives.filter((_, i) => i !== altIndex),
  ];
  return {
    narratives: rotated,
    rotated: true,
    reason: `lead "${lead.headline.slice(0, 60)}" led ${consecutive} consecutive days — promoted "${narratives[altIndex].headline.slice(0, 60)}"`,
  };
}
