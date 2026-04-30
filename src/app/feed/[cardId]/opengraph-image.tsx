/**
 * Gawk — Per-card OG image.
 *
 * 1200×630 dark-theme card built with next/og (no @vercel/og install
 * needed — Next 13.3+ ships ImageResponse natively). Resolves the
 * card by id from a fresh feed derive; falls back to a generic
 * "Card expired" image when the card has rolled out.
 *
 * v1 spec per S40 PRD: dark theme #06080a, teal pulse, Gawk
 * brand, monospace claim text. Iterate after first LinkedIn unfurl.
 */

import { ImageResponse } from "next/og";

import { fetchAllStatus } from "@/lib/data/fetch-status";
import { redisOpenRouterStore } from "@/lib/data/openrouter-store";
import {
  ymdUtc,
  readRecentSnapshots,
} from "@/lib/data/snapshot";
import { readLatest } from "@/lib/data/pkg-store";
import {
  assembleSdkAdoption,
  type SdkAdoptionRegistry,
} from "@/lib/data/sdk-adoption";
import { readWire } from "@/lib/data/hn-store";
import { fetchRecentPapers } from "@/lib/data/fetch-research";
import { fetchLabActivity } from "@/lib/data/fetch-labs";
import { fetchRecentModels } from "@/lib/data/fetch-models";
import { readRecentRedditItems } from "@/lib/data/reddit-feed";
import { OPENROUTER_SOURCE_CAVEAT } from "@/lib/data/openrouter-types";

import { composeFeed, type FeedSnapshots } from "@/lib/feed/compose";
import type { Card } from "@/lib/feed/types";

export const runtime = "nodejs";
export const alt = "Gawk card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const REGISTRIES: SdkAdoptionRegistry[] = [
  "pypi",
  "npm",
  "crates",
  "docker",
  "brew",
  "vscode",
];

const SEVERITY_COLOUR: Record<number, string> = {
  100: "#ef4444",
  80: "#f59e0b",
  60: "#2dd4bf",
  40: "#94a3b8",
  20: "#64748b",
  10: "#475569",
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
          background: "#06080a",
          color: "#e2e8f0",
          padding: "60px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "16px",
              height: "16px",
              borderRadius: "50%",
              background: "#2dd4bf",
              boxShadow: "0 0 16px #2dd4bf",
            }}
          />
          <div
            style={{
              fontSize: "20px",
              letterSpacing: "0.32em",
              fontWeight: 700,
            }}
          >
            GAWK
          </div>
          {card ? (
            <div
              style={{
                marginLeft: "auto",
                fontSize: "16px",
                letterSpacing: "0.18em",
                padding: "6px 12px",
                border: `1px solid ${SEVERITY_COLOUR[card.severity] ?? "#94a3b8"}`,
                color: SEVERITY_COLOUR[card.severity] ?? "#94a3b8",
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
            lineHeight: 1.2,
            color: "#f1f5f9",
            display: "flex",
          }}
        >
          {card ? card.headline : "This card has rolled out of the live feed."}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: "20px",
            color: "#94a3b8",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ color: "#2dd4bf" }}>
              {card ? `Source: ${card.sourceName}` : "Source: gawk.dev"}
            </div>
            {card?.detail ? (
              <div style={{ fontSize: "18px", color: "#cbd5e1" }}>
                {card.detail}
              </div>
            ) : null}
          </div>
          <div>gawk.dev</div>
        </div>
      </div>
    ),
    { ...size },
  );
}

async function findCardById(cardId: string): Promise<Card | null> {
  const snapshots = await loadSnapshots();
  const response = composeFeed(snapshots, Date.now());
  return response.cards.find((c) => c.id === cardId) ?? null;
}

async function loadSnapshots(): Promise<FeedSnapshots> {
  const nowIso = new Date().toISOString();
  const [status, models, sdk, hn, research, labs, hfRecent, reddit] = await Promise.all([
    fetchAllStatus().catch(() => ({
      data: {},
      polledAt: nowIso,
      failures: [],
    })),
    redisOpenRouterStore.readRankingsLatest().then(
      (dto) =>
        dto ?? {
          ordering: "catalogue-fallback" as const,
          generatedAt: nowIso,
          fetchedAt: nowIso,
          rows: [],
          trendingDiffersFromTopWeekly: false,
          sanityWarnings: [],
          sourceCaveat: OPENROUTER_SOURCE_CAVEAT,
        },
      () => ({
        ordering: "catalogue-fallback" as const,
        generatedAt: nowIso,
        fetchedAt: nowIso,
        rows: [],
        trendingDiffersFromTopWeekly: false,
        sanityWarnings: [],
        sourceCaveat: OPENROUTER_SOURCE_CAVEAT,
      }),
    ),
    loadSdk(nowIso),
    readWire().catch(() => ({
      ok: false as const,
      items: [],
      points: [],
      polledAt: nowIso,
      coverage: {
        itemsTotal: 0,
        itemsWithLocation: 0,
        geocodeResolutionPct: 0,
      },
      meta: { lastFetchOkTs: null, staleMinutes: null },
      source: "unavailable" as const,
    })),
    fetchRecentPapers().catch(() => ({
      ok: false as const,
      papers: [],
      generatedAt: nowIso,
    })),
    fetchLabActivity().catch(() => ({
      labs: [],
      generatedAt: nowIso,
      failures: [],
    })),
    fetchRecentModels()
      .then((r) => (r.ok ? r.models : []))
      .catch(() => []),
    readRecentRedditItems(50).catch(
      () => [] as Awaited<ReturnType<typeof readRecentRedditItems>>,
    ),
  ]);
  return { status, models, sdk, hn, research, labs, hfRecent, reddit };
}

async function loadSdk(nowIso: string) {
  try {
    const today = ymdUtc();
    const [snaps, ...latests] = await Promise.all([
      readRecentSnapshots(31),
      ...REGISTRIES.map((r) => readLatest(r)),
    ]);
    const pkgLatest = {
      pypi: latests[0] ?? null,
      npm: latests[1] ?? null,
      crates: latests[2] ?? null,
      docker: latests[3] ?? null,
      brew: latests[4] ?? null,
      vscode: latests[5] ?? null,
    };
    return assembleSdkAdoption({
      pkgLatest,
      snapshots: snaps,
      today,
      windowDays: 30,
      baselineWindow: 30,
      now: () => new Date(),
    });
  } catch {
    return { packages: [], generatedAt: nowIso };
  }
}
