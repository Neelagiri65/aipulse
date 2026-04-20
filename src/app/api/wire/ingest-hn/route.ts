/**
 * Hacker News ingest endpoint — cron-driven write side of the HN
 * pipeline. Fetches recent stories from the Algolia HN API, filters
 * for AI-relevance with deterministic keyword/domain rules, resolves
 * author locations via Firebase HN user profiles, and writes items +
 * authors + wire ZSET to Upstash Redis.
 *
 * Auth: shared INGEST_SECRET (same class as /api/registry/discover
 * and /api/registry/backfill-events).
 *
 * Query params:
 *   - source=<string>   Label for ingest-meta attribution. Default
 *                       "cron". Use "manual" when dispatching by hand.
 *   - cap=<int>         Max AI-relevant stories to keep this run.
 *                       1–20, default 20.
 *
 * Cadence: invoked every 15 minutes via GitHub Actions cron
 * (.github/workflows/wire-ingest-hn.yml). The 5,20,35,50 slot keeps
 * this cron from colliding with the existing ingest jobs.
 */

import { NextResponse } from "next/server";
import { runIngest } from "@/lib/data/wire-hn";

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
  const source = url.searchParams.get("source") ?? "cron";
  const capParam = url.searchParams.get("cap");
  const cap = capParam
    ? clamp(Number.parseInt(capParam, 10) || 20, 1, 20)
    : 20;

  const result = await runIngest({ cap, source });
  return NextResponse.json({ ok: result.ok, result });
}

export async function GET(request: Request) {
  return POST(request);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
