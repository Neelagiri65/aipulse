"use client";

/**
 * Per-section share affordance on the /digest/{date} public page.
 *
 * Mirrors the email's LinkedIn + X action links but with an extra
 * "copy link" option via the Web Share API → clipboard fallback,
 * since this surface is a web page where JS can improve on a plain
 * href. Analytics event fires the same `share_click` name used by
 * the dashboard's ShareButton so the two feeds aggregate cleanly.
 */

import { useCallback, useState } from "react";
import { track } from "@/lib/analytics";
import { buildShareUrl, composeShareText } from "@/lib/email/share-urls";

export type SectionShareButtonProps = {
  sectionId: string;
  sectionTitle: string;
  headline: string;
  permalink: string;
};

type Phase = "idle" | "copied" | "error";

export function SectionShareButton({
  sectionId,
  sectionTitle,
  headline,
  permalink,
}: SectionShareButtonProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>("idle");
  const text = composeShareText(sectionTitle, headline);
  const liUrl = buildShareUrl({ platform: "linkedin", url: permalink, text });
  const xUrl = buildShareUrl({ platform: "x", url: permalink, text });

  const onCopy = useCallback(async () => {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(permalink);
      track("share_click", { method: "clipboard", section: sectionId });
      setPhase("copied");
      setTimeout(() => setPhase("idle"), 1500);
    } catch {
      track("share_click", { method: "error", section: sectionId });
      setPhase("error");
      setTimeout(() => setPhase("idle"), 1500);
    }
  }, [permalink, sectionId]);

  return (
    <div
      className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em]"
      data-testid={`section-share-${sectionId}`}
    >
      <a
        href={liUrl}
        target="_blank"
        rel="noreferrer noopener"
        onClick={() =>
          track("share_click", { method: "linkedin", section: sectionId })
        }
        className="rounded border border-border/60 px-1.5 py-0.5 text-muted-foreground hover:border-border hover:text-foreground"
      >
        Share · LinkedIn
      </a>
      <a
        href={xUrl}
        target="_blank"
        rel="noreferrer noopener"
        onClick={() =>
          track("share_click", { method: "x", section: sectionId })
        }
        className="rounded border border-border/60 px-1.5 py-0.5 text-muted-foreground hover:border-border hover:text-foreground"
      >
        Share · X
      </a>
      <button
        type="button"
        onClick={onCopy}
        className="rounded border border-border/60 px-1.5 py-0.5 text-muted-foreground hover:border-border hover:text-foreground"
      >
        {phase === "copied"
          ? "Copied"
          : phase === "error"
            ? "Copy failed"
            : "Copy link"}
      </button>
    </div>
  );
}
