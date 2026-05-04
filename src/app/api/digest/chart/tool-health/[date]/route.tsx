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
import {
  normalizeToolHealthGrid,
  TOOL_HEALTH_COLORS,
  type ToolHealthCell,
  type ToolHealthGrid,
} from "@/lib/digest/chart-tool-health";
import { readRecentSnapshots, type DailySnapshot } from "@/lib/data/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const TOOL_HEALTH_CHART_SIZE = { width: 720, height: 320 };
export const TOOL_HEALTH_CHART_DAYS = 7;

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

function ToolHealthChart({
  grid,
  date,
}: {
  grid: ToolHealthGrid;
  date: string;
}) {
  const PADDING = 28;
  const HEADER_H = 56;
  const LEGEND_H = 36;
  const ROW_LABEL_W = 168;
  const DAY_LABEL_H = 18;

  const usableW = TOOL_HEALTH_CHART_SIZE.width - PADDING * 2 - ROW_LABEL_W;
  const usableH =
    TOOL_HEALTH_CHART_SIZE.height -
    PADDING * 2 -
    HEADER_H -
    LEGEND_H -
    DAY_LABEL_H;

  const cols = Math.max(1, grid.days.length);
  const rows = Math.max(1, grid.toolIds.length);
  const cellW = Math.floor(usableW / cols);
  const cellH = Math.min(34, Math.floor(usableH / rows));
  const cellGap = 4;

  const dayLabels = grid.days.map((d) => d.slice(5)); // MM-DD

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#06080a",
        color: "#e2e8f0",
        padding: `${PADDING}px`,
        display: "flex",
        flexDirection: "column",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: HEADER_H,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              background: "#2dd4bf",
              boxShadow: "0 0 12px #2dd4bf",
            }}
          />
          <div
            style={{
              fontSize: "14px",
              letterSpacing: "0.32em",
              color: "#94a3b8",
            }}
          >
            GAWK · TOOL HEALTH · 7-DAY
          </div>
        </div>
        <div style={{ fontSize: "14px", color: "#94a3b8" }}>{date}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        {grid.toolIds.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              color: "#64748b",
              fontSize: "16px",
            }}
          >
            No snapshot data available for the past {TOOL_HEALTH_CHART_DAYS} days.
          </div>
        ) : (
          <>
            {grid.toolIds.map((id, ti) => (
              <div
                key={id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: `${cellH + cellGap}px`,
                }}
              >
                <div
                  style={{
                    width: `${ROW_LABEL_W}px`,
                    fontSize: "13px",
                    color: "#cbd5e1",
                    paddingRight: "12px",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {id}
                </div>
                <div style={{ display: "flex", gap: `${cellGap}px` }}>
                  {grid.days.map((d, di) => {
                    const cell: ToolHealthCell | null = grid.cells[ti][di];
                    const colour = cell
                      ? TOOL_HEALTH_COLORS[cell.bucket]
                      : TOOL_HEALTH_COLORS.unknown;
                    return (
                      <div
                        key={d}
                        style={{
                          width: `${cellW - cellGap}px`,
                          height: `${cellH}px`,
                          background: colour,
                          opacity: cell ? 1 : 0.35,
                          borderRadius: "3px",
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}

            <div style={{ display: "flex", marginTop: "6px" }}>
              <div style={{ width: `${ROW_LABEL_W}px` }} />
              <div style={{ display: "flex", gap: `${cellGap}px` }}>
                {dayLabels.map((d) => (
                  <div
                    key={d}
                    style={{
                      width: `${cellW - cellGap}px`,
                      fontSize: "10px",
                      color: "#64748b",
                      textAlign: "center",
                    }}
                  >
                    {d}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: "18px",
          height: LEGEND_H,
          fontSize: "11px",
          color: "#94a3b8",
        }}
      >
        <LegendKey label="OPERATIONAL" colour={TOOL_HEALTH_COLORS.operational} />
        <LegendKey label="DEGRADED" colour={TOOL_HEALTH_COLORS.degraded} />
        <LegendKey label="OUTAGE" colour={TOOL_HEALTH_COLORS.outage} />
        <LegendKey label="NO DATA" colour={TOOL_HEALTH_COLORS.unknown} dim />
      </div>
    </div>
  );
}

function LegendKey({
  label,
  colour,
  dim,
}: {
  label: string;
  colour: string;
  dim?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div
        style={{
          width: "12px",
          height: "12px",
          background: colour,
          opacity: dim ? 0.35 : 1,
          borderRadius: "2px",
        }}
      />
      <span style={{ letterSpacing: "0.18em" }}>{label}</span>
    </div>
  );
}
