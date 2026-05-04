/**
 * OG image for /reports/[slug] — the LinkedIn / Twitter unfurl card.
 *
 * Renders a 1200×630 PNG via `next/og` ImageResponse. The hero stat
 * IS the visual lead (it's the editorial headline of the report);
 * the caption is supporting context; the bottom row carries brand +
 * the report window so a sharer-with-no-context still gets "Gawk
 * Genesis Report · April 2026" at a glance.
 *
 * Trust contract: nothing on the OG image is invented. The hero stat
 * + caption are the same operator-written strings that render on the
 * page itself. If the report config is missing the slug, the OG
 * falls back to a brand-only card so the unfurl never 500s.
 *
 * Reuses the `src/app/opengraph-image.tsx` aesthetic (dark
 * background, teal accent, mono brand mark) so the LinkedIn unfurl
 * is visually consistent with the homepage unfurl.
 */

import { ImageResponse } from "next/og";
import {
  isEditorialPlaceholder,
} from "@/lib/reports/types";
import { getReportConfig } from "@/lib/reports/registry";

export const runtime = "nodejs";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "Gawk AI Genesis Report — independent, source-cited AI tooling intelligence";

type OgParams = { slug: string };

export default async function ReportOgImage({
  params,
}: {
  params: Promise<OgParams>;
}) {
  const { slug } = await params;
  const config = getReportConfig(slug);

  // Brand-only fallback for unknown slugs. Never 500 the unfurl —
  // an empty card is better than a broken one in a LinkedIn preview.
  if (!config) {
    return new ImageResponse(<BrandOnlyCard />, { ...size });
  }

  const heroStat = isEditorialPlaceholder(config.hero.stat)
    ? `Gawk AI Genesis Report · ${config.window}`
    : config.hero.stat;
  const heroCaption = isEditorialPlaceholder(config.hero.caption)
    ? null
    : config.hero.caption;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#06080a",
          color: "#e2e8f0",
          padding: "72px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        {/* Top row: brand mark + report kicker, single line */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              background: "#2dd4bf",
              boxShadow: "0 0 24px #2dd4bf",
            }}
          />
          <div
            style={{
              fontSize: "24px",
              letterSpacing: "0.36em",
              fontWeight: 700,
            }}
          >
            GAWK
          </div>
          <div
            style={{
              marginLeft: "auto",
              fontSize: "14px",
              letterSpacing: "0.18em",
              padding: "8px 14px",
              border: "1px solid #2dd4bf",
              color: "#2dd4bf",
            }}
          >
            AI GENESIS REPORT · {config.window.toUpperCase()}
          </div>
        </div>

        {/* Hero stat — the editorial lead */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          <div
            style={{
              fontSize: heroStat.length > 80 ? "44px" : "54px",
              fontWeight: 600,
              lineHeight: 1.18,
              color: "#f1f5f9",
              fontFamily:
                "ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif",
            }}
          >
            {heroStat}
          </div>
          {heroCaption && (
            <div
              style={{
                fontSize: "22px",
                lineHeight: 1.4,
                color: "#94a3b8",
                fontFamily:
                  "ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif",
              }}
            >
              {heroCaption}
            </div>
          )}
        </div>

        {/* Bottom row: trust line + read-more anchor */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: "18px",
            color: "#94a3b8",
          }}
        >
          <div style={{ color: "#cbd5e1" }}>
            Every number cites its public source.
          </div>
          <div>gawk.dev/reports/{config.slug}</div>
        </div>
      </div>
    ),
    { ...size },
  );
}

function BrandOnlyCard() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#06080a",
        color: "#e2e8f0",
        padding: "72px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: "24px",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      <div
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "50%",
          background: "#2dd4bf",
          boxShadow: "0 0 32px #2dd4bf",
        }}
      />
      <div
        style={{
          fontSize: "36px",
          letterSpacing: "0.36em",
          fontWeight: 700,
        }}
      >
        GAWK
      </div>
      <div style={{ fontSize: "20px", color: "#94a3b8" }}>
        AI Genesis Report
      </div>
    </div>
  );
}
