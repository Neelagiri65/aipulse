/**
 * POST /api/containment/cycle — one containment probe cycle, SHADOW MODE.
 *
 * Runs the full loop (probe → classify → confirm → advance → persist) and
 * returns the decisions it took. Shadow by construction: this route is the
 * sole WRITER of containment state, and until the serve path consumes that
 * state (Milestone 1 actuation hook), nothing a user sees changes. The
 * integrity-watch workflow invokes this every 3h and its Actions log is the
 * shadow-mode decision record the founder adjudicates against the exit
 * criteria (PRD §6 change 10: 3 days zero false positives AND ≥1 injected
 * true positive on preview).
 *
 * Auth: shared INGEST_SECRET via withIngest — this route writes Redis.
 * GET aliases POST so `workflow_dispatch` + browser checks work.
 */

import { NextResponse } from "next/server";
import { withIngest } from "@/app/api/_lib/withIngest";
import { runContainmentCycle, type CycleResult } from "@/lib/containment/cycle";
import { inProcessFetcher } from "@/lib/integrity/in-process";
import { buildProbeSpecs, PROBE_ORIGIN } from "@/lib/integrity/specs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function origin(): string {
  const env = process.env.NEXT_PUBLIC_SITE_ORIGIN?.trim().replace(/\/$/, "");
  return env || PROBE_ORIGIN;
}

export const POST = withIngest<CycleResult>({
  workflow: "containment-cycle",
  run: async () => {
    return runContainmentCycle({
      specs: buildProbeSpecs(origin()),
      fetcher: inProcessFetcher,
      now: Date.now(),
    });
  },
  // An aborted cycle delivered nothing (monitoring failure) → loud red
  // beacon. A completed cycle is green even when its CAS write lost —
  // the observations were delivered and the next cycle self-corrects;
  // `persisted:false` stays visible in the response/log.
  toOutcome: (r) =>
    r.aborted
      ? { ok: false, error: r.abortReason }
      : { ok: true, itemsProcessed: r.observations.length },
  toResponse: (r) =>
    NextResponse.json({
      ok: !r.aborted,
      mode: "shadow",
      aborted: r.aborted,
      abortReason: r.abortReason,
      coldStart: r.coldStart,
      persisted: r.persisted,
      breakerTripped: r.breakerTripped,
      transitions: r.transitions,
      confirmedHardFails: r.confirmedHardFails,
      unconfirmedHardFails: r.unconfirmedHardFails,
      lastGoodWrites: r.lastGoodWrites,
      observations: r.observations.map((o) => ({
        sourceId: o.sourceId,
        outcome: o.outcome,
        reason: o.reason,
      })),
      states: Object.fromEntries(
        Object.entries(r.state?.sources ?? {}).map(([id, s]) => [
          id,
          s.state,
        ]),
      ),
      generatedAt: new Date().toISOString(),
    }),
});

export const GET = POST;
