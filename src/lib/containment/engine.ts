/**
 * Containment engine — pure state machine, no I/O.
 *
 * Transition table (docs/prd-containment-loop-v2.md §1 + Auditor changes):
 *
 *   LIVE        + pass       → LIVE        (counters reset)
 *   LIVE        + soft-fail  → SUSPECT     (grace; quarantine deferred —
 *                              existing staleAsOf disclosure is NOT gated
 *                              by this: hysteresis defers actuation only)
 *   LIVE        + hard-fail  → QUARANTINED (trust failures get zero grace)
 *   SUSPECT     + pass       → LIVE        (one pass clears)
 *   SUSPECT     + soft-fail  → SUSPECT until failsToQuarantine, then QUARANTINED
 *   SUSPECT     + hard-fail  → QUARANTINED
 *   QUARANTINED + pass       → RECOVERING
 *   QUARANTINED + any fail   → QUARANTINED (dwell clock keeps running)
 *   RECOVERING  + pass       → RECOVERING until passesToRestore DISTINCT
 *                              passes AND minDwellMs satisfied, then LIVE
 *   RECOVERING  + any fail   → QUARANTINED (restore progress resets)
 *   any state   + probe-error→ unchanged (monitoring failure ≠ data failure)
 *
 * "Consecutive" units (Auditor change 12): failures count in probe cycles;
 * restores count in DISTINCT observations — a pass advances restore progress
 * only when the observed DTO's freshness key changed since the last pass.
 *
 * Circuit breaker (plan F1 + Auditor change 11): two trip conditions —
 * per-cycle mass flip (probe-system fault) and aggregate non-LIVE fraction
 * (slow-rolling correlated failure). Tripping freezes DEGRADE transitions
 * only; restores still apply (the fail-safe is sticky in the trust
 * direction, and blocking restores would deadlock recovery of a >40%-grey
 * board).
 *
 * Unknown sources start LIVE: absence of history is not evidence of a
 * problem, and defaulting new sources to quarantine would grey the board on
 * every schema addition (plan F3 fail-open-with-disclosure decision).
 */

import type {
  AdvanceResult,
  ContainmentState,
  HysteresisPolicy,
  ProbeObservation,
  SourceContainment,
  SourceState,
} from "./types";

/** Trip threshold for both breaker conditions. */
export const BREAKER_RATIO = 0.4;

/** Minimum probed sources before the breaker can trip (a 1-source flip is not a mass event). */
export const BREAKER_MIN_SOURCES = 5;

export function initialSourceContainment(now: number): SourceContainment {
  return {
    state: "live",
    consecutivePasses: 0,
    consecutiveFails: 0,
    enteredAt: now,
    reason: "",
    lastProbeAt: 0,
    lastGoodAt: null,
    lastPassKey: null,
  };
}

export function emptyContainmentState(now: number): ContainmentState {
  return { schemaVersion: 1, computedAt: now, sources: {} };
}

function enter(
  prev: SourceContainment,
  state: SourceState,
  now: number,
  reason: string,
): SourceContainment {
  return {
    ...prev,
    state,
    enteredAt: now,
    reason: state === "live" ? "" : reason,
    consecutivePasses: 0,
    consecutiveFails: 0,
  };
}

/**
 * Advance one source one probe cycle. Pure; exported for exhaustive
 * transition-table testing.
 */
export function transition(
  prev: SourceContainment,
  outcome: ProbeObservation["outcome"],
  reason: string,
  now: number,
  policy: HysteresisPolicy,
  distinctKey?: string,
): SourceContainment {
  if (outcome === "probe-error") {
    // Monitoring failure: never move state, never advance counters, never
    // touch lastProbeAt — staleness of the observation record is what the
    // serve path uses to disclose UNKNOWN (plan F5/F7). Display state is
    // sticky: a stale blob keeps QUARANTINED grey (Auditor change 2).
    return prev;
  }

  const isPass = outcome === "pass";
  // A pass advances restore progress only on a genuinely new observation.
  const isDistinctPass =
    isPass && (distinctKey === undefined || distinctKey !== prev.lastPassKey);

  const observed: SourceContainment = {
    ...prev,
    lastProbeAt: now,
    lastGoodAt: isPass ? now : prev.lastGoodAt,
    lastPassKey: isPass ? (distinctKey ?? prev.lastPassKey) : prev.lastPassKey,
  };

  if (outcome === "hard-fail") {
    // Trust violations get zero grace from every state. (Torn-read
    // protection is the runner's job: it confirms hard failures with a
    // same-cycle re-read before emitting them — Auditor change 3.)
    return enter(observed, "quarantined", now, reason);
  }

  switch (prev.state) {
    case "live": {
      if (isPass) {
        return { ...observed, consecutivePasses: 0, consecutiveFails: 0 };
      }
      const suspect = enter(observed, "suspect", now, reason);
      return { ...suspect, consecutiveFails: 1 };
    }
    case "suspect": {
      if (isPass) {
        return enter(observed, "live", now, "");
      }
      const fails = prev.consecutiveFails + 1;
      if (fails >= policy.failsToQuarantine) {
        return enter(observed, "quarantined", now, reason);
      }
      return { ...observed, consecutiveFails: fails, reason };
    }
    case "quarantined": {
      if (isPass) {
        const recovering = enter(observed, "recovering", now, prev.reason);
        // Restore dwell is measured from quarantine entry, so carry it over.
        return {
          ...recovering,
          enteredAt: prev.enteredAt,
          consecutivePasses: isDistinctPass ? 1 : 0,
        };
      }
      // Still failing: refresh the reason, dwell clock keeps running.
      return { ...observed, reason };
    }
    case "recovering": {
      if (isPass) {
        const passes = prev.consecutivePasses + (isDistinctPass ? 1 : 0);
        const dwelled = now - prev.enteredAt >= policy.minDwellMs;
        if (passes >= policy.passesToRestore && dwelled) {
          return enter(observed, "live", now, "");
        }
        return { ...observed, consecutivePasses: passes };
      }
      // Any failure during recovery sends it straight back.
      return enter(observed, "quarantined", now, reason);
    }
  }
}

/**
 * Advance the whole containment state one probe cycle.
 *
 * `policies` maps sourceId → hysteresis policy; sources without an entry use
 * `defaultPolicy`. Observations for unknown sources create LIVE records first,
 * so a brand-new source still quarantines on a first-cycle hard violation.
 */
export function advance(
  state: ContainmentState,
  observations: ProbeObservation[],
  now: number,
  defaultPolicy: HysteresisPolicy,
  policies: Record<string, HysteresisPolicy> = {},
): AdvanceResult {
  const nextSources: Record<string, SourceContainment> = { ...state.sources };
  const transitions: AdvanceResult["transitions"] = [];

  for (const obs of observations) {
    const prev = nextSources[obs.sourceId] ?? initialSourceContainment(now);
    const policy = policies[obs.sourceId] ?? defaultPolicy;
    const next = transition(
      prev,
      obs.outcome,
      obs.reason,
      now,
      policy,
      obs.distinctKey,
    );
    nextSources[obs.sourceId] = next;
    if (next.state !== prev.state) {
      transitions.push({
        sourceId: obs.sourceId,
        from: prev.state,
        to: next.state,
        reason: next.state === "live" ? "" : next.reason,
      });
    }
  }

  const probed = observations.filter((o) => o.outcome !== "probe-error").length;
  const degradeFlips = transitions.filter((t) => t.to !== "live").length;

  // Breaker condition 1 (plan F1): mass flip in ONE cycle — the fault is
  // more plausibly in the probe system than in the world.
  const perCycleTrip =
    probed >= BREAKER_MIN_SOURCES && degradeFlips / probed > BREAKER_RATIO;

  // Breaker condition 2 (Auditor change 11): slow-rolling correlated
  // failure — the aggregate non-LIVE fraction crossing the threshold, even
  // though no single cycle flipped many. Only evaluated when this cycle
  // tried to degrade something.
  const known = Object.values(nextSources);
  const nonLive = known.filter((s) => s.state !== "live").length;
  const aggregateTrip =
    degradeFlips > 0 &&
    probed >= BREAKER_MIN_SOURCES &&
    known.length > 0 &&
    nonLive / known.length > BREAKER_RATIO;

  if (perCycleTrip || aggregateTrip) {
    // Freeze degrade transitions; apply restores only. Blocking restores
    // would deadlock recovery of an already-grey board, and a restore can
    // never extend a lie (it needs K distinct green observations).
    const restoredSources: Record<string, SourceContainment> = {
      ...state.sources,
    };
    const restores = transitions.filter((t) => t.to === "live");
    for (const r of restores) {
      restoredSources[r.sourceId] = nextSources[r.sourceId];
    }
    return {
      next: { schemaVersion: 1, computedAt: now, sources: restoredSources },
      breakerTripped: true,
      transitions: restores,
    };
  }

  return {
    next: { schemaVersion: 1, computedAt: now, sources: nextSources },
    breakerTripped: false,
    transitions,
  };
}
