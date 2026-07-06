/**
 * Editorial decision log for the daily video pipeline — the first
 * application of the traceability-over-logging principle (founder,
 * 2026-07-06): every gate/dedup/lead verdict the pipeline takes is
 * collected as a structured record and archived in gawk-data beside the
 * day's snapshots, so "why wasn't X in Tuesday's video" is a permanent
 * public lookup instead of an expired CI log line. The console [SKIP] /
 * [LEAD GATE] lines remain a courtesy view only — this record is the
 * authority.
 *
 * The verdicts themselves are the pure-function returns already gated
 * by tests (content-gates.ts, lead-freshness.ts); this module only
 * collects and serialises them. It must never change a verdict.
 */

/** The gate that rejected a story. Names match the rule modules. */
export type SkipGate =
  | "story-gate" // verifiable-metric / personal-content gate
  | "leaderboard-dedup" // model already shown in the top-5 leaderboard
  | "sdk-dedup" // same package under wording drift
  | "model-dedup" // same rank move from two sources
  | "render"; // no renderable metric at card-build time (backstop)

/** Where the candidate story came from. */
export type DecisionSource = "hook" | "curated" | "supplement";

export type Decision =
  | {
      verdict: "skip";
      gate: SkipGate;
      reason: string;
      headline: string;
      source: DecisionSource;
    }
  | {
      verdict: "accept";
      id: string;
      headline: string;
      source: DecisionSource;
      /** Final position in the shipped story order — stamped by assignSlots. */
      slot?: number;
    }
  | {
      /** Cross-day lead freshness — exactly one per video. */
      verdict: "lead-rotated" | "lead-kept";
      reason: string;
      lead: string;
    };

export type DecisionArchive = {
  v: 1;
  capturedAt: string;
  generator: string;
  run?: string;
  record: {
    date: string;
    lead: string;
    counts: { accepted: number; skipped: number };
    decisions: Decision[];
  };
};

export function createDecisionLog() {
  const decisions: Decision[] = [];
  return {
    record(d: Decision): void {
      decisions.push(d);
    },
    entries(): readonly Decision[] {
      return decisions;
    },
  };
}

/**
 * Stamp each accepted decision with its final slot in the shipped story
 * order (the lead gate may have rotated it after acceptance). Throws if
 * an accepted story is missing from the final order — that would mean
 * the log has drifted from the actual output, and a drifted record is
 * worse than no record.
 */
export function assignSlots(
  decisions: readonly Decision[],
  finalOrderIds: readonly string[],
): Decision[] {
  const slotById = new Map(finalOrderIds.map((id, i) => [id, i]));
  return decisions.map((d) => {
    if (d.verdict !== "accept") return d;
    const slot = slotById.get(d.id);
    if (slot === undefined) {
      throw new Error(
        `decision log drifted from output: accepted story "${d.id}" is not in the final story order`,
      );
    }
    return { ...d, slot };
  });
}

/**
 * Serialise the day's decisions into the archive envelope. Fail-loud:
 * a record with no lead-gate verdict, more than one, or zero accepted
 * stories is malformed and must not be archived.
 */
export function toDecisionArchive(opts: {
  decisions: readonly Decision[];
  date: string; // YYYY-MM-DD (UTC)
  capturedAt: string; // ISO timestamp
  runUrl?: string;
}): DecisionArchive {
  const leadDecisions = opts.decisions.filter(
    (d) => d.verdict === "lead-rotated" || d.verdict === "lead-kept",
  );
  if (leadDecisions.length !== 1) {
    throw new Error(
      `decision record must carry exactly one lead-gate verdict, got ${leadDecisions.length}`,
    );
  }
  const accepted = opts.decisions.filter((d) => d.verdict === "accept").length;
  if (accepted === 0) {
    throw new Error("decision record has zero accepted stories — no video to trace");
  }
  const skipped = opts.decisions.filter((d) => d.verdict === "skip").length;
  const lead = leadDecisions[0] as Extract<Decision, { lead: string }>;
  return {
    v: 1,
    capturedAt: opts.capturedAt,
    generator: "scripts/video/generate-daily-script.ts",
    ...(opts.runUrl ? { run: opts.runUrl } : {}),
    record: {
      date: opts.date,
      lead: lead.lead,
      counts: { accepted, skipped },
      decisions: [...opts.decisions],
    },
  };
}
