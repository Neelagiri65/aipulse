/**
 * Integrity layer — Layer 2b: the live probe runner (thin I/O).
 *
 * Fetches each source's live OUTPUT and evaluates it. The fetcher is
 * injected so the whole runner is unit-testable with fake payloads and
 * fault injection — no network in tests. A fetch that throws becomes a
 * critical "unreachable" report rather than taking down the run, so one
 * dead endpoint never blinds the rest of the board.
 */

import { evaluate, type ProbeSpec } from "./evaluate";
import { buildReport, type IntegrityReport } from "./checks";

/** Fetches a URL and returns the parsed JSON payload. Injected so tests
 *  can supply fakes and the runner stays pure of `fetch`. */
export type Fetcher = (url: string) => Promise<unknown>;

export type RunnableSpec = ProbeSpec & { url: string };

export async function runProbes(
  specs: ReadonlyArray<RunnableSpec>,
  fetcher: Fetcher,
  now: number,
): Promise<IntegrityReport[]> {
  return Promise.all(
    specs.map(async (spec) => {
      try {
        const payload = await fetcher(spec.url);
        return evaluate(spec, payload, now);
      } catch (e) {
        return buildReport({
          source: spec.id,
          observedAt: new Date(now).toISOString(),
          checks: [
            {
              name: "reachable",
              ok: false,
              severity: "critical",
              detail: `fetch failed: ${e instanceof Error ? e.message : String(e)}`,
            },
          ],
        });
      }
    }),
  );
}

/** Default fetcher: JSON over HTTP with a short timeout so a hanging
 *  endpoint can't stall the whole probe sweep. */
export function httpJsonFetcher(timeoutMs = 10_000): Fetcher {
  return async (url: string) => {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return res.json();
  };
}

/** Roll a set of reports up into a single board verdict + counts, for the
 *  daily report and the watched-channel alert. Worst verdict wins. */
export function summarise(reports: ReadonlyArray<IntegrityReport>): {
  verdict: IntegrityReport["verdict"];
  counts: Record<IntegrityReport["verdict"], number>;
  failing: IntegrityReport[];
} {
  const counts = { OK: 0, DEGRADED: 0, STALE: 0, FAIL: 0 };
  for (const r of reports) counts[r.verdict] += 1;
  const verdict: IntegrityReport["verdict"] =
    counts.FAIL > 0
      ? "FAIL"
      : counts.STALE > 0
        ? "STALE"
        : counts.DEGRADED > 0
          ? "DEGRADED"
          : "OK";
  const failing = reports.filter((r) => r.verdict !== "OK");
  return { verdict, counts, failing };
}
