/**
 * Manual-test ingest endpoint for the Chatbot Arena benchmarks.
 *
 * The production write path for this source is the daily GH Action
 * (.github/workflows/benchmarks-ingest.yml) which invokes
 * scripts/ingest-benchmarks.mts, writes the JSON, and commits. This
 * route exists purely so a developer can pull a live snapshot on
 * demand to sanity-check the HF fetchers without waiting for 03:15 UTC.
 *
 * Auth: shared INGEST_SECRET (same class as /api/wire/ingest-hn and
 * /api/registry/discover). The route returns the computed payload but
 * does NOT write the committed JSON file — Vercel filesystems are
 * ephemeral, and the commit-back is the GH Action's job. Use this
 * response for inspection only.
 */

import { NextResponse } from "next/server";
import { runIngest } from "@/lib/data/benchmarks-ingest";
import type { ArenaRow } from "@/lib/data/benchmarks-lmarena";
import latest from "../../../../../data/benchmarks/lmarena-latest.json";
import previous from "../../../../../data/benchmarks/lmarena-previous.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const requiredSecret = process.env.INGEST_SECRET;
  if (!requiredSecret) {
    return NextResponse.json(
      { ok: false, error: "INGEST_SECRET not configured on server" },
      { status: 503 },
    );
  }
  const provided = request.headers.get("x-ingest-secret");
  if (provided !== requiredSecret) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  // The bundled committed files, so the inspection payload computes the same deltas the cron would.
  const result = await runIngest({
    committed: {
      latest: latest as { meta: { leaderboardPublishDate: string } | null; rows: ArenaRow[] },
      previous: previous as ArenaRow[],
    },
  });
  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return POST(request);
}
