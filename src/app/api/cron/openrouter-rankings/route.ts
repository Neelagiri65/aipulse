/**
 * Cron route — fetches OpenRouter rankings, writes the live DTO to
 * Redis, appends today's snapshot if absent. Wraps `withIngest` so
 * auth (INGEST_SECRET) + cron-health recording stay consistent with
 * every other ingest endpoint.
 *
 * Cadence: every 6h via `.github/workflows/openrouter-rankings.yml`.
 * The route accepts both POST + GET so workflow_dispatch from the
 * Actions UI works without a curl-body edit.
 */

import { NextResponse } from "next/server";

import { withIngest } from "@/app/api/_lib/withIngest";
import { runOpenRouterIngest } from "@/lib/data/openrouter-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = withIngest({
  workflow: "openrouter-rankings",
  run: async () => runOpenRouterIngest(),
  toOutcome: (result) => {
    if (result.ok) {
      return { ok: true, itemsProcessed: result.rowsWritten };
    }
    return {
      ok: false,
      error: `openrouter-rankings persist rejected: ${result.persistErrors.join("; ")}`,
    };
  },
  // ok mirrors result.ok so the workflow's body-parse step can fail the
  // run when a Redis persist was rejected (HTTP status stays 200 — the
  // cron-health record above is the structured trail).
  toResponse: (result) => NextResponse.json({ ok: result.ok, result }),
});

export const GET = POST;
