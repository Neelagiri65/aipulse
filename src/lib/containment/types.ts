/**
 * Containment loop — core types.
 *
 * The containment loop is the trust actuator: when an output's probe fails,
 * the source is quarantined (grey tile, "last known value · as of T", derived
 * metrics suppressed) and auto-restores only after sustained green probes.
 * Design: docs/prd-containment-loop-v2.md (vault). Non-negotiable invariant:
 * no number renders from a non-LIVE source except explicitly marked last-known.
 */

/** Lifecycle state of a single source within the containment loop. */
export type SourceState = "live" | "suspect" | "quarantined" | "recovering";

/**
 * Classification of a single probe result for one source.
 *
 * - `pass`        — output verified healthy.
 * - `soft-fail`   — availability problem (stale, empty, unreachable witness).
 *                   Gets hysteresis: SUSPECT grace before quarantine.
 * - `hard-fail`   — trust problem (fabrication, sanity breach, missing
 *                   provenance, stored-DTO parse failure). Zero tolerance:
 *                   instant quarantine.
 * - `probe-error` — the probe itself could not run. A monitoring failure must
 *                   never fabricate a data failure: state is left untouched.
 */
export type ProbeOutcome = "pass" | "soft-fail" | "hard-fail" | "probe-error";

/** Per-source hysteresis parameters, derived from the source's cadence. */
export interface HysteresisPolicy {
  /** Consecutive soft-fails (incl. the one that entered SUSPECT) to quarantine. */
  failsToQuarantine: number;
  /** Consecutive passes required in RECOVERING before returning to LIVE. */
  passesToRestore: number;
  /** Minimum time spent non-LIVE before restore is allowed (anti-flap). */
  minDwellMs: number;
}

/** Containment record for one source. All timestamps are epoch ms. */
export interface SourceContainment {
  state: SourceState;
  /** Consecutive passing probes (meaningful in RECOVERING). */
  consecutivePasses: number;
  /** Consecutive failing probes (meaningful in SUSPECT). */
  consecutiveFails: number;
  /** When the current state was entered. */
  enteredAt: number;
  /** Human-readable reason for the current non-LIVE state, "" when LIVE. */
  reason: string;
  /** Last time a probe (of any outcome except probe-error) observed this source. */
  lastProbeAt: number;
  /** Last time a probe passed — the honest "as of" anchor for last-known display. */
  lastGoodAt: number | null;
  /**
   * Freshness key (e.g. the DTO's generatedAt) of the last passing probe.
   * Restore-counting only advances when this CHANGES: K identical green
   * reads of a once-a-day source prove nothing (Auditor change 12).
   */
  lastPassKey: string | null;
}

/** The single persisted blob (Redis key `containment:state`). */
export interface ContainmentState {
  schemaVersion: 1;
  /** When the last probe cycle completed. Serve path treats a stale value as UNKNOWN. */
  computedAt: number;
  sources: Record<string, SourceContainment>;
}

/** One source's probe classification for a cycle. */
export interface ProbeObservation {
  sourceId: string;
  outcome: ProbeOutcome;
  /** Why (first failing check), "" on pass. */
  reason: string;
  /**
   * Freshness key of the observed DTO (e.g. generatedAt). When provided,
   * a pass only advances restore progress if the key differs from the last
   * passing one — "consecutive" means distinct observations, not re-reads.
   * Omit for sources without a usable key: every pass then counts.
   */
  distinctKey?: string;
}

/** Result of advancing the whole state one probe cycle. */
export interface AdvanceResult {
  next: ContainmentState;
  /**
   * Circuit breaker (plan F1): when more than `breakerRatio` of probed sources
   * would flip away from LIVE in a single cycle, the fault is more plausibly in
   * the probe system than in the world. No transitions are applied; the cycle
   * is recorded as tripped so the caller can page instead of mass-greying.
   */
  breakerTripped: boolean;
  /** Sources that changed state this cycle (empty when breaker trips). */
  transitions: Array<{
    sourceId: string;
    from: SourceState;
    to: SourceState;
    reason: string;
  }>;
}
