/**
 * OG image for /reports/[slug] — the LinkedIn / Twitter unfurl card.
 *
 * Renders a 1200×630 PNG via `next/og` ImageResponse. The hero stat
 * IS the visual lead (it's the editorial headline of the report);
 * the caption is supporting context; the bottom row carries brand +
 * the report window so a sharer-with-no-context still gets "gawk.dev
 * Genesis Report · April 2026" at a glance.
 *
 * Trust contract: nothing on the OG image is invented. The hero stat
 * + caption are the same operator-written strings that render on the
 * page itself. If the report config is missing the slug, the OG
 * falls back to a brand-only card so the unfurl never 500s.
 *
 * Reuses the `src/app/opengraph-image.tsx` aesthetic — the site's own
 * warm paper and ink, with the mark at favicon scale — so this unfurl
 * is visually consistent with the homepage one. (The dark background
 * and teal accent this once described went out in #156; the sentence
 * survived the sweep spliced in half and said both things at once.)
 */

import { ImageResponse } from "next/og";
import { BrandLockup, BrandTile, og, ogFont } from "@/lib/og-brand";
import {
  isEditorialPlaceholder,
} from "@/lib/reports/types";
import { getReportConfig } from "@/lib/reports/registry";

export const runtime = "nodejs";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "gawk.dev AI Genesis Report — independent, source-cited AI tooling intelligence";

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
    ? `gawk.dev AI Genesis Report · ${config.window}`
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
          background: og.paper,
          color: og.ink,
          padding: "72px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          fontFamily: ogFont,
        }}
      >
        {/* Top row: brand mark + report kicker, single line */}
        <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
          <BrandLockup tile={48} type={28} />
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              fontSize: "14px",
              letterSpacing: "0.16em",
              padding: "8px 14px",
              borderRadius: "999px",
              border: `1px solid ${og.hair}`,
              color: og.muted,
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
              lineHeight: 1.16,
              letterSpacing: "-0.024em",
              color: og.ink,
              fontFamily: ogFont,
            }}
          >
            {heroStat}
          </div>
          {heroCaption && (
            <div
              style={{
                fontSize: "22px",
                lineHeight: 1.4,
                color: og.ink2,
                fontFamily: ogFont,
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
            width: "100%",
            alignItems: "flex-end",
            fontSize: "18px",
            color: og.muted,
          }}
        >
          <div style={{ display: "flex", color: og.ink2 }}>
            Every number cites its public source.
          </div>
          <div style={{ marginLeft: "auto", display: "flex" }}>
            gawk.dev/reports/{config.slug}
          </div>
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
        background: og.paper,
        color: og.ink,
        padding: "72px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: "24px",
        fontFamily: ogFont,
      }}
    >
      <BrandTile size={96} />
      <div style={{ display: "flex", fontSize: "36px", fontWeight: 600, letterSpacing: "-0.02em" }}>
        gawk.dev
      </div>
      <div style={{ display: "flex", fontSize: "20px", color: og.muted }}>
        AI Genesis Report
      </div>
    </div>
  );
}
