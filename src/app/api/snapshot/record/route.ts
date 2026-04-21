/**
 * Daily snapshot write endpoint — cron-driven capture of today's
 * dashboard state into Upstash for later historical charting.
 *
 * Build + write is bundled into one route because the collection
 * touches Vercel-private state (Redis, status-page cache, fetch-labs)
 * and running it from a GH Actions runner would need every secret to
 * leak into the runner env. Cron just POSTs here; we do the work.
 *
 * Auth: shared INGEST_SECRET. No query params. GET aliases POST so
 * `workflow_dispatch` from the Actions UI works without needing a
 * curl-body edit.
 */

import { NextResponse } from "next/server";
import { withIngest } from "@/app/api/_lib/withIngest";
import {
  buildDailySnapshot,
  writeSnapshot,
  ymdUtc,
} from "@/lib/data/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = withIngest({
  workflow: "daily-snapshot",
  run: async () => {
    const date = ymdUtc();
    const snapshot = await buildDailySnapshot(date);
    await writeSnapshot(snapshot);
    return snapshot;
  },
  toOutcome: (snapshot) => {
    if (snapshot.failures.length > 0) {
      return {
        ok: false,
        error:
          snapshot.failures[0]?.step +
          ": " +
          (snapshot.failures[0]?.message ?? "unknown"),
      };
    }
    // itemsProcessed reads naturally as the registry count — the
    // snapshot's headline input. When registry is null we fall back
    // to the tool count so the value is never a fabrication.
    const items =
      snapshot.registry?.total ?? snapshot.tools.length;
    return { ok: true, itemsProcessed: items };
  },
  toResponse: (snapshot) =>
    NextResponse.json({
      ok: snapshot.failures.length === 0,
      date: snapshot.date,
      capturedAt: snapshot.capturedAt,
      failures: snapshot.failures,
    }),
});

export const GET = POST;
