"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        <label
          htmlFor="audit-input"
          className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
        >
          Paste CLAUDE.md content
        </label>
        <textarea
          id="audit-input"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={14}
          spellCheck={false}
          placeholder="# My Project\n\n- Be concise.\n- No emojis.\n- Don't use placeholder values…"
          className="w-full resize-y rounded-lg border border-border/60 bg-muted/20 p-3 font-mono text-xs leading-relaxed text-foreground/90 outline-none ring-ring/0 transition-colors focus:border-ring/60"
        />
        <div className="mt-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
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
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Loading catalogue…
        </p>
      )}

      {cat.status === "error" && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-rose-400">
          Catalogue failed to load: {cat.message}
        </p>
      )}

      {cat.status === "ready" && !card && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
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
      <Card className="gap-3 border-border/60 bg-card/40 backdrop-blur-sm">
        <CardHeader className="gap-1">
          <CardTitle className="text-sm font-semibold tracking-tight">
            Redundancy score
          </CardTitle>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Share of catalogue weight matched in your file
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-4">
            <span className={cn("text-5xl font-semibold tabular-nums", tone.value)}>
              {card.redundancyScore}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              / 100
            </span>
            <span
              className={cn(
                "rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider",
                tone.badge,
              )}
            >
              {bucket}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 border-t border-border/30 pt-3 font-mono text-[10px] uppercase tracking-wider">
            <div>
              <div className="text-muted-foreground">Patterns matched</div>
              <div className="mt-0.5 text-sm tabular-nums text-foreground">
                {card.matches.length} / {catalogue.length}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Est. token cost</div>
              <div className="mt-0.5 text-sm tabular-nums text-foreground">
                {card.tokenCost.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Skipped (regex err)</div>
              <div className="mt-0.5 text-sm tabular-nums text-foreground">
                {card.skipped.length}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Matched patterns ({card.matches.length})
        </h2>
        {card.matches.length === 0 ? (
          <p className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
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
    <li className="rounded-lg border border-border/60 bg-card/40 p-3 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold tracking-tight text-foreground">
              {match.patternId}
            </span>
            <span className="rounded-md border border-border/40 bg-muted/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              weight {match.weight}
            </span>
          </div>
          {pattern && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {pattern.reason}
            </p>
          )}
          <div className="mt-2 rounded-md border border-border/30 bg-muted/20 p-2 font-mono text-[11px] leading-relaxed text-foreground/80">
            …{match.excerpt}…
          </div>
        </div>
        {pattern && (
          <a
            href={pattern.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            source
          </a>
        )}
      </div>
    </li>
  );
}

function scoreTone(score: number): { value: string; badge: string } {
  if (score < 10)
    return {
      value: "text-emerald-400",
      badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    };
  if (score < 25)
    return {
      value: "text-emerald-300",
      badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    };
  if (score < 50)
    return {
      value: "text-amber-300",
      badge: "border-amber-500/40 bg-amber-500/10 text-amber-200",
    };
  if (score < 75)
    return {
      value: "text-orange-300",
      badge: "border-orange-500/40 bg-orange-500/10 text-orange-200",
    };
  return {
    value: "text-rose-400",
    badge: "border-rose-500/40 bg-rose-500/10 text-rose-200",
  };
}
