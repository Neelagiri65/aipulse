/**
 * PyPI ingest endpoint — cron-driven write side of the PyPI adoption
 * pipeline. Fetches /recent counters for the tracked AI-SDK packages from
 * pypistats.org and overwrites `pkg:pypi:latest` in Upstash.
 *
 * Auth: shared INGEST_SECRET via the withIngest wrapper.
 *
 * Query params:
 *   - source=<string>   Optional attribution tag ("cron" | "manual"). The
 *                       store doesn't persist it today, but the wrapper
 *                       accepts it for symmetry with the HN/RSS routes.
 *
 * Cadence: every 6 hours at :15 (00:15, 06:15, 12:15, 18:15 UTC) via
 * `.github/workflows/pkg-pypi.yml`. Matches the labs-cron tempo and
 * avoids colliding with benchmarks (03:15) / snapshot (04:00). Single
 * run fetches 7 packages × ~500ms each, well inside the 120s cap.
 *
 * ok:true iff ≥ 1 package succeeded — partial gaps are surfaced in the
 * failures[] block. ok:false preserves the previous latest blob rather
 * than zeroing the counters.
 */

import { NextResponse } from "next/server";
import { withIngest } from "@/app/api/_lib/withIngest";
import { runPyPiIngest } from "@/lib/data/pkg-pypi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = withIngest({
  workflow: "pkg-pypi",
  run: async () => runPyPiIngest(),
  toOutcome: (result) =>
    result.ok
      ? { ok: true, itemsProcessed: result.written }
      : {
          ok: false,
          error:
            result.failures[0]?.message ??
            "pypi ingest returned no counters",
        },
  toResponse: (result) => NextResponse.json({ ok: result.ok, result }),
});

export const GET = POST;
