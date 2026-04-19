"use client";

import type { ArxivPaper, ResearchResult } from "@/lib/data/fetch-research";

export type ResearchPanelProps = {
  data: ResearchResult | undefined;
  error: string | undefined;
  isInitialLoading: boolean;
};

/**
 * Top-20 most recent cs.AI / cs.LG papers from arxiv. Same floating-
 * panel shape as Models + Tool Health: compact rows, source citation
 * at the bottom, explicit awaiting / error states.
 *
 * Trust contract: rows echo arxiv's fields verbatim. No citation count,
 * no institutional location enrichment (v2). Ordering is arxiv's
 * own sortByDate=desc — we don't re-rank.
 */
export function ResearchPanel({ data, error, isInitialLoading }: ResearchPanelProps) {
  if (isInitialLoading && !data) {
    return (
      <div className="p-3">
        <AwaitingBody />
      </div>
    );
  }

  if (!data || !data.ok || data.papers.length === 0) {
    return (
      <div className="p-3">
        <ErrorBody message={error ?? data?.error ?? "No papers returned"} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-3 pb-2 pt-3">
        <ul className="space-y-1.5">
          {data.papers.map((p, idx) => (
            <PaperRow key={p.id} paper={p} rank={idx + 1} />
          ))}
        </ul>
      </div>
      <SourceFooter generatedAt={data.generatedAt} stale={data.stale === true} />
    </div>
  );
}

function PaperRow({ paper, rank }: { paper: ArxivPaper; rank: number }) {
  const authorLabel = formatAuthors(paper.authors);
  return (
    <li className="rounded-md border border-border/40 bg-card/30 p-2 text-[11px] leading-snug">
      <div className="flex items-baseline gap-2">
        <span className="w-5 shrink-0 text-right font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          {rank.toString().padStart(2, "0")}
        </span>
        <a
          href={paper.abstractUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 font-medium text-foreground underline-offset-2 hover:underline"
          title={paper.title}
        >
          <span className="line-clamp-2">{paper.title}</span>
        </a>
        <span
          className="shrink-0 rounded border border-border/40 bg-muted/30 px-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
          title={paper.categories.join(", ")}
        >
          {paper.primaryCategory}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-2 pl-7 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/80">
        <span className="min-w-0 flex-1 truncate" title={paper.authors.join(", ")}>
          {authorLabel}
        </span>
        {paper.published && (
          <span className="ml-auto shrink-0">{formatRelative(paper.published)}</span>
        )}
      </div>
    </li>
  );
}

function SourceFooter({ generatedAt, stale }: { generatedAt: string; stale: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border/30 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      <span className="truncate">
        Source:{" "}
        <a
          href="https://arxiv.org/list/cs.AI/recent"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          arxiv-cs.ai+cs.lg
        </a>
      </span>
      <span className={stale ? "text-amber-400/80" : ""}>
        {stale ? "stale · " : ""}
        {formatRelative(generatedAt)}
      </span>
    </div>
  );
}

function AwaitingBody() {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-200/90">
      <p className="ap-label-sm" style={{ color: "var(--sev-degrade)" }}>
        Awaiting first poll
      </p>
      <p className="mt-1 leading-relaxed">Source verified. Fetching arxiv…</p>
    </div>
  );
}

function ErrorBody({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-muted/30 p-2.5 text-xs text-muted-foreground">
      <p className="ap-label-sm">Source unreachable</p>
      <p className="mt-1 leading-relaxed">{message}</p>
    </div>
  );
}

/**
 * ArXiv papers frequently carry 10+ authors; showing a full list blows
 * out the row. Convention matches academic style: first author + "et al."
 * when the list has more than three, otherwise comma-joined.
 */
function formatAuthors(authors: string[]): string {
  if (authors.length === 0) return "—";
  if (authors.length === 1) return authors[0];
  if (authors.length <= 3) return authors.join(", ");
  return `${authors[0]} et al. (+${authors.length - 1})`;
}

function formatRelative(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  } catch {
    return "—";
  }
}
