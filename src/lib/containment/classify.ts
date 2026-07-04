/**
 * Classify an IntegrityReport into a containment ProbeOutcome.
 *
 * The split is TRUST vs AVAILABILITY, not the integrity layer's severity
 * labels (docs/prd-containment-loop-v2.md D1):
 *
 *   - hard-fail (instant quarantine): the served data itself cannot be
 *     trusted — fabrication, missing provenance, unverified source, a
 *     stored DTO that no longer parses (schema drift), an undated or
 *     unreadable number, a pre-committed sanity range breached. Per
 *     data-sources.ts: out-of-range means "investigate before shipping the
 *     number" — quarantine (last-known display) IS not-shipping-it while
 *     investigating.
 *
 *   - soft-fail (SUSPECT hysteresis): the data is plausibly fine but the
 *     pipeline around it is limping — merely-old output, below-floor
 *     counts, an unreachable probe witness. A transient network blip must
 *     never instant-quarantine a healthy source, even though the integrity
 *     layer labels `reachable` failures `critical`.
 */

import type { CheckResult, IntegrityReport } from "@/lib/integrity/checks";

import type { ProbeObservation } from "./types";

type FailClass = "hard" | "soft";

/**
 * Explicit per-check classification. Any check id not listed falls back to
 * `soft` — new checks must opt IN to instant quarantine, never drift into it.
 */
const CHECK_CLASS: Record<string, FailClass> = {
  "not-fabricated": "hard",
  provenance: "hard",
  verified: "hard",
  // evaluate() turns an extractor throw into a failing "parse" check: the
  // stored DTO no longer matches its expected shape — schema drift means the
  // served data is untrustworthy, not merely late.
  parse: "hard",
  sanity: "hard",
  // Availability class.
  "non-empty": "soft",
  reachable: "soft",
};

/**
 * Freshness is the one check whose class depends on WHY it failed: an
 * undated/unparseable timestamp is a provenance-grade breach (critical),
 * while merely-old data (stale) is an availability problem.
 */
function classifyCheck(check: CheckResult): FailClass {
  if (check.name === "freshness") {
    return check.severity === "critical" ? "hard" : "soft";
  }
  return CHECK_CLASS[check.name] ?? "soft";
}

function describe(check: CheckResult): string {
  return check.detail ? `${check.name}: ${check.detail}` : check.name;
}

/**
 * Reduce one source's integrity report to a probe observation. Hard beats
 * soft; the reason is the worst failing check (first hard failure, else
 * first soft failure) so the quarantine badge says the load-bearing why.
 */
export function classifyReport(report: IntegrityReport): ProbeObservation {
  const failing = report.checks.filter((c) => !c.ok);
  if (failing.length === 0) {
    return { sourceId: report.source, outcome: "pass", reason: "" };
  }
  const hard = failing.find((c) => classifyCheck(c) === "hard");
  if (hard) {
    return {
      sourceId: report.source,
      outcome: "hard-fail",
      reason: describe(hard),
    };
  }
  return {
    sourceId: report.source,
    outcome: "soft-fail",
    reason: describe(failing[0]),
  };
}

/**
 * Wrap a probe-runner failure (the probe itself crashed, Redis was down,
 * the route timed out) as the outcome that never mutates state.
 */
export function probeErrorObservation(
  sourceId: string,
  reason: string,
): ProbeObservation {
  return { sourceId, outcome: "probe-error", reason };
}

export function classifyReports(
  reports: ReadonlyArray<IntegrityReport>,
): ProbeObservation[] {
  return reports.map(classifyReport);
}
