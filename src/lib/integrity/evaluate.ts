/**
 * Integrity layer — Layer 2a: the pure evaluator.
 *
 * Turns a `ProbeSpec` (how to read one source's output + its pre-committed
 * contract) plus an already-fetched raw payload into an `IntegrityReport`.
 * Pure and total: it never performs I/O and never throws — a payload it
 * cannot parse becomes a `FAIL` report, not an exception, because the
 * nervous system must survive malformed data from any source.
 *
 * The contract values (freshness budget, sanity range, verifiedAt) come
 * from the existing source of truth — `data-sources.ts` and
 * `cron-health.ts` — wired up in `specs.ts`. This file only applies them.
 */

import {
  buildReport,
  checkFreshness,
  checkNonEmpty,
  checkNotFabricated,
  checkOrdering,
  checkProvenance,
  checkSanityRange,
  checkVerified,
  type CheckResult,
  type IntegrityReport,
} from "./checks";

/** The integrity-relevant fields pulled out of a raw payload by a spec's
 *  `extract`. Everything the Layer-1 checkers need, and nothing else. */
export type Observed = {
  /** Freshness timestamp the output carries (polledAt/generatedAt/etc). */
  observedAt: string | null;
  /** The displayed records — checked for provenance and fabrication. */
  records: Array<Record<string, unknown>>;
  /** The metric to sanity-range-check. Defaults to `records.length` when
   *  omitted (the common "is the count sane" case). */
  value?: number | null;
  /** Which product/ordering this payload claims to be (e.g. OpenRouter's
   *  `ordering` field). Checked against `contract.expectedOrdering`. */
  ordering?: string | null;
};

export type ProbeContract = {
  /** Max age before the output is STALE. Typically the cron's declared
   *  interval × 2 (matching cron-health's staleness gate). */
  maxAgeMinutes: number;
  /** Pre-committed sanity bounds for `value`. Omit when no meaningful
   *  range exists for this output (don't invent one). */
  expectedMin?: number;
  expectedMax?: number;
  /** Minimum record count before "empty" is suspicious. Default 1. */
  floor?: number;
  /** This source can legitimately produce nothing on a quiet day. */
  quietDayAllowed?: boolean;
  /** Run the no-synthetic-data check on records (globe sources). */
  checkFabrication?: boolean;
  /** Backing source's verifiedAt (from data-sources.ts). Omit for pure
   *  feature probes that don't map 1:1 to a registry source. */
  verifiedAt?: string;
  /** Provenance field name on each record. Default "source". */
  provenanceField?: string;
  /** Orderings that count as the real product (e.g. ["top-weekly",
   *  "trending"]). A fallback ordering is a degraded product even when
   *  every other check passes — the S91 masked-blindness class. */
  expectedOrdering?: readonly string[];
};

export type ProbeSpec = {
  /** Matches a data-source id or feature id; used as the report source. */
  id: string;
  /** Pull the check inputs out of the raw fetched payload. May throw —
   *  evaluate() catches it and reports a critical parse failure. */
  extract: (payload: unknown) => Observed;
  contract: ProbeContract;
};

export function evaluate(
  spec: ProbeSpec,
  payload: unknown,
  now: number,
): IntegrityReport {
  const nowIso = new Date(now).toISOString();

  let observed: Observed;
  try {
    observed = spec.extract(payload);
  } catch (e) {
    // A payload we cannot even read is a hard failure: the output is
    // malformed, which is exactly the "source changed shape" class.
    return buildReport({
      source: spec.id,
      observedAt: nowIso,
      checks: [
        {
          name: "parse",
          ok: false,
          severity: "critical",
          detail: `could not read payload: ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
    });
  }

  const c = spec.contract;
  const checks: CheckResult[] = [];

  if (c.verifiedAt !== undefined) {
    checks.push(checkVerified({ verifiedAt: c.verifiedAt }));
  }

  checks.push(
    checkFreshness({
      observedAt: observed.observedAt,
      now,
      maxAgeMinutes: c.maxAgeMinutes,
    }),
  );

  // Provenance is opt-in: only meaningful where records actually carry a
  // provenance field (e.g. feed cards' `sourceUrl`). Outputs that expose
  // no per-record source (e.g. globe points) rely on not-fabricated +
  // verified-source instead — forcing provenance there would false-FAIL.
  if (c.provenanceField !== undefined) {
    checks.push(
      checkProvenance(observed.records, { field: c.provenanceField }),
    );
  }

  if (c.checkFabrication) {
    checks.push(checkNotFabricated(observed.records));
  }

  checks.push(
    checkNonEmpty({
      count: observed.records.length,
      floor: c.floor,
      quietDayAllowed: c.quietDayAllowed,
    }),
  );

  if (c.expectedMin !== undefined || c.expectedMax !== undefined) {
    checks.push(
      checkSanityRange({
        value: observed.value ?? observed.records.length,
        expectedMin: c.expectedMin,
        expectedMax: c.expectedMax,
      }),
    );
  }

  if (c.expectedOrdering !== undefined) {
    checks.push(
      checkOrdering({
        ordering: observed.ordering,
        expected: c.expectedOrdering,
      }),
    );
  }

  return buildReport({
    source: spec.id,
    observedAt: observed.observedAt ?? nowIso,
    checks,
  });
}
