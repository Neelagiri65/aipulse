/**
 * gawk.dev — Single-card share page.
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

import { CardSummary } from "@/components/feed/CardSummary";
import { StoryLines } from "@/components/feed/StoryLines";


import { findFeedCard } from "@/lib/feed/load";
import type { Card } from "@/lib/feed/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ cardId: string }>;
}): Promise<Metadata> {
  const { cardId } = await params;
  const card = await findCardById(cardId);
  const permalink = `/feed/${cardId}`;

  if (!card) {
    const expiredTitle = "Card expired · gawk.dev";
    const expiredDesc =
      "This card has rolled out of the live feed. See the latest cards on gawk.dev.";
    return {
      title: expiredTitle,
      description: expiredDesc,
      openGraph: {
        type: "article",
        siteName: "gawk.dev",
        title: expiredTitle,
        description: expiredDesc,
        url: permalink,
      },
      twitter: {
        card: "summary_large_image",
        title: expiredTitle,
        description: expiredDesc,
      },
    };
  }

  const title = `${card.headline} · gawk.dev`;
  const description = card.detail ?? `Source: ${card.sourceName}.`;
  return {
    title,
    description,
    openGraph: {
      type: "article",
      siteName: "gawk.dev",
      title,
      description,
      url: permalink,
      // Citing the upstream source name as a soft byline. LinkedIn
      // surfaces it under the unfurl preview when present.
      authors: [card.sourceName],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    alternates: {
      canonical: permalink,
    },
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
          still in gawk.dev — see the latest cards on the home feed.
        </p>
        <p>
          <Link href="/" className="text-[var(--ap-accent)] underline">
            ← back to gawk.dev
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
        <CardSummary card={card} />
        {card.story ? <StoryLines story={card.story} /> : null}
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
        gawk.dev · live observatory of the AI ecosystem
      </p>
    </main>
  );
}

async function findCardById(cardId: string): Promise<Card | null> {
  return findFeedCard(cardId);
}
