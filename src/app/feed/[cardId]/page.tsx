/**
 * AI Pulse — Single-card share page.
 *
 * Server component. Resolves a card by id from a fresh derive of the
 * feed; if the card is no longer in the live feed (its hour-bucket
 * has rolled or the underlying snapshot has refreshed past it), shows
 * an honest expired-card fallback.
 *
 * The page is deliberately minimal — its primary purpose is to give
 * an OG-image-friendly URL for sharing. Most readers reach the page
 * via a LinkedIn / X unfurl and click through to the source.
 */

import type { Metadata } from "next";
import Link from "next/link";

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
import { OPENROUTER_SOURCE_CAVEAT } from "@/lib/data/openrouter-types";

import { composeFeed, type FeedSnapshots } from "@/lib/feed/compose";
import type { Card } from "@/lib/feed/types";

const REGISTRIES: SdkAdoptionRegistry[] = [
  "pypi",
  "npm",
  "crates",
  "docker",
  "brew",
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ cardId: string }>;
}): Promise<Metadata> {
  const { cardId } = await params;
  const card = await findCardById(cardId);
  if (!card) {
    return {
      title: "Card expired · AI Pulse",
      description:
        "This card has rolled out of the live feed. See the latest cards on AI Pulse.",
    };
  }
  return {
    title: `${card.headline} · AI Pulse`,
    description: card.detail ?? `Source: ${card.sourceName}.`,
  };
}

export default async function CardPage({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  const card = await findCardById(cardId);

  if (!card) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-12 space-y-4">
        <h1 className="text-xl font-semibold">Card expired</h1>
        <p className="text-sm text-muted-foreground">
          This card has rolled out of the live feed. The underlying data is
          still in AI Pulse — see the latest cards on the home feed.
        </p>
        <p>
          <Link href="/" className="text-[var(--ap-accent,#2dd4bf)] underline">
            ← back to AI Pulse
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12 space-y-6">
      <article
        className="ap-feed-card"
        data-card-type={card.type}
        data-severity={card.severity}
      >
        <div className="ap-feed-card-meta">
          <span
            className="ap-feed-card-badge"
            data-card-type={card.type}
            data-severity={card.severity}
          >
            {card.type.replace("_", " ")}
          </span>
          <time dateTime={card.timestamp} className="ap-feed-card-age">
            {new Date(card.timestamp).toUTCString()}
          </time>
        </div>
        <h1 className="ap-feed-card-headline" style={{ fontSize: "20px" }}>
          {card.headline}
        </h1>
        {card.detail ? (
          <p className="ap-feed-card-detail">{card.detail}</p>
        ) : null}
        <a
          className="ap-feed-card-source"
          href={card.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          {card.sourceName} ↗
        </a>
      </article>

      <p className="text-xs text-muted-foreground">
        AI Pulse · live observatory of the AI ecosystem · every number cites a
        public source ·{" "}
        <Link href="/methodology" className="underline">
          how cards are ranked
        </Link>
      </p>
    </main>
  );
}

async function findCardById(cardId: string): Promise<Card | null> {
  const snapshots = await loadSnapshots();
  const response = composeFeed(snapshots, Date.now());
  return response.cards.find((c) => c.id === cardId) ?? null;
}

async function loadSnapshots(): Promise<FeedSnapshots> {
  const nowIso = new Date().toISOString();
  const [status, models, sdk, hn, research, labs] = await Promise.all([
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
  ]);
  return { status, models, sdk, hn, research, labs };
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
