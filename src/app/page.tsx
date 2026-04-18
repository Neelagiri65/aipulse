import { Globe } from "@/components/globe/Globe";
import { HealthCardGrid } from "@/components/health/HealthCardGrid";
import { VERIFIED_SOURCES, PENDING_SOURCES } from "@/lib/data-sources";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto grid w-full max-w-[1600px] gap-4 px-4 py-4 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
          <LiveFeedPanel />

          <section className="relative h-[min(80vh,900px)] min-h-[520px] overflow-hidden rounded-lg border border-border/60 bg-gradient-to-b from-black/60 to-zinc-950/60">
            <Globe />
          </section>

          <aside className="space-y-4">
            <div>
              <h2 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Tool health
              </h2>
              <HealthCardGrid />
            </div>
          </aside>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-400/20">
            <div className="h-2 w-2 rounded-full bg-teal-400 shadow-[0_0_10px_#2dd4bf]" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">AI Pulse</h1>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Real-time observatory for the global AI ecosystem
            </p>
          </div>
        </div>
        <nav className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>{VERIFIED_SOURCES.length} sources verified</span>
          <span>{PENDING_SOURCES.length} pending</span>
          <a
            href="/data-sources.md"
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noopener noreferrer"
          >
            methodology
          </a>
        </nav>
      </div>
    </header>
  );
}

function LiveFeedPanel() {
  return (
    <aside className="flex h-[min(80vh,900px)] min-h-[520px] flex-col rounded-lg border border-border/60 bg-card/30 p-3 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Live feed
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-wider text-amber-400/80">
          Checkpoint 2
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
        <p>
          Event stream ships with the 30-second GitHub Events polling in
          Checkpoint 2. No synthetic events will be shown here.
        </p>
      </div>
    </aside>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-background/50">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>
          Every number cites its source ·{" "}
          <a
            href="/data-sources.md"
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            data sources
          </a>
        </span>
        <span>Phase 1 MVP · Checkpoint 1</span>
      </div>
    </footer>
  );
}
