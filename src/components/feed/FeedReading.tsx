/**
 * The reading surface for one feed card (web v2, PRD §8): kicker, headline, the source's own words,
 * the source line, "Why this surfaced" from the locked thresholds, and the two actions. Stateless,
 * safe for SSR; the digest and the deep-link page keep FeedCard.
 */
import { FeedCardShareButton } from "@/components/feed/FeedCardShareButton";
import type { Card } from "@/lib/feed/types";
import { KIND_LABEL, stateWord, whySurfaced } from "@/lib/feed/why-surfaced";

export type FeedReadingProps = {
  card: Card;
  /** Reference time for the relative age (the owner keeps it in state; never Date.now() in render). */
  nowMs: number;
};

function stampUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

export function formatAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function FeedReading({ card, nowMs }: FeedReadingProps) {
  const state = stateWord(card);
  const age = formatAge(nowMs - new Date(card.timestamp).getTime());
  return (
    <article
      className="ap-inset ap-reading"
      data-testid="feed-reading"
      data-card-type={card.type}
      data-card-id={card.id}
      aria-label="Selected card"
    >
      <div className="ap-reading__kicker ap-trow__kicker">
        {KIND_LABEL[card.type]}
        {state ? (
          <>
            {" · "}
            <span className={`ap-word ap-word--${state.tone}`}>{state.word}</span>
          </>
        ) : null}
        {" · "}
        {card.sourceName}
        {" · "}
        {stampUtc(card.timestamp)}
      </div>
      <h2 className="ap-reading__headline">{card.headline}</h2>
      {card.detail ? <p className="ap-reading__body">{card.detail}</p> : null}
      <p className="ap-reading__src">
        <a href={card.sourceUrl} target="_blank" rel="noreferrer">
          {card.sourceName} ↗
        </a>
        {" · "}
        {age}
        {" · "}
        <a href={`/feed/${card.id}`}>permalink</a>
      </p>
      <div className="ap-reading__why">
        <div className="ap-reading__whyhead">Why this surfaced</div>
        <p>{whySurfaced(card)}</p>
      </div>
      <div className="ap-reading__actions">
        <a className="ap-btn-ghost ap-reading__open" href={card.sourceUrl} target="_blank" rel="noreferrer">
          Open the source
        </a>
        <FeedCardShareButton card={card} />
      </div>
    </article>
  );
}
