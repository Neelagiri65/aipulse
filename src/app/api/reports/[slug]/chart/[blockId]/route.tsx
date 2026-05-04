/**
 * Per-block PNG chart for /reports/[slug] sections.
 *
 * URL: `/api/reports/{slug}/chart/{blockId}`. Renders a small dark-
 * theme PNG (`next/og` ImageResponse) showing the block's rows as
 * a horizontal bar chart with the brand palette. Same primitive as
 * the S62b daily-digest tool-health chart; consistent visual style
 * across all of Gawk's PNG surfaces.
 *
 * Why per-block PNGs (not inline SVG): the page render already shows
 * the row tables verbatim. The PNG is for share-surface consumption —
 * LinkedIn unfurl tile previews + a future "embed any block" pattern
 * where a third-party page can drop in `<img src="/api/reports/.../chart/...">`
 * to mirror a section without scraping the row data.
 *
 * Trust contract:
 *   - Pure plumbing into the existing block resolver. No new fetches,
 *     no LLM, no scoring. Numeric values + labels are the same the
 *     row table prints — the chart is a visual restatement, not a
 *     synthesis.
 *   - Empty-row case renders a "no qualifying rows" placeholder, not
 *     a blank image.
 *   - Per-block sanity warnings (ops-only) are NEVER rendered into
 *     the PNG — same disclosure rule as the public page.
 *
 * Cache strategy:
 *   - Once the report is published, every (slug, blockId) pair is
 *     immutable for the life of that report. Edge-cache aggressively.
 *   - DRAFT reports (publishedAt === "DRAFT") use shorter TTL so
 *     operator iteration stays snappy.
 */

import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { getReportConfig } from "@/lib/reports/registry";
import { loadBlock } from "@/lib/reports/load-block";
import type {
  GenesisBlockId,
  GenesisBlockResult,
} from "@/lib/reports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const REPORT_BLOCK_CHART_SIZE = { width: 720, height: 360 };

const VALID_BLOCK_IDS: ReadonlySet<GenesisBlockId> = new Set<GenesisBlockId>([
  "sdk-adoption-gainers-30d",
  "sdk-adoption-losers-30d",
  "openrouter-rank-climbers-30d",
  "openrouter-rank-fallers-30d",
  "labs-activity-leaders-30d",
  "tool-incidents-30d",
  "agents-velocity-30d",
]);

/** Hex colour palette per block id. Climbers / gainers = teal (positive
 *  signal); fallers / losers = amber-red (negative). Neutral blocks =
 *  slate. Single source of truth so charts stay visually consistent. */
const BLOCK_PALETTE: Record<GenesisBlockId, string> = {
  "sdk-adoption-gainers-30d": "#2dd4bf",
  "sdk-adoption-losers-30d": "#f87171",
  "openrouter-rank-climbers-30d": "#2dd4bf",
  "openrouter-rank-fallers-30d": "#f87171",
  "labs-activity-leaders-30d": "#a855f7",
  "tool-incidents-30d": "#f59e0b",
  "agents-velocity-30d": "#60a5fa",
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string; blockId: string }> },
) {
  const { slug, blockId } = await ctx.params;

  const config = getReportConfig(slug);
  if (!config) {
    return NextResponse.json(
      { ok: false, error: "report not found" },
      { status: 404 },
    );
  }
  if (!VALID_BLOCK_IDS.has(blockId as GenesisBlockId)) {
    return NextResponse.json(
      { ok: false, error: "unknown block id" },
      { status: 404 },
    );
  }

  let block: GenesisBlockResult;
  try {
    block = await loadBlock(blockId as GenesisBlockId);
  } catch {
    block = {
      rows: [],
      generatedAt: new Date().toISOString(),
      sanityWarnings: ["chart loader failed — see admin"],
    };
  }

  const colour = BLOCK_PALETTE[blockId as GenesisBlockId] ?? "#94a3b8";
  const isDraft = config.publishedAt === "DRAFT";

  return new ImageResponse(
    (
      <ReportBlockChart
        config={{ window: config.window, isDraft }}
        block={block}
        blockId={blockId as GenesisBlockId}
        colour={colour}
      />
    ),
    {
      ...REPORT_BLOCK_CHART_SIZE,
      headers: {
        // DRAFT reports: short TTL so operator iteration is snappy.
        // Published reports: aggressive cache (immutable for life of
        // report). Both still allow stale-while-revalidate so a re-
        // publish is reflected within the SWR window.
        "cache-control": isDraft
          ? "public, s-maxage=60, stale-while-revalidate=300"
          : "public, s-maxage=21600, stale-while-revalidate=86400",
      },
    },
  );
}

function ReportBlockChart({
  config,
  block,
  blockId,
  colour,
}: {
  config: { window: string; isDraft: boolean };
  block: GenesisBlockResult;
  blockId: GenesisBlockId;
  colour: string;
}) {
  const PADDING = 28;
  const HEADER_H = 48;
  const ROW_H = 44;
  const ROW_GAP = 8;
  const LABEL_W = 240;

  const rows = block.rows.slice(0, 6);
  const usableW = REPORT_BLOCK_CHART_SIZE.width - PADDING * 2 - LABEL_W;

  // Bar width is proportional to position in the row list (rank-based).
  // Row 0 gets the full bar width; subsequent rows step down. That
  // reads "ranked by what matters most" without needing per-row delta
  // parsing (deltas are formatted strings like "+184% over 11d", not
  // numbers we can scale on without re-parsing).
  const stepFactor = (i: number, total: number) =>
    total <= 1 ? 1 : 1 - (i * 0.5) / Math.max(1, total - 1);

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
              background: colour,
              boxShadow: `0 0 12px ${colour}`,
            }}
          />
          <div
            style={{
              fontSize: "13px",
              letterSpacing: "0.32em",
              color: "#94a3b8",
            }}
          >
            GAWK · {blockId.toUpperCase()}
          </div>
        </div>
        <div style={{ fontSize: "13px", color: "#94a3b8" }}>
          {config.window}
          {config.isDraft ? " · DRAFT" : ""}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        {rows.length === 0 ? (
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
            No qualifying rows for this window.
          </div>
        ) : (
          rows.map((row, i) => {
            const barW = Math.max(40, usableW * stepFactor(i, rows.length));
            return (
              <div
                key={`${row.label}-${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: `${ROW_H}px`,
                  marginBottom: `${ROW_GAP}px`,
                }}
              >
                <div
                  style={{
                    width: `${LABEL_W}px`,
                    fontSize: "13px",
                    color: "#cbd5e1",
                    paddingRight: "12px",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {row.label}
                </div>
                <div
                  style={{
                    width: `${barW}px`,
                    height: "22px",
                    background: colour,
                    opacity: 0.85,
                    borderRadius: "2px",
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: "10px",
                    color: "#06080a",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  {row.value}
                  {row.delta ? ` · ${row.delta}` : ""}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "8px",
          fontSize: "11px",
          color: "#64748b",
        }}
      >
        <span>gawk.dev</span>
        <span>Every number cites its public source.</span>
      </div>
    </div>
  );
}
