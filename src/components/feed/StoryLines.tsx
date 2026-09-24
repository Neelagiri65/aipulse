/**
 * gawk.dev — the other outlets and threads that reported a card's story (src/lib/stories).
 * Rendered wherever a card is read: the Feed's reading pane, the card permalink page, and FeedCard.
 */
import type { Card } from "@/lib/feed/types";

/** How many outlets are named before the rest become "+N more". */
const STORY_SOURCES_SHOWN = 3;

/**
 * The other outlets and threads that reported this story (src/lib/stories). Every name is a link to
 * that outlet's own article or thread; the only number is a Hacker News score, labelled as points.
 */
export function StoryLines({ story }: { story: NonNullable<Card["story"]> }) {
  const shown = story.sources.slice(0, STORY_SOURCES_SHOWN);
  const more = story.sources.length - shown.length;
  return (
    <div className="ap-feed-card-story" data-testid="feed-card-story">
      {shown.length > 0 ? (
        <p>
          <span className="ap-feed-card-story-label">Also reported by</span>{" "}
          {shown.map((s, i) => (
            <span key={s.url}>
              {i > 0 ? " · " : null}
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.publisher}
              </a>
            </span>
          ))}
          {more > 0 ? <span> · +{more} more</span> : null}
        </p>
      ) : null}
      {story.discussion.length > 0 ? (
        <p>
          <span className="ap-feed-card-story-label">Discussed on</span>{" "}
          {story.discussion.map((d, i) => (
            <span key={d.url}>
              {i > 0 ? " · " : null}
              <a href={d.url} target="_blank" rel="noreferrer">
                {d.site}
                {d.points != null ? ` (${d.points} points)` : ""}
              </a>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

/** The row caption's tail: "+2 outlets · +1 thread", or "" for a card without a story. */
export function storyCaption(card: Card): string {
  if (!card.story) return "";
  const parts: string[] = [];
  const n = card.story.sources.length;
  const t = card.story.discussion.length;
  if (n > 0) parts.push(`+${n} ${n === 1 ? "outlet" : "outlets"}`);
  if (t > 0) parts.push(`+${t} ${t === 1 ? "thread" : "threads"}`);
  return parts.join(" · ");
}
