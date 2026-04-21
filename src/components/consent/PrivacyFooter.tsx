import Link from "next/link";

/**
 * PrivacyFooter — single-line footer link shown on static pages
 * (privacy, subscribe landings). Intentionally minimal: the dashboard
 * itself pins the StatusBar at the top and doesn't need a persistent
 * footer. Static pages without StatusBar need a footprint, though,
 * so "Privacy" and "Source registry" stay one click away.
 */
export function PrivacyFooter() {
  return (
    <footer className="mt-16 border-t border-border/60 py-4 text-center text-[11px] text-muted-foreground">
      <nav className="flex items-center justify-center gap-4">
        <Link
          href="/"
          className="hover:text-foreground"
          data-testid="footer-home"
        >
          AI Pulse
        </Link>
        <Link
          href="/privacy"
          className="hover:text-foreground"
          data-testid="footer-privacy"
        >
          Privacy
        </Link>
        <a
          href="/data-sources.md"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground"
          data-testid="footer-sources"
        >
          Sources
        </a>
      </nav>
    </footer>
  );
}
