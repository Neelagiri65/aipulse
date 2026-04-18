import { Dashboard } from "@/components/dashboard/Dashboard";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1">
        <Dashboard />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-background/50">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>
          Every number cites its source ·{" "}
          <a
            href="/data-sources.md"
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            data sources
          </a>
        </span>
        <span>Phase 1 MVP · Checkpoint 2</span>
      </div>
    </footer>
  );
}
