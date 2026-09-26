/**
 * gawk.dev — Site-wide OG image for the dashboard root.
 *
 * Rendered when someone shares https://gawk.dev directly (no /feed/{id}
 * suffix). The per-card OG at /feed/[cardId]/opengraph-image.tsx wins
 * for card share URLs; this one wins for the homepage unfurl.
 *
 * 1200×630 on the site's own warm paper, with the mark at favicon scale beside
 * the name. It was a dark card with a teal pulse and a wordmark reading GAWK:
 * the S40 palette, which the product left behind and the card never did, so
 * every shared link carried an identity two generations old. Deliberately
 * generic — every numeric claim that would change daily lives in the per-card
 * OG, not here.
 */

import { ImageResponse } from "next/og";
import { BrandLockup, og, ogFont } from "@/lib/og-brand";

export const runtime = "nodejs";
export const alt = "gawk.dev — live observatory for the global AI ecosystem";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function SiteOgImage() {
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
        <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
          <BrandLockup />
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              fontSize: "15px",
              letterSpacing: "0.16em",
              padding: "7px 13px",
              borderRadius: "999px",
              border: `1px solid ${og.hair}`,
              color: og.muted,
            }}
          >
            LIVE
          </div>
        </div>

        <div
          style={{
            fontSize: "64px",
            fontWeight: 600,
            lineHeight: 1.12,
            letterSpacing: "-0.028em",
            color: og.ink,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div>Live observatory for the</div>
          <div>global AI ecosystem.</div>
        </div>

        <div
          style={{
            display: "flex",
            width: "100%",
            alignItems: "flex-end",
            fontSize: "22px",
            color: og.muted,
          }}
        >
          <div style={{ marginLeft: "auto", display: "flex" }}>gawk.dev</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
