/**
 * gawk.dev — Per-card OG image.
 *
 * 1200×630 dark-theme card built with next/og (no @vercel/og install
 * needed — Next 13.3+ ships ImageResponse natively). Resolves the
 * card by id from a fresh feed derive; falls back to a generic
 * "Card expired" image when the card has rolled out.
 *
 * Was the S40 palette: dark #06080a, a teal pulse, a wordmark reading GAWK.
 * Now the site's own warm paper, with the mark at favicon scale.
 * brand, monospace claim text. Iterate after first LinkedIn unfurl.
 */

import { ImageResponse } from "next/og";
import { BrandLockup, og, ogFont } from "@/lib/og-brand";


import { findFeedCard } from "@/lib/feed/load";
import type { Card } from "@/lib/feed/types";

export const runtime = "nodejs";
export const alt = "gawk.dev card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Severity, on the site's own ramp rather than Tailwind's defaults.
 *
 * These are a chip's border and text on warm paper, so the middle steps are the
 * darker cut of each hue: #f59e0b measures about 1.9:1 on #FAFAF6, and a label at
 * that contrast is decoration rather than a word. The low steps take the ink ramp,
 * because "not much happened" should recede instead of taking a colour.
 */
const SEVERITY_COLOUR: Record<number, string> = {
  100: "#C0392B",
  80: "#8A6100",
  60: "#157A40",
  40: "#6B6B5E",
  20: "#6B6B5E",
  10: "#6B6B5E",
};

export default async function CardOgImage({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  const card = await findCardById(cardId).catch(() => null);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: og.paper,
          color: og.ink,
          padding: "60px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          fontFamily: ogFont,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
          <BrandLockup tile={44} type={26} />
          {card ? (
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                fontSize: "16px",
                letterSpacing: "0.16em",
                padding: "6px 13px",
                borderRadius: "999px",
                border: `1px solid ${SEVERITY_COLOUR[card.severity] ?? og.muted}`,
                color: SEVERITY_COLOUR[card.severity] ?? og.muted,
              }}
            >
              {card.type.replace("_", " ")}
            </div>
          ) : null}
        </div>

        <div
          style={{
            fontSize: card ? "52px" : "48px",
            fontWeight: 600,
            lineHeight: 1.16,
            letterSpacing: "-0.024em",
            color: og.ink,
            display: "flex",
          }}
        >
          {card ? card.headline : "This card has rolled out of the live feed."}
        </div>

        <div
          style={{
            display: "flex",
            width: "100%",
            alignItems: "flex-end",
            fontSize: "20px",
            color: og.muted,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", color: og.accent }}>
              {card ? `Source: ${card.sourceName}` : "Source: gawk.dev"}
            </div>
            {card?.detail ? (
              <div style={{ display: "flex", fontSize: "18px", color: og.ink2 }}>
                {card.detail}
              </div>
            ) : null}
          </div>
          <div style={{ marginLeft: "auto", display: "flex" }}>gawk.dev</div>
        </div>
      </div>
    ),
    { ...size },
  );
}

async function findCardById(cardId: string): Promise<Card | null> {
  return findFeedCard(cardId);
}
