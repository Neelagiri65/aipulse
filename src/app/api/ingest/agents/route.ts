/**
 * Agents-panel ingest endpoint — cron-driven write side of the
 * agents-framework adoption pipeline. Fetches PyPI / npm / GitHub
 * meta for the eight tracked frameworks and overwrites both
 * `agents:latest` and `agents:snapshot:{today}` in Upstash.
 *
 * Auth: shared INGEST_SECRET via the withIngest wrapper.
 *
 * Cadence: daily at 06:30 UTC via `.github/workflows/agents-ingest.yml`.
 * Why daily? PyPI's pypistats.org rolls its `last_week` window once per
 * day; sub-daily polling is wasted work. Single run is ~16 calls
 * (8 frameworks × {pypi, github} for the 6 alive + 2 tombstones, plus
 * 2 npm calls for the multi-language frameworks), well inside the 60s
 * cap.
 *
 * ok:true iff at least one framework had any usable field land. ok:false
 * preserves the previous `agents:latest` blob rather than zeroing the
 * panel — fail-loud at the workflow layer (curl-and-parse ok:false from
 * the response body, mirroring the daily-digest pattern from S49).
 */

import { NextResponse } from "next/server";
import { withIngest } from "@/app/api/_lib/withIngest";
import { runAgentsIngest } from "@/lib/data/agents-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withIngest({
  workflow: "agents-ingest",
  run: async () => runAgentsIngest(),
  toOutcome: (result) =>
    result.ok
      ? { ok: true, itemsProcessed: result.succeeded }
      : {
          ok: false,
          error: `agents ingest: 0/${result.attempted} frameworks succeeded`,
        },
  toResponse: (result) => NextResponse.json({ ok: result.ok, result }),
});

export const GET = POST;
