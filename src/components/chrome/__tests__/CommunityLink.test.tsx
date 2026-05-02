/**
 * CommunityLink — env-gated render contract.
 *
 * The component must:
 *  - render nothing when neither NEXT_PUBLIC_COMMUNITY_URL nor the legacy
 *    NEXT_PUBLIC_DISCORD_INVITE_URL is set (graceful degradation, no
 *    broken href="");
 *  - prefer NEXT_PUBLIC_COMMUNITY_URL when both are set;
 *  - fall back to NEXT_PUBLIC_DISCORD_INVITE_URL when only the legacy
 *    name is set (so existing Vercel envs keep working until renamed);
 *  - render an external link with the right safety attrs when set;
 *  - support a "footer" variant that drops the button-chrome styling so
 *    the link reads as a plain footer sibling.
 */

import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CommunityLink } from "@/components/chrome/CommunityLink";

const NEW_KEY = "NEXT_PUBLIC_COMMUNITY_URL";
const LEGACY_KEY = "NEXT_PUBLIC_DISCORD_INVITE_URL";
const ORIG_NEW = process.env[NEW_KEY];
const ORIG_LEGACY = process.env[LEGACY_KEY];

function restore(key: string, orig: string | undefined): void {
  if (orig === undefined) delete process.env[key];
  else process.env[key] = orig;
}

afterEach(() => {
  restore(NEW_KEY, ORIG_NEW);
  restore(LEGACY_KEY, ORIG_LEGACY);
});

describe("CommunityLink", () => {
  it("returns nothing when neither env var is set", () => {
    delete process.env[NEW_KEY];
    delete process.env[LEGACY_KEY];
    const html = renderToStaticMarkup(<CommunityLink />);
    expect(html).toBe("");
  });

  it("returns nothing when both env vars are the empty string", () => {
    process.env[NEW_KEY] = "";
    process.env[LEGACY_KEY] = "";
    const html = renderToStaticMarkup(<CommunityLink />);
    expect(html).toBe("");
  });

  it("renders the link from NEXT_PUBLIC_COMMUNITY_URL when set", () => {
    delete process.env[LEGACY_KEY];
    process.env[NEW_KEY] = "https://github.com/Neelagiri65/aipulse/discussions";
    const html = renderToStaticMarkup(<CommunityLink />);
    expect(html).toContain('href="https://github.com/Neelagiri65/aipulse/discussions"');
  });

  it("falls back to the legacy NEXT_PUBLIC_DISCORD_INVITE_URL when the new var is unset", () => {
    delete process.env[NEW_KEY];
    process.env[LEGACY_KEY] = "https://discord.gg/legacy-channel";
    const html = renderToStaticMarkup(<CommunityLink />);
    expect(html).toContain('href="https://discord.gg/legacy-channel"');
  });

  it("prefers the new env var when both are set", () => {
    process.env[NEW_KEY] = "https://github.com/Neelagiri65/aipulse/discussions";
    process.env[LEGACY_KEY] = "https://discord.gg/legacy-channel";
    const html = renderToStaticMarkup(<CommunityLink />);
    expect(html).toContain('href="https://github.com/Neelagiri65/aipulse/discussions"');
    expect(html).not.toContain("legacy-channel");
  });

  it("renders an external link with target=_blank + rel=noopener noreferrer when set", () => {
    process.env[NEW_KEY] = "https://discord.gg/gawk-test";
    const html = renderToStaticMarkup(<CommunityLink />);
    expect(html).toContain('href="https://discord.gg/gawk-test"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Community");
  });

  it('renders the compact variant by default with the chrome button tone', () => {
    process.env[NEW_KEY] = "https://discord.gg/gawk-test";
    const html = renderToStaticMarkup(<CommunityLink />);
    expect(html).toContain('data-testid="community-link"');
    expect(html).toContain("font-mono");
  });

  it('renders the footer variant with low-emphasis tone (no button chrome)', () => {
    process.env[NEW_KEY] = "https://discord.gg/gawk-test";
    const html = renderToStaticMarkup(<CommunityLink variant="footer" />);
    expect(html).toContain('data-testid="community-link-footer"');
    expect(html).not.toContain("font-mono");
    expect(html).toContain("Community");
  });

  it("uses a channel-neutral aria-label so it works for Discord OR GitHub Discussions", () => {
    process.env[NEW_KEY] = "https://github.com/Neelagiri65/aipulse/discussions";
    const html = renderToStaticMarkup(<CommunityLink />);
    expect(html).toContain('aria-label="Join the Gawk community discussion"');
    // Channel-specific copy must NOT leak into accessible names — the URL
    // can flip from Discord to GitHub Discussions to anything else without
    // the screen-reader announcement going stale.
    expect(html).not.toContain("on Discord");
  });
});
