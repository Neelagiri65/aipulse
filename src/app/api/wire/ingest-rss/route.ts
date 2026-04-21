/**
 * Regional RSS ingest endpoint — cron-driven write side of the RSS
 * pipeline. Fetches the 5 curated publisher feeds, parses RSS 2.0 /
 * Atom, applies the AI-keyword filter where required, and writes items
 * + per-source status + wire ZSET to Upstash Redis.
 *
 * Auth: shared INGEST_SECRET (same pattern as /api/wire/ingest-hn).
 *
 * Cadence: invoked every 30 minutes via GitHub Actions cron
 * (.github/workflows/rss-ingest.yml). Minute slots 25/55 chosen to
 * avoid collision with the existing HN ingest (5,20,35,50) and the
 * labs cron which fires at minute 0 every six hours.
 */

import { NextResponse } from "next/server";
import { runRssIngest } from "@/lib/data/wire-rss";
import { redisRssStore } from "@/lib/data/rss-store";
import { RSS_SOURCES } from "@/lib/data/rss-sources";
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

  let result;
  try {
    result = await runRssIngest({
      sources: RSS_SOURCES,
      store: redisRssStore,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await writeCronHealth("wire-ingest-rss", { ok: false, error: msg });
    throw e;
  }
  const writtenTotal = result.sources.reduce((n, s) => n + s.written, 0);
  const firstError = result.sources.find((s) => s.error)?.error ?? null;
  await writeCronHealth(
    "wire-ingest-rss",
    result.ok
      ? { ok: true, itemsProcessed: writtenTotal }
      : { ok: false, error: firstError ?? "ingest returned ok:false" },
  );
  return NextResponse.json({ ok: result.ok, result });
}

export async function GET(request: Request) {
  return POST(request);
}
