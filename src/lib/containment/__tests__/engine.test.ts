import { describe, expect, it } from "vitest";

import {
  BREAKER_MIN_SOURCES,
  advance,
  emptyContainmentState,
  initialSourceContainment,
  transition,
} from "../engine";
import type {
  HysteresisPolicy,
  ProbeObservation,
  SourceContainment,
  SourceState,
} from "../types";

const NOW = Date.parse("2026-07-04T12:00:00Z");
const MINUTE = 60_000;

const POLICY: HysteresisPolicy = {
  failsToQuarantine: 3,
  passesToRestore: 2,
  minDwellMs: 60 * MINUTE,
};

function inState(
  state: SourceState,
  overrides: Partial<SourceContainment> = {},
): SourceContainment {
  return {
    ...initialSourceContainment(NOW - 120 * MINUTE),
    state,
    enteredAt: NOW - 120 * MINUTE,
    reason: state === "live" ? "" : "stale beyond budget",
    ...overrides,
  };
}

describe("transition table — every state × outcome", () => {
  it("live + pass stays live and anchors lastGoodAt", () => {
    const next = transition(inState("live"), "pass", "", NOW, POLICY);
    expect(next.state).toBe("live");
    expect(next.lastGoodAt).toBe(NOW);
    expect(next.lastProbeAt).toBe(NOW);
  });

  it("live + soft-fail enters suspect with one recorded fail", () => {
    const next = transition(inState("live"), "soft-fail", "stale", NOW, POLICY);
    expect(next.state).toBe("suspect");
    expect(next.consecutiveFails).toBe(1);
    expect(next.reason).toBe("stale");
    expect(next.enteredAt).toBe(NOW);
  });

  it("live + hard-fail quarantines instantly — trust gets zero grace", () => {
    const next = transition(
      inState("live"),
      "hard-fail",
      "sanity range breached",
      NOW,
      POLICY,
    );
    expect(next.state).toBe("quarantined");
    expect(next.reason).toBe("sanity range breached");
  });

  it("suspect + pass returns straight to live and clears the reason", () => {
    const next = transition(
      inState("suspect", { consecutiveFails: 2 }),
      "pass",
      "",
      NOW,
      POLICY,
    );
    expect(next.state).toBe("live");
    expect(next.reason).toBe("");
    expect(next.consecutiveFails).toBe(0);
  });

  it("suspect + soft-fail below the threshold stays suspect and counts", () => {
    const next = transition(
      inState("suspect", { consecutiveFails: 1 }),
      "soft-fail",
      "still stale",
      NOW,
      POLICY,
    );
    expect(next.state).toBe("suspect");
    expect(next.consecutiveFails).toBe(2);
    expect(next.reason).toBe("still stale");
  });

  it("suspect + soft-fail reaching failsToQuarantine quarantines", () => {
    const next = transition(
      inState("suspect", { consecutiveFails: 2 }),
      "soft-fail",
      "stale 3rd cycle",
      NOW,
      POLICY,
    );
    expect(next.state).toBe("quarantined");
  });

  it("suspect + hard-fail quarantines without waiting for the counter", () => {
    const next = transition(
      inState("suspect", { consecutiveFails: 1 }),
      "hard-fail",
      "provenance missing",
      NOW,
      POLICY,
    );
    expect(next.state).toBe("quarantined");
  });

  it("quarantined + pass moves to recovering but keeps the dwell anchor", () => {
    const enteredAt = NOW - 30 * MINUTE;
    const next = transition(
      inState("quarantined", { enteredAt }),
      "pass",
      "",
      NOW,
      POLICY,
    );
    expect(next.state).toBe("recovering");
    expect(next.enteredAt).toBe(enteredAt);
    expect(next.consecutivePasses).toBe(1);
  });

  it("quarantined + soft-fail stays quarantined with a refreshed reason", () => {
    const next = transition(
      inState("quarantined"),
      "soft-fail",
      "endpoint 404",
      NOW,
      POLICY,
    );
    expect(next.state).toBe("quarantined");
    expect(next.reason).toBe("endpoint 404");
  });

  it("quarantined + hard-fail stays quarantined", () => {
    const next = transition(
      inState("quarantined"),
      "hard-fail",
      "fabricated delta",
      NOW,
      POLICY,
    );
    expect(next.state).toBe("quarantined");
  });

  it("recovering + pass below passesToRestore keeps recovering", () => {
    const next = transition(
      inState("recovering", { consecutivePasses: 0 }),
      "pass",
      "",
      NOW,
      POLICY,
    );
    expect(next.state).toBe("recovering");
    expect(next.consecutivePasses).toBe(1);
  });

  it("recovering + enough passes + dwell satisfied restores to live", () => {
    const next = transition(
      inState("recovering", {
        consecutivePasses: 1,
        enteredAt: NOW - 2 * POLICY.minDwellMs,
      }),
      "pass",
      "",
      NOW,
      POLICY,
    );
    expect(next.state).toBe("live");
    expect(next.reason).toBe("");
  });

  it("recovering + enough passes but dwell NOT satisfied keeps recovering (anti-flap)", () => {
    const next = transition(
      inState("recovering", {
        consecutivePasses: 1,
        enteredAt: NOW - POLICY.minDwellMs / 2,
      }),
      "pass",
      "",
      NOW,
      POLICY,
    );
    expect(next.state).toBe("recovering");
  });

  it("recovering + any fail goes straight back to quarantined", () => {
    for (const outcome of ["soft-fail", "hard-fail"] as const) {
      const next = transition(
        inState("recovering", { consecutivePasses: 1 }),
        outcome,
        "regressed",
        NOW,
        POLICY,
      );
      expect(next.state).toBe("quarantined");
      expect(next.consecutivePasses).toBe(0);
    }
  });

  it("probe-error leaves EVERY state completely untouched (monitoring ≠ data failure)", () => {
    for (const state of [
      "live",
      "suspect",
      "quarantined",
      "recovering",
    ] as const) {
      const prev = inState(state, { consecutiveFails: 1, consecutivePasses: 1 });
      const next = transition(prev, "probe-error", "redis down", NOW, POLICY);
      expect(next).toEqual(prev);
    }
  });
});

describe("advance — batch cycle", () => {
  const obs = (
    sourceId: string,
    outcome: ProbeObservation["outcome"],
    reason = "",
  ): ProbeObservation => ({ sourceId, outcome, reason });

  it("creates LIVE records for unknown sources, and a first-cycle hard-fail still quarantines", () => {
    const { next, transitions } = advance(
      emptyContainmentState(NOW - MINUTE),
      [obs("openrouter", "hard-fail", "unlike-ordered baseline")],
      NOW,
      POLICY,
    );
    expect(next.sources["openrouter"].state).toBe("quarantined");
    expect(transitions).toEqual([
      {
        sourceId: "openrouter",
        from: "live",
        to: "quarantined",
        reason: "unlike-ordered baseline",
      },
    ]);
  });

  it("advances computedAt every cycle and preserves unprobed sources", () => {
    const seeded = advance(
      emptyContainmentState(NOW - 10 * MINUTE),
      [obs("hn", "soft-fail", "stale")],
      NOW - 5 * MINUTE,
      POLICY,
    ).next;
    const { next } = advance(seeded, [obs("feed", "pass")], NOW, POLICY);
    expect(next.computedAt).toBe(NOW);
    expect(next.sources["hn"].state).toBe("suspect");
    expect(next.sources["feed"].state).toBe("live");
  });

  it("trips the breaker when >40% of probed sources would flip non-LIVE, applying nothing", () => {
    const observations = [
      obs("a", "hard-fail", "x"),
      obs("b", "hard-fail", "x"),
      obs("c", "hard-fail", "x"),
      obs("d", "pass"),
      obs("e", "pass"),
    ];
    const before = emptyContainmentState(NOW - MINUTE);
    const result = advance(before, observations, NOW, POLICY);
    expect(result.breakerTripped).toBe(true);
    expect(result.transitions).toEqual([]);
    expect(result.next.sources).toEqual(before.sources);
    expect(result.next.computedAt).toBe(NOW);
  });

  it("does NOT trip the breaker below the minimum source count (single-source flip is not a mass event)", () => {
    const result = advance(
      emptyContainmentState(NOW - MINUTE),
      [obs("a", "hard-fail", "x")],
      NOW,
      POLICY,
    );
    expect(BREAKER_MIN_SOURCES).toBeGreaterThan(1);
    expect(result.breakerTripped).toBe(false);
    expect(result.next.sources["a"].state).toBe("quarantined");
  });

  it("restores (→ live) never count toward tripping the breaker", () => {
    let state = emptyContainmentState(NOW - 10 * MINUTE);
    // Seed 5 sources in SUSPECT so a pass flips them all back to live at once.
    for (const id of ["a", "b", "c", "d", "e"]) {
      state = advance(
        state,
        [obs(id, "soft-fail", "stale")],
        NOW - 5 * MINUTE,
        POLICY,
      ).next;
    }
    const result = advance(
      state,
      ["a", "b", "c", "d", "e"].map((id) => obs(id, "pass")),
      NOW,
      POLICY,
    );
    expect(result.breakerTripped).toBe(false);
    expect(result.transitions).toHaveLength(5);
    expect(result.transitions.every((t) => t.to === "live")).toBe(true);
  });

  it("probe-error observations are excluded from the breaker denominator", () => {
    // 2 hard-fails out of 2 real probes (+3 probe-errors) = 100% of probed.
    const result = advance(
      emptyContainmentState(NOW - MINUTE),
      [
        obs("a", "hard-fail", "x"),
        obs("b", "hard-fail", "x"),
        obs("c", "probe-error"),
        obs("d", "probe-error"),
        obs("e", "probe-error"),
      ],
      NOW,
      POLICY,
    );
    // Below BREAKER_MIN_SOURCES real probes → breaker cannot trip; both quarantine.
    expect(result.breakerTripped).toBe(false);
    expect(result.next.sources["a"].state).toBe("quarantined");
    expect(result.next.sources["c"]).toBeDefined();
    expect(result.next.sources["c"].state).toBe("live");
  });
});

describe("distinct-observation restore counting (Auditor change 12)", () => {
  it("re-reads of the SAME DTO never advance restore progress for a slow source", () => {
    // Daily source: quarantined, then probes go green — but it's the same
    // generatedAt every 30 minutes. 10 identical green reads ≠ recovery.
    let s = inState("quarantined", { enteredAt: NOW - 3 * POLICY.minDwellMs });
    s = transition(s, "pass", "", NOW, POLICY, "2026-07-04T04:00Z");
    expect(s.state).toBe("recovering");
    expect(s.consecutivePasses).toBe(1);

    for (let i = 1; i <= 10; i++) {
      s = transition(s, "pass", "", NOW + i * MINUTE, POLICY, "2026-07-04T04:00Z");
    }
    expect(s.state).toBe("recovering");
    expect(s.consecutivePasses).toBe(1);

    // Next day's genuinely new observation completes the restore.
    s = transition(s, "pass", "", NOW + 11 * MINUTE, POLICY, "2026-07-05T04:00Z");
    expect(s.state).toBe("live");
  });

  it("without a distinctKey every pass counts (fast sources keep old semantics)", () => {
    let s = inState("quarantined", { enteredAt: NOW - 3 * POLICY.minDwellMs });
    s = transition(s, "pass", "", NOW, POLICY);
    s = transition(s, "pass", "", NOW + MINUTE, POLICY);
    expect(s.state).toBe("live");
  });
});

describe("aggregate breaker (Auditor change 11) + restores-during-trip", () => {
  const obs = (
    sourceId: string,
    outcome: ProbeObservation["outcome"],
    reason = "",
  ): ProbeObservation => ({ sourceId, outcome, reason });

  it("slow-rolling correlated failure trips on aggregate non-LIVE fraction", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    let state = emptyContainmentState(NOW - 10 * MINUTE);
    // Quarantine 4 of 10 one at a time — each cycle 1 flip / 10 probed =
    // 10%, never tripping the per-cycle condition.
    for (let i = 0; i < 4; i++) {
      const cycle = ids.map((id, idx) =>
        idx === i ? obs(id, "hard-fail", "drift") : obs(id, idx < i ? "soft-fail" : "pass"),
      );
      const r = advance(state, cycle, NOW - (9 - i) * MINUTE, POLICY);
      expect(r.breakerTripped).toBe(false);
      state = r.next;
    }
    // 5th degrade would take aggregate non-LIVE to 5/10 = 50% > 40% → trip:
    // the new hard-fail is NOT applied, existing quarantines stay.
    const r = advance(
      state,
      ids.map((id, idx) =>
        idx === 4 ? obs(id, "hard-fail", "drift") : obs(id, idx < 4 ? "soft-fail" : "pass"),
      ),
      NOW,
      POLICY,
    );
    expect(r.breakerTripped).toBe(true);
    expect(r.next.sources["e"].state).toBe("live");
    expect(r.next.sources["a"].state).toBe("quarantined");
  });

  it("a tripped breaker still applies restores — recovery cannot deadlock", () => {
    let state = emptyContainmentState(NOW - 60 * MINUTE);
    // Seed: one source deep in recovery, ready to restore this cycle.
    state = advance(
      state,
      [obs("recoverer", "hard-fail", "x")],
      NOW - 3 * POLICY.minDwellMs,
      POLICY,
    ).next;
    state = advance(
      state,
      [obs("recoverer", "pass")],
      NOW - 2 * POLICY.minDwellMs,
      POLICY,
    ).next;
    expect(state.sources["recoverer"].state).toBe("recovering");

    // This cycle: mass hard-fail trips the per-cycle breaker, while the
    // recovering source passes its final distinct probe.
    const r = advance(
      state,
      [
        obs("recoverer", "pass"),
        obs("a", "hard-fail", "x"),
        obs("b", "hard-fail", "x"),
        obs("c", "hard-fail", "x"),
        obs("d", "pass"),
      ],
      NOW,
      POLICY,
    );
    expect(r.breakerTripped).toBe(true);
    expect(r.next.sources["recoverer"].state).toBe("live");
    expect(r.next.sources["a"]).toBeUndefined();
    expect(r.transitions).toEqual([
      { sourceId: "recoverer", from: "recovering", to: "live", reason: "" },
    ]);
  });
});

describe("full incident lifecycle (S91 replay shape)", () => {
  it("dead source → quarantine → endpoint fixed → recovery → live, with dwell respected", () => {
    const cycle = 30 * MINUTE;
    let state = emptyContainmentState(NOW - cycle);
    let t = NOW;
    const step = (outcome: ProbeObservation["outcome"], reason = "") => {
      state = advance(
        state,
        [{ sourceId: "openrouter", outcome, reason }],
        t,
        POLICY,
      ).next;
      t += cycle;
    };

    step("pass");
    expect(state.sources["openrouter"].state).toBe("live");

    // Endpoint moves: DTO goes stale cycle after cycle.
    step("soft-fail", "stale beyond budget");
    step("soft-fail", "stale beyond budget");
    expect(state.sources["openrouter"].state).toBe("suspect");
    step("soft-fail", "stale beyond budget");
    expect(state.sources["openrouter"].state).toBe("quarantined");
    const quarantinedAt = state.sources["openrouter"].enteredAt;

    // Fix deploys; probes go green. First green → recovering, not live.
    step("pass");
    expect(state.sources["openrouter"].state).toBe("recovering");

    // Second green: passes threshold met AND dwell (60m) satisfied → live.
    step("pass");
    expect(state.sources["openrouter"].state).toBe("live");
    expect(t - quarantinedAt).toBeGreaterThanOrEqual(POLICY.minDwellMs);
    expect(state.sources["openrouter"].lastGoodAt).toBe(t - cycle);
  });
});
