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
    return { ok: false, error: "openrouter-rankings ingest returned ok:false" };
  },
  toResponse: (result) => NextResponse.json({ ok: true, result }),
});

export const GET = POST;
