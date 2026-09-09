"use client";

import type { StatusResult } from "@/lib/data/fetch-status";
import { VERIFIED_SOURCES } from "@/lib/data-sources";
import { deriveSev } from "@/components/chrome/StatusBar";
import { PushAlertToggle } from "@/components/chrome/PushAlertToggle";

export type HeroStripProps = {
  status?: StatusResult;
  variant?: "desktop" | "mobile";
};

export function HeroStrip({ status, variant = "desktop" }: HeroStripProps) {
  const sev = deriveSev(status);
  const total = sev.total;
  const allOp = total > 0 && sev.operational === total;
  const hasOutage = sev.outage > 0;

  // State by shape, colour by word (PRD §7): the mark is solid when everything is operational,
  // hatched otherwise, hollow before the first poll; only the words "operational" / "outage" carry
  // colour, "degraded" stays ink.
  const mark = total === 0 ? "hollow" : allOp ? "solid" : "hatched";
  const word = total === 0 ? "checking" : hasOutage ? "outage" : allOp ? "operational" : "degraded";
  const tone = total === 0 ? "ink" : hasOutage ? "out" : allOp ? "op" : "ink";
  const count = total === 0 ? "" : `${sev.operational}/${total}`;
  const pill = (
    <span className="ap-answer-pill" data-testid="hero-answer-pill">
      <span className={`ap-mark ap-mark--${mark}`} aria-hidden />
      {/* The `{" "}` is load-bearing, not formatting. These are adjacent inline
          spans, so without it the extracted text of the page reads
          "6/6operational" — the site's single most citable number, run into
          the word that qualifies it, for exactly the AI answer engines
          `robots.ts` goes out of its way to invite. It renders identically;
          the layout gap comes from CSS. */}
      {count && <span className="ap-answer-pill__count">{count}</span>}{" "}
      <span className={`ap-word ap-word--${tone}`}>{word}</span>
    </span>
  );

  if (variant === "mobile") {
    return (
      <div className="ap-hero ap-hero--mobile">
        {/* The page's h1. The homepage shipped with no heading tags at all —
            both hero variants were spans — so a crawler had no statement of
            what the page is about. MobileDashboard and Dashboard mount one
            variant each, never both, so this cannot become a duplicate h1. */}
        <h1 className="ap-hero__q">Is your AI coding stack working right now?</h1>
        <div className="flex items-center justify-between">
          {pill}
          <PushAlertToggle />
        </div>
      </div>
    );
  }

  return (
    <div className="ap-hero ap-hero--desktop">
      <div className="flex flex-col gap-0.5">
        <h1 className="ap-hero__q ap-hero__q--lg">Is your AI coding stack working right now?</h1>
        <span className="ap-hero__sub">
          Claude · Cursor · Copilot · Windsurf · OpenAI — tracked from{" "}
          {VERIFIED_SOURCES.length} verified sources.
        </span>
      </div>
      <div className="flex items-center gap-5">
        {pill}
        <PushAlertToggle />
      </div>
    </div>
  );
}
