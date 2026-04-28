/**
 * CommunityLink — single-source render for the "Community" external link.
 *
 * Reads `NEXT_PUBLIC_DISCORD_INVITE_URL` at render time. When unset (the
 * default for any environment that hasn't configured the Discord invite),
 * renders nothing — graceful degradation per CLAUDE.md, never a broken
 * `href=""`.
 *
 * Two variants:
 *   - "compact" (default): matches the StatusBar / mobile-topbar tone for
 *     placement next to ShareButton.
 *   - "footer": low-emphasis text link, matches PrivacyFooter siblings.
 *
 * No analytics tracking on the click intentionally — community-tab clicks
 * don't carry the same product-decision weight as panel opens or share
 * intent, and the Discord side measures actual joins.
 */

export type CommunityLinkVariant = "compact" | "footer";

export type CommunityLinkProps = {
  variant?: CommunityLinkVariant;
};

export function CommunityLink({
  variant = "compact",
}: CommunityLinkProps = {}): React.JSX.Element | null {
  const url = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL;
  if (!url) return null;

  if (variant === "footer") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-foreground"
        data-testid="community-link-footer"
      >
        Community
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="community-link"
      aria-label="Join the Gawk community on Discord"
      className="inline-flex items-center rounded border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
    >
      Community
    </a>
  );
}
