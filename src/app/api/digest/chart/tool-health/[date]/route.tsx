/**
 * Digest tool-health 7-day grid PNG.
 *
 * URL: `/api/digest/chart/tool-health/{YYYY-MM-DD}`. Renders a small
 * dark-theme PNG (`next/og` ImageResponse) showing the 5 tracked tools'
 * status across the 7 days ending on `{date}`. Embedded as a plain
 * `<img>` in the daily-digest email and the public /digest/{date}
 * archive page.
 *
 * Trust contract:
 *   - Reads only from the existing daily snapshot store. Pure plumbing
 *     into `normalizeToolHealthGrid` — no scoring, no synthesis, no LLM.
 *   - Missing days render as grey "no data" cells, not as fabricated
 *     green. The legend explicitly labels grey as "no data".
 *   - URL is content-addressed by the date — once a day is past, the
 *     image is immutable, so the response is heavily cached at the edge.
 *
 * Email-safety:
 *   - PNG (not SVG) — Gmail strips inline SVG.
 *   - Public, no auth, no cookies — must load when an email client
 *     fetches the URL from a server with no Gawk session.
 *   - Fixed dimensions matched in the email's `<img width height>` so
 *     mail clients lay out without flicker before the image lands.
 */

import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { normalizeToolHealthGrid } from "@/lib/digest/chart-tool-health";
import {
  ToolHealthChart,
  TOOL_HEALTH_CHART_DAYS,
  TOOL_HEALTH_CHART_SIZE,
} from "@/lib/digest/chart-tool-health-render";
import { readRecentSnapshots, type DailySnapshot } from "@/lib/data/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export { TOOL_HEALTH_CHART_SIZE, TOOL_HEALTH_CHART_DAYS };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** How far back to scan the snapshot index. We need the 7 days ending
 *  on `date`; reading the most-recent 30 covers the case where `date`
 *  is today even with cron drift. */
const SNAPSHOT_LOOKBACK = 30;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ date: string }> },
) {
  const { date } = await ctx.params;
  if (!DATE_RE.test(date)) {
    return NextResponse.json(
      { ok: false, error: "date must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  let snapshots: DailySnapshot[] = [];
  try {
    snapshots = await readRecentSnapshots(SNAPSHOT_LOOKBACK);
  } catch {
    snapshots = [];
  }
  const grid = normalizeToolHealthGrid(
    snapshots,
    date,
    TOOL_HEALTH_CHART_DAYS,
  );

  return new ImageResponse(<ToolHealthChart grid={grid} date={date} />, {
    ...TOOL_HEALTH_CHART_SIZE,
    headers: {
      // Edge-cache aggressively: once a day has rolled over, its grid
      // is immutable. SWR lets the current day refresh without blocking
      // mail clients on a cold render.
      "cache-control":
        "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
