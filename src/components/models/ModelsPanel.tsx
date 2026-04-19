"use client";

import type { HuggingFaceModel, ModelsResult } from "@/lib/data/fetch-models";

export type ModelsPanelProps = {
  data: ModelsResult | undefined;
  error: string | undefined;
  isInitialLoading: boolean;
};

/**
 * Top-20 text-generation models by HuggingFace downloads. Same floating-
 * panel shape as Tool Health: compact rows, source citation at the
 * bottom, "awaiting first poll" amber state until the API returns.
 *
 * Trust contract: no re-ranking, no editorial curation. HF's `downloads`
 * and `likes` are shown verbatim. If the API goes down, we surface the
 * error inline rather than blanking to zero.
 */
export function ModelsPanel({ data, error, isInitialLoading }: ModelsPanelProps) {
  if (isInitialLoading && !data) {
    return (
      <div className="p-3">
        <AwaitingBody />
      </div>
    );
  }

  if (!data || !data.ok || data.models.length === 0) {
    return (
      <div className="p-3">
        <ErrorBody message={error ?? data?.error ?? "No models returned"} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-3 pb-2 pt-3">
        <ul className="space-y-1.5">
          {data.models.map((m, idx) => (
            <ModelRow key={m.id} model={m} rank={idx + 1} />
          ))}
        </ul>
      </div>
      <SourceFooter generatedAt={data.generatedAt} stale={data.stale === true} />
    </div>
  );
}

function ModelRow({ model, rank }: { model: HuggingFaceModel; rank: number }) {
  return (
    <li className="rounded-md border border-border/40 bg-card/30 p-2 text-[11px] leading-snug">
      <div className="flex items-baseline gap-2">
        <span className="w-5 shrink-0 text-right font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          {rank.toString().padStart(2, "0")}
        </span>
        <a
          href={model.hubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 truncate font-medium text-foreground underline-offset-2 hover:underline"
          title={model.id}
        >
          {model.name}
        </a>
        <span
          className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
          title={`${model.downloads.toLocaleString()} downloads (30d)`}
        >
          {formatCount(model.downloads)}↓
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-2 pl-7 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/80">
        <span className="truncate">{model.author}</span>
        {model.likes > 0 && (
          <span title={`${model.likes.toLocaleString()} likes`}>
            ♥ {formatCount(model.likes)}
          </span>
        )}
        {model.lastModified && (
          <span className="ml-auto">{formatRelative(model.lastModified)}</span>
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
          href="https://huggingface.co/models?pipeline_tag=text-generation&sort=downloads"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          hf-models
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
      <p className="mt-1 leading-relaxed">Source verified. Fetching HuggingFace…</p>
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

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
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
