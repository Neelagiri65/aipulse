/**
 * CommunityLink — single-source render for the "Community" external link.
 *
 * Reads `NEXT_PUBLIC_COMMUNITY_URL` at render time, with a fallback to
 * the legacy `NEXT_PUBLIC_DISCORD_INVITE_URL` so existing Vercel envs
 * keep working until they're renamed at next redeploy. The URL carries
 * the active community channel, which today is GitHub Discussions while
 * the Discord server is being provisioned (the original name predates
 * that pivot). When neither is set, renders nothing — graceful
 * degradation per CLAUDE.md, never a broken `href=""`.
 *
 * Both env vars are statically referenced so Next's build-time inlining
 * resolves the fallback chain correctly in client bundles.
 *
 * Two variants:
 *   - "compact" (default): matches the StatusBar / mobile-topbar tone for
 *     placement next to ShareButton.
 *   - "footer": low-emphasis text link, matches PrivacyFooter siblings.
 *
 * No analytics tracking on the click intentionally — community-tab clicks
 * don't carry the same product-decision weight as panel opens or share
 * intent, and the destination platform measures actual visits.
 */

export type CommunityLinkVariant = "compact" | "footer";

export type CommunityLinkProps = {
  variant?: CommunityLinkVariant;
};

export function CommunityLink({
  variant = "compact",
}: CommunityLinkProps = {}): React.JSX.Element | null {
  const url =
    process.env.NEXT_PUBLIC_COMMUNITY_URL ??
    process.env.NEXT_PUBLIC_DISCORD_INVITE_URL;
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
      aria-label="Join the Gawk community discussion"
      className="inline-flex items-center rounded border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
    >
      Community
    </a>
  );
}
