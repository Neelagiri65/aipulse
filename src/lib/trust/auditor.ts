/**
 * Trust auditor — Layer B (PRD prd-trust-harness §3).
 *
 * Layer A tests assert the invariants on pipeline output in CI. Layer B
 * asserts the SAME invariants on the LIVE SERVED output on a schedule, and
 * pages when one breaks — catching the next incident class before the
 * founder does. It is the containment discipline extended from "is the
 * source fresh" to "is the served data TRUE".
 *
 * Pure: takes already-fetched served DTOs, returns a report. The route
 * does the I/O; this does the judging (same split as the integrity layer).
 * Every check reuses `invariants.ts` so "trustworthy" means one thing.
 *
 * These are DETERMINISTIC structural checks over served output — no
 * external re-resolution (that would be flaky and rate-limited). They
 * catch the incident CLASSES structurally: a non-durable dot served
 * (#54), a nested-host source link (#53), a stale item served as live
 * (S88), a degraded ordering masquerading as a ranking (S91).
 */

import {
  checkFresh,
  checkResolvableSource,
  type TrustViolation,
} from "@/lib/trust/invariants";

const DURABLE_EVENT_TYPES = new Set([
  "PushEvent",
  "PullRequestEvent",
  "IssuesEvent",
  "ReleaseEvent",
  "CreateEvent",
  "IssueCommentEvent",
  "PullRequestReviewEvent",
]);

export type AuditFinding = TrustViolation & { feed: string; sample: string };

export type TrustAuditReport = {
  findings: AuditFinding[];
  checked: Record<string, number>;
  ok: boolean;
};

export type GlobePointLike = {
  meta?: {
    type?: string;
    repo?: string;
    eventAt?: string;
    createdAt?: string;
  } | null;
};

export type FeedCardLike = {
  type?: string;
  sourceUrl?: string;
  timestamp?: string;
};

export type ModelUsageLike = {
  ordering?: string;
  generatedAt?: string;
  rows?: unknown[];
};

export type AuditInput = {
  now: number;
  globe?: { points: GlobePointLike[] };
  feed?: { cards: FeedCardLike[]; lastComputed?: string };
  modelUsage?: ModelUsageLike;
};

const H = 3_600_000;

/**
 * Audit the live served output. Sampling caps keep it bounded; a cap hit
 * is disclosed in `checked` (never a silent partial pass).
 */
export function auditServedOutput(input: AuditInput): TrustAuditReport {
  const findings: AuditFinding[] = [];
  const checked: Record<string, number> = {};

  // --- Map events (globe) ---
  if (input.globe) {
    const pts = input.globe.points.slice(0, 500);
    checked["globe"] = pts.length;
    for (const p of pts) {
      const m = p.meta ?? {};
      const repo = m.repo ?? "(no repo)";
      // Durable-evidence: a served non-durable type is the #54 class.
      if (m.type && !DURABLE_EVENT_TYPES.has(m.type)) {
        findings.push({
          feed: "globe",
          sample: `${repo} [${m.type}]`,
          invariant: "verifiable",
          detail: `served non-durable event type ${m.type} (removable, unverifiable)`,
        });
      }
      // Freshness: nothing older than 2× the 4h window served as live.
      const fresh = checkFresh(m.createdAt, input.now, 8 * H);
      if (fresh) findings.push({ feed: "globe", sample: repo, ...fresh });
    }
  }

  // --- Feed cards ---
  if (input.feed) {
    const cards = input.feed.cards.slice(0, 200);
    checked["feed"] = cards.length;
    // Whole-feed freshness.
    const feedFresh = checkFresh(input.feed.lastComputed, input.now, 12 * H);
    if (feedFresh) findings.push({ feed: "feed", sample: "lastComputed", ...feedFresh });
    for (const c of cards) {
      // Attribution: every card links to a resolvable, non-nested-host
      // source (the #53 class: github.com/gitlab.com/... = 404).
      const src = checkResolvableSource(c.sourceUrl);
      if (src) {
        findings.push({
          feed: "feed",
          sample: `${c.type ?? "card"} → ${c.sourceUrl ?? "(none)"}`,
          ...src,
        });
      }
    }
  }

  // --- Model usage (ordering provenance) ---
  if (input.modelUsage) {
    const mu = input.modelUsage;
    checked["model-usage"] = mu.rows?.length ?? 0;
    // A degraded ordering with rows is the S91 masked-blindness class:
    // a catalogue-fallback list served as if it were a usage ranking.
    if (mu.ordering === "catalogue-fallback" && (mu.rows?.length ?? 0) > 0) {
      findings.push({
        feed: "model-usage",
        sample: `ordering=${mu.ordering}`,
        invariant: "real",
        detail: "usage ranking served on a degraded (release-recency) ordering",
      });
    }
    const muFresh = checkFresh(mu.generatedAt, input.now, 24 * H);
    if (muFresh) findings.push({ feed: "model-usage", sample: "generatedAt", ...muFresh });
  }

  return { findings, checked, ok: findings.length === 0 };
}
