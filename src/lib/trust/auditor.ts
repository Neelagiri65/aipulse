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

import { RESEARCH_MAX_AGE_MS } from "@/lib/feed/derivers/research";
import { FEED_TRIGGERS } from "@/lib/feed/thresholds";
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

/** The whole-feed lastComputed budget — a served feed may legitimately be
 *  this far behind its compose run before Layer B calls it stale. */
const FEED_STALENESS_BUDGET_MS = 12 * H;

/**
 * Per-card freshness ceilings, keyed by CardType. Each is derived from the
 * SAME deriver-declared compose window (no parallel truth), plus the feed
 * staleness budget, doubled — the globe's 2× serve-side-slack convention.
 * A breach means a card is being served far outside anything its deriver
 * could have legitimately produced (a deriver regression or frozen-compose
 * class), not a marginal drift.
 *
 * Deliberately ABSENT (a missing type is skipped, never defaulted):
 * - PRODUCT_LAUNCH — a RANKING feed; multi-day entries (~6d observed) are
 *   its semantics, not staleness (see GAP-TABLE).
 * - TOOL_ALERT / MODEL_MOVER / SDK_TREND / LAB_HIGHLIGHT — no
 *   deriver-declared compose window yet; gating them here would invent
 *   one. Tracked in GAP-TABLE known residuals.
 */
const CARD_MAX_AGE_MS: Readonly<Partial<Record<string, number>>> = {
  // HN (6h) and reddit (12h) share the NEWS type — gate on the wider window.
  NEWS: 2 * (FEED_TRIGGERS.NEWS_REDDIT_WINDOW_HOURS * H + FEED_STALENESS_BUDGET_MS),
  NEW_RELEASE: 2 * (FEED_TRIGGERS.NEW_RELEASE_AGE_HOURS * H + FEED_STALENESS_BUDGET_MS),
  RESEARCH: 2 * (RESEARCH_MAX_AGE_MS + FEED_STALENESS_BUDGET_MS),
};

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
    const feedFresh = checkFresh(input.feed.lastComputed, input.now, FEED_STALENESS_BUDGET_MS);
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
      // Per-card freshness, only for types with a deriver-declared window
      // (the frozen-ingest / deriver-regression class Layer A gates at
      // source — this re-asserts it on the SERVED output).
      const maxAge = c.type ? CARD_MAX_AGE_MS[c.type] : undefined;
      if (maxAge !== undefined) {
        const cardFresh = checkFresh(c.timestamp, input.now, maxAge);
        if (cardFresh) {
          findings.push({
            feed: "feed",
            sample: `${c.type} @ ${c.timestamp ?? "(no timestamp)"}`,
            ...cardFresh,
          });
        }
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
