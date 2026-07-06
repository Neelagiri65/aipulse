/**
 * Containment loop — one probe cycle, end to end.
 *
 *   read state → probe outputs → classify → confirm hard failures →
 *   advance state machine → CAS-persist → capture last-good copies
 *
 * This is the piece the 3h integrity-watch rails invoke. The serve path
 * (applyContainment in loadFeedResponse) only ever READS the persisted
 * state — this module is the sole writer. Shadow mode (2026-07-03 →
 * 07-06, 3 clean days) was the same cycle with no reader.
 *
 * Failure posture (plan F3/F5/F7 + Auditor changes 2/3/4):
 *   - state READ error → the whole cycle aborts untouched (a monitoring
 *     failure must never rebuild fresh state over standing quarantines);
 *   - state genuinely absent → cold start from an all-new state; a stale
 *     version key over a corrupt blob is unwedged with a force write;
 *   - a hard violation on first read is re-read once in the same cycle and
 *     only actuates when the confirmation read also fails hard — a torn
 *     read of a mid-write DTO must not cost a healthy source hours of grey;
 *   - a lost CAS write drops this cycle's transitions (logged, not retried):
 *     the next cycle re-probes from the winner's honest state.
 */

import type { IntegrityReport } from "@/lib/integrity/checks";
import { runProbes, type Fetcher, type RunnableSpec } from "@/lib/integrity/run";

import { classifyReport } from "./classify";
import { advance } from "./engine";
import {
  forceWriteContainmentState,
  readContainmentState,
  writeContainmentState,
  writeLastGood,
} from "./store";
import type {
  AdvanceResult,
  ContainmentState,
  HysteresisPolicy,
  ProbeObservation,
} from "./types";

/**
 * Cycle-count hysteresis at the 3h probe cadence: two consecutive soft-fail
 * cycles (~6h) before quarantine, two DISTINCT green observations to restore,
 * 6h minimum non-LIVE dwell. Per-source overrides come from the caller,
 * derived from each source's declared cadence (plan §1).
 */
export const DEFAULT_HYSTERESIS: HysteresisPolicy = {
  failsToQuarantine: 2,
  passesToRestore: 2,
  minDwellMs: 6 * 60 * 60 * 1000,
};

export interface CycleResult {
  /** Cycle aborted before advancing: monitoring failure, nothing mutated. */
  aborted: boolean;
  /** Why the cycle aborted, "" otherwise. */
  abortReason: string;
  /** No prior state existed — this cycle initialised it. */
  coldStart: boolean;
  /** Final per-source observations (after hard-fail confirmation). */
  observations: ProbeObservation[];
  /** Hard failures that survived the same-cycle confirmation re-read. */
  confirmedHardFails: string[];
  /** First-read hard failures the confirmation read did NOT reproduce. */
  unconfirmedHardFails: string[];
  /** State transitions this cycle (empty when the breaker tripped). */
  transitions: AdvanceResult["transitions"];
  breakerTripped: boolean;
  /** Whether the advanced state landed in Redis (CAS or cold-start force). */
  persisted: boolean;
  /** Sources whose last-good copy was refreshed this cycle. */
  lastGoodWrites: string[];
  /** The advanced state (persisted or not — caller may log either way). */
  state: ContainmentState | null;
}

export interface CycleOptions {
  specs: ReadonlyArray<RunnableSpec>;
  fetcher: Fetcher;
  /** Injected clock (epoch ms) — no Date.now() in the loop. */
  now: number;
  defaultPolicy?: HysteresisPolicy;
  /** Per-source hysteresis overrides (sourceId → policy). */
  policies?: Record<string, HysteresisPolicy>;
}

export async function runContainmentCycle(
  opts: CycleOptions,
): Promise<CycleResult> {
  const { specs, fetcher, now } = opts;
  const defaultPolicy = opts.defaultPolicy ?? DEFAULT_HYSTERESIS;
  const policies = opts.policies ?? {};

  const read = await readContainmentState();
  if (read.error) {
    return abortedCycle("containment state read failed (Redis error)");
  }
  const coldStart = read.state === null;
  const base: ContainmentState = read.state ?? {
    schemaVersion: 1,
    computedAt: 0,
    sources: {},
  };
  const basedOnVersion = read.state?.computedAt ?? 0;

  // Capture raw payloads per spec id so a passing source's DTO can be copied
  // to last-good without a second fetch path.
  const payloads = new Map<string, unknown>();
  const capture =
    (id: string): Fetcher =>
    async (url) => {
      const payload = await fetcher(url);
      payloads.set(id, payload);
      return payload;
    };

  const firstReports = await Promise.all(
    specs.map((spec) => runProbes([spec], capture(spec.id), now)),
  );
  const reportById = new Map<string, IntegrityReport>(
    firstReports.map((r) => [r[0].source, r[0]]),
  );

  // Same-cycle confirmation re-read for hard violations (Auditor change 3):
  // only two matching hard failures actuate; the confirmation read's
  // classification wins either way (it is the fresher observation).
  const confirmedHardFails: string[] = [];
  const unconfirmedHardFails: string[] = [];
  const observations: ProbeObservation[] = [];

  await Promise.all(
    specs.map(async (spec) => {
      const first = classifyReport(reportById.get(spec.id)!);
      if (first.outcome !== "hard-fail") {
        observations.push(withDistinctKey(first, reportById.get(spec.id)!));
        return;
      }
      const [confirmReport] = await runProbes([spec], capture(spec.id), now);
      reportById.set(spec.id, confirmReport);
      const confirmed = classifyReport(confirmReport);
      if (confirmed.outcome === "hard-fail") {
        confirmedHardFails.push(spec.id);
      } else {
        unconfirmedHardFails.push(spec.id);
      }
      observations.push(withDistinctKey(confirmed, confirmReport));
    }),
  );

  const advanced = advance(base, observations, now, defaultPolicy, policies);

  let persisted = await writeContainmentState(advanced.next, basedOnVersion);
  if (!persisted && coldStart) {
    // A stale version key over an absent/corrupt blob would wedge every
    // cold-start CAS forever. Absence was verified this cycle, so unwedge.
    persisted = await forceWriteContainmentState(advanced.next);
  }
  if (!persisted) {
    console.error(
      "[containment:cycle] state write lost (concurrent cycle or Redis down); transitions dropped this cycle",
    );
  }

  // Last-good copies: only for passing sources whose provenance key CHANGED
  // (bounded by source update cadence, not probe cadence — Auditor change 1).
  const lastGoodWrites: string[] = [];
  await Promise.all(
    observations
      .filter(
        (obs) =>
          obs.outcome === "pass" &&
          obs.distinctKey !== undefined &&
          obs.distinctKey !== base.sources[obs.sourceId]?.lastPassKey &&
          payloads.has(obs.sourceId),
      )
      .map(async (obs) => {
        const ok = await writeLastGood(
          obs.sourceId,
          payloads.get(obs.sourceId),
          obs.distinctKey!,
          now,
        );
        if (ok) lastGoodWrites.push(obs.sourceId);
      }),
  );

  return {
    aborted: false,
    abortReason: "",
    coldStart,
    observations,
    confirmedHardFails,
    unconfirmedHardFails,
    transitions: advanced.transitions,
    breakerTripped: advanced.breakerTripped,
    persisted,
    lastGoodWrites,
    state: advanced.next,
  };
}

/** A pass's distinct key is the DTO's own freshness timestamp — identical
 *  green re-reads of a slow source then don't advance restore counting. */
function withDistinctKey(
  obs: ProbeObservation,
  report: IntegrityReport,
): ProbeObservation {
  if (obs.outcome !== "pass") return obs;
  return { ...obs, distinctKey: report.observedAt };
}

function abortedCycle(reason: string): CycleResult {
  return {
    aborted: true,
    abortReason: reason,
    coldStart: false,
    observations: [],
    confirmedHardFails: [],
    unconfirmedHardFails: [],
    transitions: [],
    breakerTripped: false,
    persisted: false,
    lastGoodWrites: [],
    state: null,
  };
}
