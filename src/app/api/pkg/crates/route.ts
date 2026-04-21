/**
 * crates.io ingest endpoint — cron-driven write side of the Rust crate
 * adoption pipeline. Fetches /api/v1/crates/{name} for the tracked AI/ML
 * crates and overwrites `pkg:crates:latest` in Upstash.
 *
 * Auth: shared INGEST_SECRET via the withIngest wrapper.
 *
 * Cadence: every 6 hours at :35 (00:35, 06:35, 12:35, 18:35 UTC) via
 * `.github/workflows/pkg-crates.yml`. Offset 10 min after pkg-npm (:25)
 * so the five registry ingests stagger cleanly (pypi :15 / npm :25 /
 * crates :35 / docker :45 / brew :55). 4 crates × 1 call each = 4
 * calls per run — well inside the 120s cap.
 *
 * ok:true iff ≥ 1 crate succeeded; ok:false preserves the previous
 * blob rather than zeroing.
 */

import { NextResponse } from "next/server";
import { withIngest } from "@/app/api/_lib/withIngest";
import { runCratesIngest } from "@/lib/data/pkg-crates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = withIngest({
  workflow: "pkg-crates",
  run: async () => runCratesIngest(),
  toOutcome: (result) =>
    result.ok
      ? { ok: true, itemsProcessed: result.written }
      : {
          ok: false,
          error:
            result.failures[0]?.message ?? "crates ingest returned no counters",
        },
  toResponse: (result) => NextResponse.json({ ok: result.ok, result }),
});

export const GET = POST;
