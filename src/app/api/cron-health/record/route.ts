/**
 * Cron health record endpoint — write-side companion to /api/cron-health.
 *
 * Used by workflows that can't call writeCronHealth in-process:
 *   - benchmarks-ingest runs an ingest script directly on the Actions
 *     runner and commits the JSON back; no Vercel round-trip.
 *   - labs-cron is a read-side cache warmer that curls /api/labs; the
 *     /api/labs route itself is not an ingest, so wiring writeCronHealth
 *     into it would conflate warm-hit with cron-success.
 *
 * Both post their outcome here after their own work completes. The
 * workflow runner attaches the INGEST_SECRET header so arbitrary
 * posters can't fake a healthy cron.
 *
 * Request shape (JSON body):
 *   { workflow: CronWorkflowName, ok: true, itemsProcessed?: number }
 *   { workflow: CronWorkflowName, ok: false, error: string }
 *
 * Response: { ok: true } on write (including when Redis is unavailable —
 * writeCronHealth swallows its own errors), 400 on bad body, 401 on
 * missing/wrong secret, 503 on unconfigured secret.
 */

import { NextResponse } from "next/server";
import {
  writeCronHealth,
  CRON_WORKFLOWS,
  type CronWorkflowName,
} from "@/lib/data/cron-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false, error: "body must be an object" },
      { status: 400 },
    );
  }
  const b = body as Record<string, unknown>;

  const workflow = b.workflow;
  if (typeof workflow !== "string" || !(workflow in CRON_WORKFLOWS)) {
    return NextResponse.json(
      {
        ok: false,
        error: `workflow must be one of: ${Object.keys(CRON_WORKFLOWS).join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (b.ok === true) {
    const itemsProcessed =
      typeof b.itemsProcessed === "number" && Number.isFinite(b.itemsProcessed)
        ? Math.max(0, Math.floor(b.itemsProcessed))
        : 0;
    await writeCronHealth(workflow as CronWorkflowName, {
      ok: true,
      itemsProcessed,
    });
    return NextResponse.json({ ok: true });
  }

  if (b.ok === false) {
    const error =
      typeof b.error === "string" && b.error.length > 0
        ? b.error
        : "unspecified failure";
    await writeCronHealth(workflow as CronWorkflowName, {
      ok: false,
      error,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { ok: false, error: "body.ok must be true or false" },
    { status: 400 },
  );
}
