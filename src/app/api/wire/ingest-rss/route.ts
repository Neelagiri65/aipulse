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
 *
 * Uses withIngest so auth + try/catch + cron-health recording live in
 * one place — same migration pattern as /api/wire/ingest-hn.
 */

import { NextResponse } from "next/server";
import { withIngest } from "@/app/api/_lib/withIngest";
import { runRssIngest } from "@/lib/data/wire-rss";
import { redisRssStore } from "@/lib/data/rss-store";
import { RSS_SOURCES } from "@/lib/data/rss-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = withIngest({
  workflow: "wire-ingest-rss",
  run: async () => {
    return runRssIngest({
      sources: RSS_SOURCES,
      store: redisRssStore,
    });
  },
  toOutcome: (result) => {
    const writtenTotal = result.sources.reduce((n, s) => n + s.written, 0);
    if (result.ok) {
      return { ok: true, itemsProcessed: writtenTotal };
    }
    const firstError = result.sources.find((s) => s.error)?.error ?? null;
    return {
      ok: false,
      error: firstError ?? "ingest returned ok:false",
    };
  },
  toResponse: (result) => NextResponse.json({ ok: result.ok, result }),
});

export const GET = POST;
