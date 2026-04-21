/**
 * Homebrew ingest endpoint — cron-driven write side of the macOS/Linux
 * CLI adoption pipeline. Fetches formulae.brew.sh/api/formula/{name}.json
 * for the tracked formulae and overwrites `pkg:brew:latest`.
 *
 * Auth: shared INGEST_SECRET via the withIngest wrapper.
 *
 * Cadence: every 6 hours at :55 (00:55, 06:55, 12:55, 18:55 UTC) via
 * `.github/workflows/pkg-brew.yml`. Last slot in the 10-minute stagger.
 * 1 formula × 1 call = 1 call per run; trivial.
 *
 * ok:true iff ≥ 1 formula succeeded; ok:false preserves the previous blob.
 */

import { NextResponse } from "next/server";
import { withIngest } from "@/app/api/_lib/withIngest";
import { runBrewIngest } from "@/lib/data/pkg-brew";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = withIngest({
  workflow: "pkg-brew",
  run: async () => runBrewIngest(),
  toOutcome: (result) =>
    result.ok
      ? { ok: true, itemsProcessed: result.written }
      : {
          ok: false,
          error:
            result.failures[0]?.message ?? "brew ingest returned no counters",
        },
  toResponse: (result) => NextResponse.json({ ok: result.ok, result }),
});

export const GET = POST;
