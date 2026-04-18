/**
 * Ingest endpoint — triggered by the GH Actions cron (or manually for
 * debugging). Fetches raw events from GH Archive (optional cold-start
 * backfill) and the live Events API, processes them, writes to Redis.
 *
 * Auth: requires INGEST_SECRET env var sent via the `x-ingest-secret`
 * header. Keeps the endpoint from being trivially abuseable even though
 * it only writes to our own Redis.
 *
 * Cold-start behaviour: if ?backfill=1 is passed, also pulls the last
 * 6 hours from GH Archive so the globe populates densely immediately.
 * Otherwise it's a light (~5-page Events API) poll meant for the 5-min
 * cron cadence.
 */

import { NextResponse } from "next/server";
import { runIngest } from "@/lib/data/fetch-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel function timeout. Archive backfill of 6 hours + downstream
// geocoding/probing needs more than the default 10s. Pro plan allows
// up to 300s; we request 60 so light pollers finish quickly and fail
// loud if something is wedged.
export const maxDuration = 60;

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
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const backfill = url.searchParams.get("backfill") === "1";
  const apiPagesParam = url.searchParams.get("pages");
  const apiPages = apiPagesParam
    ? Math.max(1, Math.min(10, Number.parseInt(apiPagesParam, 10) || 5))
    : undefined;

  const result = await runIngest({ archiveBackfill: backfill, apiPages });

  return NextResponse.json({
    ok: true,
    meta: result.meta,
    writtenCount: result.points.length,
  });
}

export async function GET(request: Request) {
  // GET shares POST's auth + side-effect semantics for convenience of
  // curl-triggered debugging and GH Actions "curl -X GET" runs.
  return POST(request);
}
