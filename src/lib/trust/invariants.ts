/**
 * Trust invariants — the executable definition of "true" for a displayed
 * datum (PRD prd-trust-harness §1). Shared across every feed's output
 * tests and (later) the live production auditor, so "trustworthy" means
 * the SAME thing everywhere instead of ad-hoc per feed.
 *
 * Each predicate is pure and returns a TrustViolation or null. Feed tests
 * assert `auditItem(...) === []` on real fixtures and assert the SPECIFIC
 * violation on reconstructed-incident fixtures. This is the discipline the
 * 2026-07-05 phantom-star incident proved was missing: 2000 green tests
 * asserted behaviour, none asserted these output properties.
 *
 * Deliberately thin. Where the integrity layer already has a checker
 * (freshness, sanity range, not-fabricated) this composes the same idea;
 * it does NOT duplicate `@/lib/integrity/checks` — that layer probes live
 * endpoints, this asserts pipeline output in CI. Same contract, two
 * surfaces.
 */

export type TrustViolation = { invariant: string; detail: string };

/** FRESH: the datum's own timestamp is within its feed's window. A stale
 *  value served as live is the S88/globe class. */
export function checkFresh(
  timestampIso: string | null | undefined,
  nowMs: number,
  maxAgeMs: number,
): TrustViolation | null {
  if (!timestampIso) {
    return { invariant: "fresh", detail: "no timestamp — freshness unverifiable" };
  }
  const t = Date.parse(timestampIso);
  if (Number.isNaN(t)) {
    return { invariant: "fresh", detail: `unparseable timestamp: ${timestampIso}` };
  }
  if (nowMs - t > maxAgeMs) {
    const ageH = Math.round((nowMs - t) / 3_600_000);
    return { invariant: "fresh", detail: `${ageH}h old, exceeds window` };
  }
  return null;
}

/** ATTRIBUTED: the source URL is well-formed https and (when a platform is
 *  claimed) points at the right host — the #53 class (a GitLab repo linked
 *  to github.com/gitlab.com/... = 404 on click). */
export function checkResolvableSource(
  url: string | null | undefined,
): TrustViolation | null {
  if (!url) {
    return { invariant: "attributed", detail: "no source URL" };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { invariant: "attributed", detail: `malformed source URL: ${url}` };
  }
  if (parsed.protocol !== "https:") {
    return { invariant: "attributed", detail: `non-https source: ${url}` };
  }
  // The double-host bug: a path segment that is itself a known code host.
  if (/\/(github\.com|gitlab\.com)\//.test(parsed.pathname)) {
    return {
      invariant: "attributed",
      detail: `source path contains a nested host (broken cross-platform link): ${url}`,
    };
  }
  return null;
}

/** DELTA-PROVENANCE: a change/movement claim ("+44", "climbed", an up/down
 *  delta) may ONLY be asserted when a real like-for-like baseline existed.
 *  The S91 fabrication (17 invented MODEL_MOVER cards off an unlike-ordered
 *  baseline) and the SDK +734% class. `claimsMovement` and `hasRealBaseline`
 *  are read from the item; a movement without a baseline is a fabrication. */
export function checkDeltaProvenance(
  claimsMovement: boolean,
  hasRealBaseline: boolean,
): TrustViolation | null {
  if (claimsMovement && !hasRealBaseline) {
    return {
      invariant: "delta-provenance",
      detail: "movement/delta claimed with no real like-for-like baseline (fabrication)",
    };
  }
  return null;
}

/** REAL: no synthetic/simulated markers on a record that ships as live
 *  (the globe non-negotiable). */
export function checkNotSynthetic(
  record: Record<string, unknown>,
): TrustViolation | null {
  if (record.synthetic === true || record.simulated === true || record.sample === true) {
    return { invariant: "real", detail: "record carries a synthetic/simulated flag" };
  }
  return null;
}

/** Run several checks; return every violation (empty = trustworthy). */
export function auditItem(
  checks: Array<TrustViolation | null>,
): TrustViolation[] {
  return checks.filter((v): v is TrustViolation => v !== null);
}
