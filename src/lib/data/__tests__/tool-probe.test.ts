import { describe, expect, it } from "vitest";

import {
  classifyProbeHistory,
  isReachableStatus,
  PROBE_FAIL_THRESHOLD,
  PROBE_TARGETS,
  type ProbeSample,
} from "@/lib/data/tool-probe";

const T = { toolId: "cursor" as const, host: "api2.cursor.sh", kind: "api" as const };

function sample(reachable: boolean, httpStatus: number, latencyMs = 200, ts = "2026-07-05T12:00:00Z"): ProbeSample {
  return { ts, reachable, httpStatus, latencyMs };
}

describe("isReachableStatus — any well-formed response is reachable, 5xx/0 is not", () => {
  it("1xx-4xx count as reachable (the service answered)", () => {
    for (const code of [200, 301, 401, 403, 404]) expect(isReachableStatus(code)).toBe(true);
  });
  it("5xx and 0 (conn fail/timeout) are NOT reachable", () => {
    for (const code of [500, 502, 503, 0]) expect(isReachableStatus(code)).toBe(false);
  });
});

describe("classifyProbeHistory — hysteresis (never a lone-failure outage)", () => {
  it("empty history → pending, asserts nothing", () => {
    const s = classifyProbeHistory(T, []);
    expect(s.state).toBe("pending");
    expect(s.latencyMs).toBeNull();
    expect(s.checkedAt).toBeNull();
  });

  it("recent success → reachable, surfaces last good latency + checkedAt", () => {
    const s = classifyProbeHistory(T, [sample(true, 200, 180, "2026-07-05T12:05:00Z")]);
    expect(s.state).toBe("reachable");
    expect(s.latencyMs).toBe(180);
    expect(s.checkedAt).toBe("2026-07-05T12:05:00Z");
  });

  it("ONE failure with success behind it stays reachable (a blip is not an outage)", () => {
    const s = classifyProbeHistory(T, [sample(false, 0), sample(true, 200)]);
    expect(s.state).toBe("reachable");
    expect(s.consecutiveFails).toBe(1);
  });

  it("two consecutive failures (< threshold of 3) still stays reachable", () => {
    const s = classifyProbeHistory(T, [sample(false, 0), sample(false, 0), sample(true, 200)]);
    expect(s.state).toBe("reachable");
    expect(s.consecutiveFails).toBe(2);
  });

  it("THRESHOLD consecutive failures at the head → unreachable", () => {
    const fails = Array.from({ length: PROBE_FAIL_THRESHOLD }, () => sample(false, 0));
    const s = classifyProbeHistory(T, [...fails, sample(true, 200)]);
    expect(s.state).toBe("unreachable");
    expect(s.consecutiveFails).toBe(PROBE_FAIL_THRESHOLD);
  });

  it("a 5xx run trips unreachable just like a connection failure", () => {
    const s = classifyProbeHistory(T, [sample(false, 503), sample(false, 502), sample(false, 500)]);
    expect(s.state).toBe("unreachable");
  });

  it("a recovery (newest is success) clears unreachable even with old failures behind", () => {
    const s = classifyProbeHistory(T, [
      sample(true, 200, 150, "2026-07-05T12:10:00Z"),
      sample(false, 0),
      sample(false, 0),
      sample(false, 0),
    ]);
    expect(s.state).toBe("reachable");
    expect(s.consecutiveFails).toBe(0);
    expect(s.latencyMs).toBe(150);
  });

  it("fewer than threshold samples, all failing → pending (never unreachable, never a false reachable)", () => {
    const s = classifyProbeHistory(T, [sample(false, 0), sample(false, 0)]);
    // 2 fails < threshold 3, and zero successes → insufficient evidence.
    expect(s.state).toBe("pending");
  });
});

describe("PROBE_TARGETS — one verified target per grid tool", () => {
  it("covers all six tools with https urls", () => {
    const ids = PROBE_TARGETS.map((t) => t.toolId).sort();
    expect(ids).toEqual(["claude-code", "codex", "copilot", "cursor", "openai-api", "windsurf"]);
    for (const t of PROBE_TARGETS) expect(t.url.startsWith("https://")).toBe(true);
  });
});
