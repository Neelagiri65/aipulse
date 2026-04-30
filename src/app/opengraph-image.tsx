/**
 * Gawk — Site-wide OG image for the dashboard root.
 *
 * Rendered when someone shares https://gawk.dev directly (no /feed/{id}
 * suffix). The per-card OG at /feed/[cardId]/opengraph-image.tsx wins
 * for card share URLs; this one wins for the homepage unfurl.
 *
 * 1200×630 dark-theme card with the brand pulse + tagline. Deliberately
 * generic — every numeric claim that would change daily lives in the
 * per-card OG, not here.
 */

import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Gawk — live observatory for the global AI ecosystem";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function SiteOgImage() {
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
              fontSize: "26px",
              letterSpacing: "0.36em",
              fontWeight: 700,
            }}
          >
            GAWK
          </div>
          <div
            style={{
              marginLeft: "auto",
              fontSize: "16px",
              letterSpacing: "0.18em",
              padding: "8px 14px",
              border: "1px solid #2dd4bf",
              color: "#2dd4bf",
            }}
          >
            LIVE
          </div>
        </div>

        <div
          style={{
            fontSize: "62px",
            fontWeight: 600,
            lineHeight: 1.15,
            color: "#f1f5f9",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div>Live observatory for the</div>
          <div>global AI ecosystem.</div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: "22px",
            color: "#94a3b8",
          }}
        >
          <div style={{ color: "#cbd5e1" }}>
            Every number cites its public source.
          </div>
          <div>gawk.dev</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
