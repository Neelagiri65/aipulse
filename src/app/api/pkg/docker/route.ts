/**
 * Docker Hub ingest endpoint — cron-driven write side of the container
 * adoption pipeline. Fetches /v2/repositories/{ns}/{name} for the
 * tracked images and overwrites `pkg:docker:latest` in Upstash.
 *
 * Auth: shared INGEST_SECRET via the withIngest wrapper.
 *
 * Cadence: every 6 hours at :45 (00:45, 06:45, 12:45, 18:45 UTC) via
 * `.github/workflows/pkg-docker.yml`. Fourth slot in the 10-minute
 * stagger (pypi :15 / npm :25 / crates :35 / docker :45 / brew :55).
 * 2 images × 1 call each = 2 calls per run.
 *
 * ok:true iff ≥ 1 image succeeded; ok:false preserves the previous blob.
 */

import { NextResponse } from "next/server";
import { withIngest } from "@/app/api/_lib/withIngest";
import { runDockerIngest } from "@/lib/data/pkg-docker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = withIngest({
  workflow: "pkg-docker",
  run: async () => runDockerIngest(),
  toOutcome: (result) =>
    result.ok
      ? { ok: true, itemsProcessed: result.written }
      : {
          ok: false,
          error:
            result.failures[0]?.message ?? "docker ingest returned no counters",
        },
  toResponse: (result) => NextResponse.json({ ok: result.ok, result }),
});

export const GET = POST;
