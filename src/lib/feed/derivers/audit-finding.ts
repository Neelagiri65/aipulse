/**
 * Gawk — AUDIT_FINDING deriver
 *
 * Pure function over `AuditsResult`. Emits one Card per Nativerse Claims
 * Audit finding: an independent reproduction of a published model/benchmark
 * claim. The card cites the audit entry (the receipt) as its source URL.
 *
 * Severity is fixed at FEED_SEVERITIES.AUDIT_FINDING. Returns [] on a
 * failed fetch — graceful degradation, never fabricated.
 */

import { cardId } from "@/lib/feed/card-id";
import { FEED_SEVERITIES } from "@/lib/feed/thresholds";
import type { Card } from "@/lib/feed/types";
import type { AuditsResult, AuditFinding } from "@/lib/data/fetch-audits";

const STATUS_VERB: Record<string, string> = {
  holds: "reproduced",
  "beats-claim": "beat its claim",
  inflated: "did not reproduce",
  "setup-dependent": "reproduced only under the authors' setup",
  inconclusive: "inconclusive",
};

function headlineFor(f: AuditFinding): string {
  if (f.headline) return f.headline;
  const verb = STATUS_VERB[f.status] ?? f.status;
  if (f.claimed != null && f.measured != null) {
    return `${f.model} on ${f.benchmark}: claimed ${f.claimed}, we measured ${f.measured} (${verb})`;
  }
  return `${f.model} on ${f.benchmark}: ${verb}`;
}

export function deriveAuditFindingCards(result: AuditsResult): Card[] {
  if (!result.ok) return [];
  const cards: Card[] = [];
  for (const f of result.findings) {
    if (!f || !f.id || !f.reportUrl) continue;
    const ts = new Date(f.date).getTime();
    const tsMs = Number.isNaN(ts) ? 0 : ts;
    cards.push({
      id: cardId("AUDIT_FINDING", `audit:${f.id}`, tsMs),
      type: "AUDIT_FINDING",
      severity: FEED_SEVERITIES.AUDIT_FINDING,
      headline: headlineFor(f),
      detail: f.status
        ? `Independent reproduction · ${STATUS_VERB[f.status] ?? f.status}`
        : undefined,
      sourceName: "Nativerse Claims Audit",
      sourceUrl: f.reportUrl,
      timestamp: tsMs ? new Date(tsMs).toISOString() : result.generatedAt,
      meta: {
        status: f.status ?? "",
        model: f.model ?? "",
        benchmark: f.benchmark ?? "",
        claimed: f.claimed == null ? "" : f.claimed,
        measured: f.measured == null ? "" : f.measured,
      },
    });
  }
  return cards;
}
