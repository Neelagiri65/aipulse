/**
 * Mobile gate. AI Pulse is a dense HUD-style dashboard whose floating-
 * panel chrome, globe, and ticker are built for viewports ≥ 768px. On
 * narrower screens the main layout is hidden and a full-viewport notice
 * surfaces in its place — pointing the reader at desktop and exposing
 * the live registry URLs so the data is still reachable.
 *
 * Pure-CSS gate: the main app is wrapped in `.ap-desktop-only` which
 * hides below 768px, and this notice lives under `.ap-mobile-only` which
 * only paints below 768px. No JS breakpoint detection — media queries
 * apply at first paint, so there is no hydration flicker.
 */
export function MobileNotice() {
  return (
    <div
      className="ap-mobile-only fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 px-6 py-10 text-center"
      role="alert"
      aria-label="Mobile viewport notice"
    >
      <div className="ap-live-dot" aria-hidden />
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-teal-300">
        AI Pulse
      </div>
      <h1 className="font-mono text-[20px] font-semibold uppercase tracking-wider text-foreground">
        Best viewed on desktop
      </h1>
      <p className="max-w-sm font-mono text-[12px] leading-relaxed text-muted-foreground">
        AI Pulse is a dense observatory for the AI ecosystem — globe,
        floating panels, live ticker. The layout is built for screens
        ≥ 768px wide. Please revisit on a laptop or desktop.
      </p>
      <div className="mt-2 flex flex-col items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">
        <span>Primary sources still reachable:</span>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <a
            href="/data-sources.md"
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:text-foreground hover:underline"
          >
            /data-sources.md
          </a>
          <span className="text-foreground/30">·</span>
          <a
            href="/api/status"
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:text-foreground hover:underline"
          >
            /api/status
          </a>
          <span className="text-foreground/30">·</span>
          <a
            href="/api/rss"
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:text-foreground hover:underline"
          >
            /api/rss
          </a>
        </div>
      </div>
    </div>
  );
}
