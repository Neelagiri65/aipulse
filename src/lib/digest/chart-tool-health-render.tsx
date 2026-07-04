/**
 * Tool-health chart JSX — extracted from the route so the Satori layout
 * can be rendered locally in tests/scripts with synthetic grids (the
 * 2026-07-05 row-stacking bug was invisible without a real-data render:
 * Satori mishandled a fragment inside a flex column and only the first
 * tool row drew). The route stays IO glue: Redis read -> normalize ->
 * ImageResponse(<ToolHealthChart/>).
 */

import {
  TOOL_HEALTH_COLORS,
  type ToolHealthCell,
  type ToolHealthGrid,
} from "@/lib/digest/chart-tool-health";

export const TOOL_HEALTH_CHART_SIZE = { width: 720, height: 320 };
export const TOOL_HEALTH_CHART_DAYS = 7;

export function ToolHealthChart({
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
  const cellGap = 4;
  // Row height must include the gap, or many-row grids overflow the
  // usable area and push the day axis into the legend (seen at 8 rows).
  const cellH = Math.max(8, Math.min(34, Math.floor(usableH / rows) - cellGap));

  const dayLabels = grid.days.map((d) => d.slice(5)); // MM-DD

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#FAFAF6",
        color: "#16160F",
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
              background: "#2A33C2",
              boxShadow: "0 0 12px #2dd4bf",
            }}
          />
          <div
            style={{
              fontSize: "14px",
              letterSpacing: "0.32em",
              color: "#6B6B5E",
            }}
          >
            GAWK · TOOL HEALTH · DAILY 04:00 UTC SNAPSHOT
          </div>
        </div>
        <div style={{ fontSize: "14px", color: "#6B6B5E" }}>{date}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        {grid.toolIds.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              color: "#6B6B5E",
              fontSize: "16px",
            }}
          >
            No snapshot data available for the past {TOOL_HEALTH_CHART_DAYS} days.
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
            }}
          >
            {grid.toolIds.map((id, ti) => (
              <div
                key={id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  height: `${cellH + cellGap}px`,
                }}
              >
                <div
                  style={{
                    width: `${ROW_LABEL_W}px`,
                    fontSize: "13px",
                    color: "#3A3A30",
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

            <div style={{ display: "flex", width: "100%", marginTop: "6px" }}>
              <div style={{ width: `${ROW_LABEL_W}px` }} />
              <div style={{ display: "flex", gap: `${cellGap}px` }}>
                {dayLabels.map((d) => (
                  <div
                    key={d}
                    style={{
                      width: `${cellW - cellGap}px`,
                      fontSize: "10px",
                      color: "#6B6B5E",
                      textAlign: "center",
                    }}
                  >
                    {d}
                  </div>
                ))}
              </div>
            </div>
          </div>
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
          color: "#6B6B5E",
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
