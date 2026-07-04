/**
 * Containment engine — pure state machine, no I/O.
 *
 * Transition table (docs/prd-containment-loop-v2.md §1):
 *
 *   LIVE        + pass       → LIVE        (counters reset)
 *   LIVE        + soft-fail  → SUSPECT     (grace; display unchanged)
 *   LIVE        + hard-fail  → QUARANTINED (trust failures get zero grace)
 *   SUSPECT     + pass       → LIVE
 *   SUSPECT     + soft-fail  → SUSPECT until failsToQuarantine, then QUARANTINED
 *   SUSPECT     + hard-fail  → QUARANTINED
 *   QUARANTINED + pass       → RECOVERING
 *   QUARANTINED + any fail   → QUARANTINED (dwell clock keeps running)
 *   RECOVERING  + pass       → RECOVERING until passesToRestore AND minDwellMs
 *                              satisfied, then LIVE
 *   RECOVERING  + any fail   → QUARANTINED (restore progress resets)
 *   any state   + probe-error→ unchanged (monitoring failure ≠ data failure)
 *
 * Unknown sources start LIVE: absence of history is not evidence of a problem,
 * and defaulting new sources to quarantine would grey the board on every
 * schema addition (plan F3 fail-open-with-disclosure decision).
 */

import type {
  AdvanceResult,
  ContainmentState,
  HysteresisPolicy,
  ProbeObservation,
  SourceContainment,
  SourceState,
} from "./types";

/** Fraction of probed sources flipping away from LIVE that trips the breaker. */
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
): SourceContainment {
  if (outcome === "probe-error") {
    // Monitoring failure: never move state, never advance counters, never
    // touch lastProbeAt — staleness of the observation record is what the
    // serve path uses to disclose UNKNOWN (plan F5/F7).
    return prev;
  }

  const observed: SourceContainment = {
    ...prev,
    lastProbeAt: now,
    lastGoodAt: outcome === "pass" ? now : prev.lastGoodAt,
  };

  if (outcome === "hard-fail") {
    // Trust violations get zero grace from every state.
    return enter(observed, "quarantined", now, reason);
  }

  switch (prev.state) {
    case "live": {
      if (outcome === "pass") {
        return { ...observed, consecutivePasses: 0, consecutiveFails: 0 };
      }
      const suspect = enter(observed, "suspect", now, reason);
      return { ...suspect, consecutiveFails: 1 };
    }
    case "suspect": {
      if (outcome === "pass") {
        return enter(observed, "live", now, "");
      }
      const fails = prev.consecutiveFails + 1;
      if (fails >= policy.failsToQuarantine) {
        return enter(observed, "quarantined", now, reason);
      }
      return { ...observed, consecutiveFails: fails, reason };
    }
    case "quarantined": {
      if (outcome === "pass") {
        const recovering = enter(observed, "recovering", now, prev.reason);
        // Restore dwell is measured from quarantine entry, so carry it over.
        return {
          ...recovering,
          enteredAt: prev.enteredAt,
          consecutivePasses: 1,
        };
      }
      // Still failing: refresh the reason, dwell clock keeps running.
      return { ...observed, reason };
    }
    case "recovering": {
      if (outcome === "pass") {
        const passes = prev.consecutivePasses + 1;
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
    const next = transition(prev, obs.outcome, obs.reason, now, policy);
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

  // Circuit breaker (plan F1): a mass flip away from LIVE in one cycle is more
  // plausibly a probe-system fault than the world ending. Restores (→ LIVE)
  // never count toward tripping it.
  const flips = transitions.filter((t) => t.to !== "live").length;
  const probed = observations.filter((o) => o.outcome !== "probe-error").length;
  if (probed >= BREAKER_MIN_SOURCES && flips / probed > BREAKER_RATIO) {
    return {
      next: { ...state, computedAt: now },
      breakerTripped: true,
      transitions: [],
    };
  }

  return {
    next: { schemaVersion: 1, computedAt: now, sources: nextSources },
    breakerTripped: false,
    transitions,
  };
}
