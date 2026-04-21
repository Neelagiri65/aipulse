/**
 * npm ingest endpoint — cron-driven write side of the npm adoption
 * pipeline. Fetches three rolling windows per tracked AI-SDK package
 * from api.npmjs.org and overwrites `pkg:npm:latest` in Upstash.
 *
 * Auth: shared INGEST_SECRET via the withIngest wrapper.
 *
 * Cadence: every 6 hours at :25 (00:25, 06:25, 12:25, 18:25 UTC) via
 * `.github/workflows/pkg-npm.yml`. Offset 10 min after pkg-pypi (:15)
 * to avoid stampeding Vercel concurrency. 5 packages × 3 windows = 15
 * calls per run — well inside the 120s cap.
 *
 * ok:true iff ≥ 1 package succeeded — partial gaps are surfaced in the
 * failures[] block. ok:false preserves the previous latest blob rather
 * than zeroing the counters.
 */

import { NextResponse } from "next/server";
import { withIngest } from "@/app/api/_lib/withIngest";
import { runNpmIngest } from "@/lib/data/pkg-npm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = withIngest({
  workflow: "pkg-npm",
  run: async () => runNpmIngest(),
  toOutcome: (result) =>
    result.ok
      ? { ok: true, itemsProcessed: result.written }
      : {
          ok: false,
          error:
            result.failures[0]?.message ?? "npm ingest returned no counters",
        },
  toResponse: (result) => NextResponse.json({ ok: result.ok, result }),
});

export const GET = POST;
