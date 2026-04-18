import { AuditClient } from "@/components/audit/AuditClient";

export const metadata = {
  title: "Audit · AI Pulse",
  description:
    "Deterministic redundancy audit for CLAUDE.md files. Pattern matching only — no LLM scoring.",
};

export default function AuditPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-8 space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          CLAUDE.md redundancy audit
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Paste a CLAUDE.md (or any system prompt) and see which instructions
          duplicate Claude Code&rsquo;s built-in system prompt. The check is a
          fixed catalogue of phrase and regex patterns — no LLM, no
          &ldquo;trust score&rdquo;, no editorial judgement. Each pattern cites
          the public source that makes it redundant.
        </p>
        <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="rounded-md border border-border/60 bg-muted/30 px-2 py-1">
            deterministic pattern matching
          </span>
          <span className="rounded-md border border-border/60 bg-muted/30 px-2 py-1">
            no LLM calls
          </span>
          <span className="rounded-md border border-border/60 bg-muted/30 px-2 py-1">
            runs in your browser
          </span>
        </div>
      </header>
      <AuditClient />
    </div>
  );
}
