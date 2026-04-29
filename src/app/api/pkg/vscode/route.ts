/**
 * VS Code Marketplace ingest endpoint — cron-driven write side of the
 * VS Code adoption pipeline. POSTs to the catalogue's `extensionquery`
 * for the tracked AI coding-assistant slate and overwrites
 * `pkg:vscode:latest` in Upstash.
 *
 * Auth: shared INGEST_SECRET via the withIngest wrapper.
 *
 * Cadence: every 6 hours at :15 (00:15, 06:15, 12:15, 18:15 UTC) via
 * `.github/workflows/pkg-vscode.yml`. Matches the rest of the pkg-* slate
 * so the snapshot collector at 04:00 UTC reads a freshly-warmed blob.
 *
 * ok:true iff ≥ 1 extension returned an install counter — partial gaps
 * are surfaced in the failures[] block. ok:false preserves the previous
 * latest blob rather than zeroing the counters.
 */

import { NextResponse } from "next/server";
import { withIngest } from "@/app/api/_lib/withIngest";
import { runVSCodeIngest } from "@/lib/data/pkg-vscode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = withIngest({
  workflow: "pkg-vscode",
  run: async () => runVSCodeIngest(),
  toOutcome: (result) =>
    result.ok
      ? { ok: true, itemsProcessed: result.written }
      : {
          ok: false,
          error:
            result.failures[0]?.message ??
            "vscode-marketplace ingest returned no counters",
        },
  toResponse: (result) => NextResponse.json({ ok: result.ok, result }),
});

export const GET = POST;
