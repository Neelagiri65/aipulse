/**
 * Active reachability probes for the Tool Health grid — the "measured"
 * half of the dual-signal model (declared status page + live probe).
 *
 * A status page is a *declared claim*; a probe is a *measurement*. We hit
 * each tool's real service endpoint and record whether it answered. The two
 * signals are shown SYMMETRICALLY on the card — neither is "the truth"; a
 * disagreement (page says operational, probe says unreachable) is itself the
 * signal a status page alone hides.
 *
 * TRUST POSTURE (non-negotiable — see CLAUDE.md + prd-trust-harness):
 *   - The probe signal is "REACHABLE", never "up/operational/healthy". A 200
 *     (or any well-formed HTTP response) from an edge proves the service
 *     ANSWERED from our probe location — it cannot prove the backend is
 *     healthy, so we don't claim it.
 *   - A single failed probe NEVER asserts an outage. Publishing a false
 *     "down" about a named company is the fabricated-star breach in reverse
 *     (and worse — reputational). Per the containment PRD, availability
 *     signals get HYSTERESIS: N consecutive fails before a card says
 *     "unreachable". This module's classifier enforces that.
 *   - Latency is round-trip from ONE server (Vercel's region). It's mostly
 *     geography, not tool quality — surfaced as a secondary hint only, with a
 *     sanity ceiling so a routing blip doesn't render as "slow".
 *   - Probe endpoints are UNDOCUMENTED for several tools (healthz / api2
 *     backends). They can change or vanish (cf. the Google-translate
 *     endpoint). Failure degrades to "pending"/last-known — never fabricated.
 */

import type { ToolId } from "@/components/health/tools";

/** How much real application logic a probe exercises — governs how much the
 *  "reachable" signal is worth, disclosed in the UI caveat. */
export type ProbeKind =
  | "api-auth" // hits a real API path; a 401 proves API + auth layer answered (strongest)
  | "api" // hits a real API root that returns a 200/JSON
  | "healthz" // dedicated health endpoint
  | "edge"; // host answers (DNS+TLS+edge up) but not a specific app path (weakest)

export type ProbeTarget = {
  toolId: ToolId;
  /** The endpoint we probe. */
  url: string;
  /** Human label of what we're hitting, shown on the card. */
  host: string;
  kind: ProbeKind;
};

/**
 * One probe target per tool. Every URL was verified by hand to return a
 * well-formed HTTP response (not a connection failure) at authoring time
 * (2026-07-05). See data-sources.ts for the typed entries + caveats.
 */
export const PROBE_TARGETS: readonly ProbeTarget[] = [
  { toolId: "claude-code", url: "https://api.anthropic.com/v1/models", host: "api.anthropic.com", kind: "api-auth" },
  { toolId: "openai-api", url: "https://api.openai.com/v1/models", host: "api.openai.com", kind: "api-auth" },
  { toolId: "codex", url: "https://api.openai.com/v1/models", host: "api.openai.com", kind: "api-auth" },
  { toolId: "copilot", url: "https://api.github.com", host: "api.github.com", kind: "api" },
  { toolId: "windsurf", url: "https://server.codeium.com/healthz", host: "server.codeium.com", kind: "healthz" },
  { toolId: "cursor", url: "https://api2.cursor.sh", host: "api2.cursor.sh", kind: "api" },
] as const;

/** A single recorded probe result. Stored newest-first in Redis. */
export type ProbeSample = {
  /** ISO timestamp of the probe. */
  ts: string;
  /** True when the endpoint returned a well-formed HTTP response (status
   *  1xx-4xx). A 5xx, a connection failure, or a timeout is NOT reachable. */
  reachable: boolean;
  /** HTTP status observed, or 0 for connection failure / timeout. */
  httpStatus: number;
  /** Round-trip milliseconds. */
  latencyMs: number;
};

/** The classified probe signal attached to a tool for display. */
export type ProbeSignal = {
  toolId: ToolId;
  host: string;
  kind: ProbeKind;
  /**
   * reachable  — recent probes answered.
   * unreachable — the last `failThreshold` probes ALL failed (hysteresis).
   * pending    — not enough probe history yet (never asserts anything).
   */
  state: "reachable" | "unreachable" | "pending";
  /** Latency of the most recent SUCCESSFUL probe, or null. */
  latencyMs: number | null;
  /** ISO timestamp of the most recent probe of any outcome, or null. */
  checkedAt: string | null;
  /** Count of consecutive failures at the head of the history. */
  consecutiveFails: number;
  /** Total samples the classification considered. */
  samples: number;
};

/** Consecutive failed probes required before a card asserts "unreachable".
 *  Hysteresis — one blip must never headline a false outage. */
export const PROBE_FAIL_THRESHOLD = 3;

/** Latency above this is treated as a slow/suspect probe, not a clean read.
 *  Undocumented backends occasionally hang; don't render that as tool quality. */
export const PROBE_LATENCY_CEILING_MS = 4000;

/**
 * A well-formed HTTP response means the service answered. Any 1xx-4xx counts
 * as reachable; a 5xx is a server error (not reachable); 0 is a connection
 * failure or timeout (not reachable).
 */
export function isReachableStatus(httpStatus: number): boolean {
  return httpStatus >= 100 && httpStatus < 500;
}

/**
 * Classify a tool's probe history into a display signal with HYSTERESIS.
 *
 * `samples` are newest-first (as stored). "unreachable" is asserted ONLY when
 * the newest `failThreshold` samples are ALL unreachable — a single failure
 * (or a failure with any recent success behind it) stays "reachable". With
 * fewer than `failThreshold` samples we can't meet the bar, so the state is
 * "reachable" if any sample succeeded, else "pending" (never a lone-failure
 * outage claim).
 */
export function classifyProbeHistory(
  target: Pick<ProbeTarget, "toolId" | "host" | "kind">,
  samples: ProbeSample[],
  failThreshold: number = PROBE_FAIL_THRESHOLD,
): ProbeSignal {
  const base = { toolId: target.toolId, host: target.host, kind: target.kind };

  if (samples.length === 0) {
    return { ...base, state: "pending", latencyMs: null, checkedAt: null, consecutiveFails: 0, samples: 0 };
  }

  // Count consecutive failures at the head (newest).
  let consecutiveFails = 0;
  for (const s of samples) {
    if (s.reachable) break;
    consecutiveFails += 1;
  }

  const lastGood = samples.find((s) => s.reachable) ?? null;
  const checkedAt = samples[0]?.ts ?? null;

  // Hysteresis three-way:
  //   - head run of failures ≥ threshold        → unreachable
  //   - otherwise, any successful sample seen    → reachable
  //   - otherwise (all failed but below threshold) → pending (insufficient
  //     evidence — never a lone/early-failure outage claim, and never a
  //     "reachable" with zero successes behind it)
  const state: ProbeSignal["state"] =
    consecutiveFails >= failThreshold ? "unreachable" : lastGood ? "reachable" : "pending";

  return {
    ...base,
    state,
    latencyMs: lastGood ? lastGood.latencyMs : null,
    checkedAt,
    consecutiveFails,
    samples: samples.length,
  };
}

/**
 * Execute a single probe. Never throws — a connection failure or timeout is a
 * recorded `reachable: false` sample, not an exception. Uses a short timeout
 * and no-store so it measures live reachability. Deliberately does NOT send
 * credentials; a 401 from an auth'd endpoint is the intended proof-of-life.
 */
export async function probeOne(
  target: ProbeTarget,
  nowMs: number,
  // MUST exceed PROBE_LATENCY_CEILING_MS: a tool that is alive but slow
  // (2.5–4s under transient load) must record as reachable-but-slow, NOT as a
  // failure — three such "failures" in a row would headline a false outage.
  timeoutMs = 6000,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeSample> {
  const started = nowMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(target.url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: { "user-agent": "gawk-tool-probe/1.0 (+https://gawk.dev)" },
    });
    const latencyMs = Date.now() - started;
    return {
      ts: new Date(nowMs).toISOString(),
      reachable: isReachableStatus(res.status),
      httpStatus: res.status,
      latencyMs,
    };
  } catch {
    const latencyMs = Date.now() - started;
    return {
      ts: new Date(nowMs).toISOString(),
      reachable: false,
      httpStatus: 0,
      latencyMs,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe every target and record each result via the injected `record`
 * callback (kept injectable to avoid a module cycle with status-history and
 * to stay unit-testable). Runs on the cron write-path, never on SSR. All
 * probes fire in parallel; individual failures are already captured as
 * `reachable:false` samples by `probeOne`, so this never rejects.
 */
export async function runAllProbes(
  nowMs: number,
  record: (toolId: ToolId, sample: ProbeSample) => Promise<void>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ probed: number; reachable: number }> {
  let reachable = 0;
  await Promise.all(
    PROBE_TARGETS.map(async (t) => {
      const sample = await probeOne(t, nowMs, 6000, fetchImpl);
      if (sample.reachable) reachable += 1;
      await record(t.toolId, sample).catch(() => {});
    }),
  );
  return { probed: PROBE_TARGETS.length, reachable };
}

/**
 * Read each target's probe history via the injected `read` callback and
 * classify it into a display signal. Runs on the read-path (fetchAllStatus) —
 * a cheap Redis read + pure classification, no live probing.
 */
export async function loadProbeSignals(
  read: (toolId: ToolId) => Promise<ProbeSample[]>,
): Promise<Partial<Record<ToolId, ProbeSignal>>> {
  const out: Partial<Record<ToolId, ProbeSignal>> = {};
  await Promise.all(
    PROBE_TARGETS.map(async (t) => {
      out[t.toolId] = classifyProbeHistory(t, await read(t.toolId));
    }),
  );
  return out;
}
