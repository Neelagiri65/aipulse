/**
 * Registry events-backfill endpoint — discovery via the existing
 * globe-events buffer. Cheap reuse of in-memory data the globe pipeline
 * already paid to ingest, geocode, and AI-config-probe.
 *
 * Auth: shared INGEST_SECRET (same class of write-side cron endpoint as
 * /api/registry/discover and /api/ingest).
 *
 * Query params:
 *   - source=<string>   Label for RegistryMeta.lastDiscoverySource.
 *                       Default "events-backfill". Use "manual" when
 *                       dispatching by hand.
 *   - cap=<int>         Max repos to verify this run. Default 100,
 *                       hard cap 300.
 *   - windowMinutes=<int>  Window of the events buffer to scan. Default
 *                          240 (matches the globe display window).
 *
 * Why a separate endpoint vs folding into /discover: the rate budget
 * profile is different (no Search calls, mostly cached Contents probes)
 * and the cadence should run *between* the 6h Code Search sweeps so
 * registry growth tracks live activity. Keeping the surfaces separate
 * also makes the source attribution honest in RegistryMeta.
 */

import { NextResponse } from "next/server";
import { runEventsBackfill } from "@/lib/data/registry-events-backfill";
import { writeCronHealth } from "@/lib/data/cron-health";

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

  const url = new URL(request.url);
  const source = url.searchParams.get("source") ?? "events-backfill";
  const capParam = url.searchParams.get("cap");
  const windowParam = url.searchParams.get("windowMinutes");

  const cap = capParam
    ? clamp(Number.parseInt(capParam, 10) || 100, 1, 300)
    : 100;
  const windowMinutes = windowParam
    ? clamp(Number.parseInt(windowParam, 10) || 240, 60, 720)
    : 240;

  let result;
  try {
    result = await runEventsBackfill({ source, cap, windowMinutes });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await writeCronHealth("registry-backfill-events", {
      ok: false,
      error: msg,
    });
    throw e;
  }
  await writeCronHealth("registry-backfill-events", {
    ok: true,
    itemsProcessed: result.written,
  });

  return NextResponse.json({ ok: true, result });
}

export async function GET(request: Request) {
  return POST(request);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
