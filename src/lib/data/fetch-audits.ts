/**
 * Gawk — Audit findings source
 *
 * Fetches Nativerse Claims Audit findings (independent reproductions of
 * published model/benchmark claims) from a public JSON endpoint. The URL
 * is supplied via AUDIT_FEED_URL so the ledger stays decoupled from the
 * engine. When unset or unreachable, returns an empty set — graceful
 * degradation, never fabricated cards (matches the rest of the feed).
 *
 * The findings JSON is either an array of AuditFinding or an object with
 * a `findings` (or `audits`) array.
 */

export type AuditFinding = {
  /** Stable id of the audit entry (the ledger claim_id). */
  id: string;
  /** holds | beats-claim | inflated | setup-dependent | inconclusive */
  status: string;
  model: string;
  benchmark: string;
  /** Published figure and our measured figure (percent). Null when not applicable. */
  claimed: number | null;
  measured: number | null;
  /** ISO date the verdict was committed. */
  date: string;
  /** Canonical public URL of the audit entry (the receipt). Mandatory for a card. */
  reportUrl: string;
  /** Optional pre-written headline; falls back to a deterministic one. */
  headline?: string;
};

export type AuditsResult = {
  ok: boolean;
  findings: AuditFinding[];
  generatedAt: string;
};

const AUDIT_FEED_URL = process.env.AUDIT_FEED_URL;

export async function fetchAuditFindings(): Promise<AuditsResult> {
  const generatedAt = new Date().toISOString();
  if (!AUDIT_FEED_URL) return { ok: true, findings: [], generatedAt };
  try {
    const r = await fetch(AUDIT_FEED_URL, { headers: { accept: "application/json" } });
    if (!r.ok) return { ok: false, findings: [], generatedAt };
    const data = await r.json();
    const findings: AuditFinding[] = Array.isArray(data)
      ? data
      : (data.findings ?? data.audits ?? []);
    return { ok: true, findings, generatedAt };
  } catch {
    return { ok: false, findings: [], generatedAt };
  }
}
