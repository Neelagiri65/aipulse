/**
 * Gawk — Single feed card.
 *
 * Renders one Card from the feed. Headline + optional detail +
 * source citation (clickable, new tab, rel="noreferrer") + relative
 * timestamp + severity badge keyed by tier.
 *
 * No client behaviour — pure stateless component. Safe for SSR.
 */

import { FeedCardShareButton } from "@/components/feed/FeedCardShareButton";
import type { Card } from "@/lib/feed/types";

export type FeedCardProps = {
  card: Card;
  /** Reference time for relative-age rendering. Defaults to Date.now() at render time. */
  nowMs?: number;
  /** Hide the share affordance — used by surfaces where sharing isn't
   *  meaningful (the /feed/[cardId] standalone page itself, the digest
   *  email render). Defaults to true so the dashboard surface shows it. */
  showShare?: boolean;
};

export function FeedCard({ card, nowMs, showShare = true }: FeedCardProps) {
  const ts = new Date(card.timestamp).getTime();
  const ref = nowMs ?? Date.now();
  const ageMs = Math.max(0, ref - ts);

  return (
    <article
      className="ap-feed-card"
      data-card-type={card.type}
      data-severity={card.severity}
    >
      <div className="ap-feed-card-meta">
        <SeverityBadge type={card.type} severity={card.severity} />
        <span className="ap-feed-card-age">{formatAge(ageMs)}</span>
      </div>
      <h3 className="ap-feed-card-headline">{card.headline}</h3>
      {card.detail ? (
        <p className="ap-feed-card-detail">{card.detail}</p>
      ) : null}
      <div className="ap-feed-card-footer">
        <a
          className="ap-feed-card-source"
          href={card.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          {card.sourceName} ↗
        </a>
        {showShare ? <FeedCardShareButton card={card} /> : null}
      </div>
    </article>
  );
}

function SeverityBadge({
  type,
  severity,
}: {
  type: Card["type"];
  severity: Card["severity"];
}) {
  return (
    <span
      className="ap-feed-card-badge"
      data-severity={severity}
      data-card-type={type}
    >
      {LABEL[type]}
    </span>
  );
}

const LABEL: Record<Card["type"], string> = {
  TOOL_ALERT: "TOOL ALERT",
  MODEL_MOVER: "MODEL MOVER",
  NEW_RELEASE: "NEW RELEASE",
  SDK_TREND: "SDK TREND",
  NEWS: "NEWS",
  RESEARCH: "RESEARCH",
  LAB_HIGHLIGHT: "LAB HIGHLIGHT",
};

function formatAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
