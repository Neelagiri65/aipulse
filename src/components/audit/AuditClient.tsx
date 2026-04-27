"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  bucketForScore,
  score,
  type Match,
  type Pattern,
  type Scorecard,
} from "@/lib/audit/score";

type CatalogueFile = {
  version: number;
  updated_at: string;
  patterns: Pattern[];
};

type CatalogueState =
  | { status: "loading" }
  | { status: "ready"; catalogue: CatalogueFile }
  | { status: "error"; message: string };

export function AuditClient() {
  const [cat, setCat] = useState<CatalogueState>({ status: "loading" });
  const [content, setContent] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/audit/catalogue.json", { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`catalogue returned ${r.status}`);
        return r.json();
      })
      .then((data: CatalogueFile) => setCat({ status: "ready", catalogue: data }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setCat({
          status: "error",
          message: e instanceof Error ? e.message : "failed to load catalogue",
        });
      });
    return () => ctrl.abort();
  }, []);

  const card: Scorecard | null = useMemo(() => {
    if (cat.status !== "ready") return null;
    if (content.trim().length === 0) return null;
    return score(content, cat.catalogue.patterns);
  }, [cat, content]);

  const catalogueMeta =
    cat.status === "ready"
      ? { version: cat.catalogue.version, updated: cat.catalogue.updated_at, count: cat.catalogue.patterns.length }
      : null;

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="audit-input" className="ap-label-sm mb-2 block">
          Paste CLAUDE.md content
        </label>
        <textarea
          id="audit-input"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={14}
          spellCheck={false}
          placeholder="# My Project\n\n- Be concise.\n- No emojis.\n- Don't use placeholder values…"
          className="w-full resize-y rounded border border-white/10 bg-white/[0.02] p-3 font-mono text-xs leading-relaxed text-foreground/90 outline-none transition-colors focus:border-[var(--ap-accent)]/50"
        />
        <div className="ap-label-sm mt-1 flex items-center justify-between">
          <span>{content.length.toLocaleString()} chars</span>
          {catalogueMeta && (
            <span>
              catalogue v{catalogueMeta.version} · {catalogueMeta.count} patterns · updated{" "}
              {catalogueMeta.updated}
            </span>
          )}
        </div>
      </div>

      {cat.status === "loading" && (
        <div
          className="space-y-2"
          role="status"
          aria-label="Loading audit catalogue"
        >
          <div className="h-3 w-48 rounded bg-muted/60 animate-pulse" aria-hidden />
          <div className="h-3 w-64 rounded bg-muted/40 animate-pulse" aria-hidden />
        </div>
      )}

      {cat.status === "error" && (
        <p className="ap-label-sm text-[var(--sev-outage)]">
          Catalogue failed to load: {cat.message}
        </p>
      )}

      {cat.status === "ready" && !card && (
        <p className="ap-label-sm">
          Paste a file above to see its redundancy score.
        </p>
      )}

      {cat.status === "ready" && card && (
        <ScoreSection card={card} catalogue={cat.catalogue.patterns} />
      )}
    </div>
  );
}

function ScoreSection({
  card,
  catalogue,
}: {
  card: Scorecard;
  catalogue: Pattern[];
}) {
  const bucket = bucketForScore(card.redundancyScore);
  const tone = scoreTone(card.redundancyScore);

  const byId = useMemo(() => {
    const map = new Map<string, Pattern>();
    for (const p of catalogue) map.set(p.id, p);
    return map;
  }, [catalogue]);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-[var(--ap-border-strong)] bg-[rgba(11,15,18,0.94)] backdrop-blur-sm shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8),0_0_60px_-20px_var(--ap-accent-glow)]">
        <div className="flex h-7 items-center gap-2 border-b border-[var(--ap-border)] bg-[var(--ap-bg-head)] px-3">
          <span className="h-2 w-2 rounded-full bg-[var(--ap-accent)] shadow-[0_0_6px_var(--ap-accent-glow)]" />
          <span className="ap-label-sm">score · CLAUDE.md audit</span>
        </div>
        <div className="space-y-4 p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Redundancy score
            </h3>
            <p className="ap-label-sm">
              Share of catalogue weight matched in your file
            </p>
          </div>
          <div className="flex items-baseline gap-4">
            <span className={cn("text-5xl font-semibold tabular-nums", tone.value)}>
              {card.redundancyScore}
            </span>
            <span className="ap-label-sm">/ 100</span>
            <span className={tone.pillClass}>{bucket}</span>
          </div>
          <div className="grid grid-cols-3 gap-3 border-t border-white/5 pt-3">
            <div>
              <div className="ap-label-sm">Patterns matched</div>
              <div className="mt-0.5 text-sm tabular-nums text-foreground">
                {card.matches.length} / {catalogue.length}
              </div>
            </div>
            <div>
              <div className="ap-label-sm">Est. token cost</div>
              <div className="mt-0.5 text-sm tabular-nums text-foreground">
                {card.tokenCost.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="ap-label-sm">Skipped (regex err)</div>
              <div className="mt-0.5 text-sm tabular-nums text-foreground">
                {card.skipped.length}
              </div>
            </div>
          </div>
        </div>
      </div>

      <section>
        <h2 className="ap-label-sm mb-2">
          Matched patterns ({card.matches.length})
        </h2>
        {card.matches.length === 0 ? (
          <p className="rounded border border-white/10 bg-white/[0.02] p-3 text-xs text-muted-foreground">
            No catalogue patterns matched. Either the file is clean, or its
            redundancies aren&rsquo;t in the current catalogue.
          </p>
        ) : (
          <ul className="space-y-2">
            {card.matches
              .slice()
              .sort((a, b) => b.weight - a.weight)
              .map((m) => (
                <MatchRow key={m.patternId} match={m} pattern={byId.get(m.patternId)} />
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MatchRow({ match, pattern }: { match: Match; pattern?: Pattern }) {
  return (
    <li className="rounded border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold tracking-tight text-foreground">
              {match.patternId}
            </span>
            <span className="rounded border border-white/15 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ap-fg-muted)]">
              weight {match.weight}
            </span>
          </div>
          {pattern && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {pattern.reason}
            </p>
          )}
          <div className="mt-2 rounded border border-white/5 bg-black/20 p-2 font-mono text-[11px] leading-relaxed text-foreground/80">
            …{match.excerpt}…
          </div>
        </div>
        {pattern && (
          <a
            href={pattern.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="ap-label-sm shrink-0 underline decoration-dotted underline-offset-2 transition-colors hover:text-[var(--ap-accent)]"
          >
            source
          </a>
        )}
      </div>
    </li>
  );
}

function scoreTone(score: number): { value: string; pillClass: string } {
  if (score < 25)
    return {
      value: "text-[var(--sev-op)]",
      pillClass: "ap-sev-pill ap-sev-pill--op",
    };
  if (score < 50)
    return {
      value: "text-[var(--sev-regress)]",
      pillClass: "ap-sev-pill ap-sev-pill--regress",
    };
  if (score < 75)
    return {
      value: "text-[var(--sev-degrade)]",
      pillClass: "ap-sev-pill ap-sev-pill--degrade",
    };
  return {
    value: "text-[var(--sev-outage)]",
    pillClass: "ap-sev-pill ap-sev-pill--outage",
  };
}
