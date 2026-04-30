"use client";

/**
 * Share affordance on a single feed card.
 *
 * Mirrors digest/SectionShareButton in shape: LinkedIn intent + X
 * intent + Copy-link button with Web Share API → clipboard fallback.
 * Fires the same `share_click` analytics event so dashboard + digest
 * share data aggregates cleanly (per `feedback_iterate_on_real_data`
 * memory — share-method telemetry is a primary input for the next
 * round of distribution decisions).
 *
 * Permalink resolution: builds the absolute URL client-side from
 * `window.location.origin + /feed/{id}` so the same component works in
 * both prod (https://gawk.dev) and preview (https://aipulse-…).
 * Server-render outputs the placeholder URL `/feed/{id}` until the
 * effect resolves origin on mount — which is fine for SEO since search
 * engines index the page itself, not the share popovers.
 */

import { useCallback, useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { buildShareUrl, composeShareText } from "@/lib/email/share-urls";
import type { Card } from "@/lib/feed/types";

export type FeedCardShareButtonProps = {
  card: Card;
};

type Phase = "idle" | "copied" | "error";

const TYPE_LABEL: Record<Card["type"], string> = {
  TOOL_ALERT: "Tool alert",
  MODEL_MOVER: "Model mover",
  NEW_RELEASE: "New release",
  SDK_TREND: "SDK trend",
  NEWS: "News",
  RESEARCH: "Research",
  LAB_HIGHLIGHT: "Lab highlight",
};

export function FeedCardShareButton({
  card,
}: FeedCardShareButtonProps): React.JSX.Element {
  const [permalink, setPermalink] = useState<string>(`/feed/${card.id}`);
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPermalink(`${window.location.origin}/feed/${card.id}`);
  }, [card.id]);

  const text = composeShareText(TYPE_LABEL[card.type], card.headline);
  const liUrl = buildShareUrl({ platform: "linkedin", url: permalink, text });
  const xUrl = buildShareUrl({ platform: "x", url: permalink, text });

  const onCopy = useCallback(async () => {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(permalink);
      track("share_click", { method: "clipboard", cardId: card.id });
      setPhase("copied");
      setTimeout(() => setPhase("idle"), 1500);
    } catch {
      track("share_click", { method: "error", cardId: card.id });
      setPhase("error");
      setTimeout(() => setPhase("idle"), 1500);
    }
  }, [permalink, card.id]);

  return (
    <div
      className="ap-feed-card-share flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
      data-testid={`feed-share-${card.id}`}
    >
      <a
        href={liUrl}
        target="_blank"
        rel="noreferrer noopener"
        onClick={() =>
          track("share_click", { method: "linkedin", cardId: card.id })
        }
        className="rounded border border-border/60 px-1.5 py-0.5 text-muted-foreground hover:border-border hover:text-foreground"
        aria-label="Share on LinkedIn"
      >
        LinkedIn
      </a>
      <a
        href={xUrl}
        target="_blank"
        rel="noreferrer noopener"
        onClick={() => track("share_click", { method: "x", cardId: card.id })}
        className="rounded border border-border/60 px-1.5 py-0.5 text-muted-foreground hover:border-border hover:text-foreground"
        aria-label="Share on X"
      >
        X
      </a>
      <button
        type="button"
        onClick={onCopy}
        className="rounded border border-border/60 px-1.5 py-0.5 text-muted-foreground hover:border-border hover:text-foreground"
        aria-label="Copy card link"
      >
        {phase === "copied"
          ? "Copied"
          : phase === "error"
            ? "Copy failed"
            : "Copy"}
      </button>
    </div>
  );
}
