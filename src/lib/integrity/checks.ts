/**
 * Integrity layer — gawk's nervous system (Layer 1: the pure core).
 *
 * Verifies that displayed data is GENUINE and ACCURATE by enforcing the
 * contract gawk already promises elsewhere in the codebase:
 *   - `data-sources.ts`  — every source has `verifiedAt` ("" = do not
 *     consume) and a pre-committed `sanityCheck {expectedMin,expectedMax}`.
 *   - `cron-health.ts`   — each pipeline has a declared cadence
 *     (`expectedIntervalMinutes`) that defines what "fresh" means.
 *   - Non-negotiables (CLAUDE.md) — every number traces to a public
 *     source; no synthetic/simulated data; degradation is honest
 *     (last-known + timestamp), never fabricated.
 *
 * Design principles:
 *   1. Operates on OBSERVED OUTPUT, never on a producer's self-reported
 *      exit code — a job that lies green cannot fool it. This is the
 *      whole point: green ≠ delivered, so we check the delivered data.
 *   2. Deterministic. No LLM, no inference (non-negotiable). Every verdict
 *      is a pure function of the data plus the pre-committed contract, so
 *      the entire layer is unit-testable with zero I/O.
 *   3. Reuses the existing source of truth. It reads the same sanity
 *      ranges / verifiedAt / intervals the dashboard already trusts — it
 *      does not invent a parallel definition of "correct".
 *
 * This file is the pure core. The live probe runner (Layer 2, hits the
 * public API routes) and alert routing (Layer 3) are thin I/O wrappers
 * that call these functions — all branching logic lives here, under test.
 */

/** Severity of a failing check. Drives verdict aggregation and, later,
 *  whether Layer 3 pages a channel. `info` is only used on passing checks. */
export type Severity = "critical" | "stale" | "warn" | "info";

/** A single source's overall standing after all its checks run. */
export type IntegrityVerdict = "OK" | "DEGRADED" | "STALE" | "FAIL";

export type CheckResult = {
  /** Stable check id, e.g. "provenance", "freshness", "sanity". */
  name: string;
  ok: boolean;
  /** When ok=false, the verdict tier this failure contributes. Ignored
   *  when ok=true (a passing check never worsens the verdict). */
  severity: Severity;
  detail?: string;
};

export type IntegrityReport = {
  /** data-source id or feature id being verified. */
  source: string;
  checks: CheckResult[];
  verdict: IntegrityVerdict;
  /** ISO timestamp of when the probe observed the output. */
  observedAt: string;
};

// ---------------------------------------------------------------------------
// Pure invariant checkers. Each is total (never throws) and returns a
// CheckResult. A missing precondition (no value, no timestamp) is itself a
// failure, not an exception — the nervous system must never crash on bad data.
// ---------------------------------------------------------------------------

/**
 * A source must be manually verified before the dashboard consumes it.
 * Mirrors the data-sources.ts rule verbatim: empty `verifiedAt` = not
 * verified = must not ship. Consuming an unverified source is a contract
 * breach, hence `critical`.
 */
export function checkVerified(source: { verifiedAt: string }): CheckResult {
  const ok =
    typeof source.verifiedAt === "string" && source.verifiedAt.trim() !== "";
  return ok
    ? { name: "verified", ok: true, severity: "info" }
    : {
        name: "verified",
        ok: false,
        severity: "critical",
        detail: "source has no verifiedAt — must not be consumed",
      };
}

/**
 * Every displayed record must carry a non-empty provenance string. A
 * number without a traceable source violates the prime non-negotiable, so
 * any missing one is `critical`. An empty record set passes here
 * (vacuously) — emptiness is `checkNonEmpty`'s job, not provenance's.
 */
export function checkProvenance(
  records: ReadonlyArray<Record<string, unknown>>,
  opts: { field?: string } = {},
): CheckResult {
  const field = opts.field ?? "source";
  const missing = records.filter((r) => {
    const v = r[field];
    return typeof v !== "string" || v.trim() === "";
  }).length;
  return missing === 0
    ? { name: "provenance", ok: true, severity: "info" }
    : {
        name: "provenance",
        ok: false,
        severity: "critical",
        detail: `${missing}/${records.length} records missing "${field}"`,
      };
}

/**
 * Output must be fresh relative to its declared cadence. A missing or
 * unparseable timestamp is `critical` (we cannot prove freshness, and an
 * undated number is itself a provenance failure); merely-old data is
 * `stale`.
 */
export function checkFreshness(args: {
  observedAt: string | null | undefined;
  now: number;
  maxAgeMinutes: number;
}): CheckResult {
  const { observedAt, now, maxAgeMinutes } = args;
  if (!observedAt) {
    return {
      name: "freshness",
      ok: false,
      severity: "critical",
      detail: "output carries no timestamp",
    };
  }
  const ts = Date.parse(observedAt);
  if (Number.isNaN(ts)) {
    return {
      name: "freshness",
      ok: false,
      severity: "critical",
      detail: `unparseable timestamp: ${observedAt}`,
    };
  }
  const ageMin = (now - ts) / 60_000;
  if (ageMin <= maxAgeMinutes) {
    return {
      name: "freshness",
      ok: true,
      severity: "info",
      detail: `${Math.round(ageMin)}m old`,
    };
  }
  return {
    name: "freshness",
    ok: false,
    severity: "stale",
    detail: `${Math.round(ageMin)}m old > ${maxAgeMinutes}m budget`,
  };
}

/**
 * Observed value must fall inside the pre-committed sanity range. A value
 * we cannot read is `critical`; an out-of-range value is `warn` (the data
 * may be real but the source needs investigating before we trust it — per
 * the data-sources.ts instruction). No declared bounds = nothing to check
 * = pass (honestly noted in detail).
 */
export function checkSanityRange(args: {
  value: number | null | undefined;
  expectedMin?: number;
  expectedMax?: number;
}): CheckResult {
  const { value, expectedMin, expectedMax } = args;
  if (value === null || value === undefined || Number.isNaN(value)) {
    return {
      name: "sanity",
      ok: false,
      severity: "critical",
      detail: "no numeric value to range-check",
    };
  }
  if (expectedMin === undefined && expectedMax === undefined) {
    return {
      name: "sanity",
      ok: true,
      severity: "info",
      detail: "no range declared",
    };
  }
  if (expectedMin !== undefined && value < expectedMin) {
    return {
      name: "sanity",
      ok: false,
      severity: "warn",
      detail: `${value} below min ${expectedMin}`,
    };
  }
  if (expectedMax !== undefined && value > expectedMax) {
    return {
      name: "sanity",
      ok: false,
      severity: "warn",
      detail: `${value} above max ${expectedMax}`,
    };
  }
  return { name: "sanity", ok: true, severity: "info", detail: `${value} in range` };
}

/**
 * Ordering provenance: is the output the REAL product, or a fallback that
 * merely looks like it? The S91 incident class: OpenRouter's endpoint moved,
 * every cron run silently flipped to catalogue-fallback (release-recency
 * order, not a usage ranking), and the blob stayed fresh + non-empty + sane
 * — every other check green while the ranking product was blind for weeks.
 * A fallback ordering is honest data honestly labelled, so this is `warn`
 * (degraded product), not `critical` (untrustworthy data).
 */
export function checkOrdering(args: {
  ordering: string | null | undefined;
  expected: readonly string[];
}): CheckResult {
  const { ordering, expected } = args;
  if (ordering && expected.includes(ordering)) {
    return { name: "ordering", ok: true, severity: "info", detail: ordering };
  }
  return {
    name: "ordering",
    ok: false,
    severity: "warn",
    detail: `ordering "${ordering ?? "missing"}" is not the real product (expected ${expected.join(" | ")})`,
  };
}

/**
 * Distinguish a legitimately quiet day from a broken-empty output. We
 * cannot prove which it is from a count alone, so below-floor without an
 * explicit quiet-day allowance is `warn` (suspicious, investigate), never
 * a hard fail — that is the honest verdict. Sources that genuinely go
 * quiet (e.g. a niche feed) pass `quietDayAllowed: true`.
 */
export function checkNonEmpty(args: {
  count: number;
  floor?: number;
  quietDayAllowed?: boolean;
}): CheckResult {
  const floor = args.floor ?? 1;
  if (args.count >= floor) {
    return {
      name: "non-empty",
      ok: true,
      severity: "info",
      detail: `${args.count} items`,
    };
  }
  if (args.quietDayAllowed) {
    return {
      name: "non-empty",
      ok: true,
      severity: "info",
      detail: "empty (quiet day allowed)",
    };
  }
  return {
    name: "non-empty",
    ok: false,
    severity: "warn",
    detail: `${args.count} below floor ${floor} — possibly broken-empty`,
  };
}

/**
 * No fabricated data. The globe non-negotiable: every dot is a real,
 * verifiable event — never synthetic or simulated. Any record flagged
 * `synthetic`/`simulated` is a hard `critical` breach.
 */
export function checkNotFabricated(
  records: ReadonlyArray<Record<string, unknown>>,
): CheckResult {
  const fabricated = records.filter(
    (r) => r.synthetic === true || r.simulated === true,
  ).length;
  return fabricated === 0
    ? { name: "not-fabricated", ok: true, severity: "info" }
    : {
        name: "not-fabricated",
        ok: false,
        severity: "critical",
        detail: `${fabricated} synthetic/simulated record(s) present`,
      };
}

// ---------------------------------------------------------------------------
// Aggregation. The verdict is the worst failing severity, mapped to a tier.
// Precedence: FAIL > STALE > DEGRADED > OK. Passing checks never count.
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 3,
  stale: 2,
  warn: 1,
  info: 0,
};

const SEVERITY_TO_VERDICT: Record<Severity, IntegrityVerdict> = {
  critical: "FAIL",
  stale: "STALE",
  warn: "DEGRADED",
  info: "OK",
};

export function deriveVerdict(
  checks: ReadonlyArray<CheckResult>,
): IntegrityVerdict {
  let worst: Severity = "info";
  for (const c of checks) {
    if (c.ok) continue;
    if (SEVERITY_RANK[c.severity] > SEVERITY_RANK[worst]) worst = c.severity;
  }
  return SEVERITY_TO_VERDICT[worst];
}

export function buildReport(args: {
  source: string;
  checks: CheckResult[];
  observedAt: string;
}): IntegrityReport {
  return {
    source: args.source,
    checks: args.checks,
    verdict: deriveVerdict(args.checks),
    observedAt: args.observedAt,
  };
}
