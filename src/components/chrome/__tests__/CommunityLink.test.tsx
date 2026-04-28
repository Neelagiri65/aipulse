/**
 * CommunityLink — env-gated render contract.
 *
 * The component must:
 *  - render nothing when NEXT_PUBLIC_DISCORD_INVITE_URL is unset (graceful
 *    degradation, no broken href="");
 *  - render an external link with the right safety attrs when set;
 *  - support a "footer" variant that drops the button-chrome styling so
 *    the link reads as a plain footer sibling.
 */

import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CommunityLink } from "@/components/chrome/CommunityLink";

const KEY = "NEXT_PUBLIC_DISCORD_INVITE_URL";
const ORIG = process.env[KEY];

afterEach(() => {
  if (ORIG === undefined) delete process.env[KEY];
  else process.env[KEY] = ORIG;
});

describe("CommunityLink", () => {
  it("returns nothing when the invite-URL env var is unset", () => {
    delete process.env[KEY];
    const html = renderToStaticMarkup(<CommunityLink />);
    expect(html).toBe("");
  });

  it("returns nothing when the invite-URL env var is the empty string", () => {
    process.env[KEY] = "";
    const html = renderToStaticMarkup(<CommunityLink />);
    expect(html).toBe("");
  });

  it("renders an external link with target=_blank + rel=noopener noreferrer when set", () => {
    process.env[KEY] = "https://discord.gg/gawk-test";
    const html = renderToStaticMarkup(<CommunityLink />);
    expect(html).toContain('href="https://discord.gg/gawk-test"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Community");
  });

  it('renders the compact variant by default with the chrome button tone', () => {
    process.env[KEY] = "https://discord.gg/gawk-test";
    const html = renderToStaticMarkup(<CommunityLink />);
    expect(html).toContain('data-testid="community-link"');
    expect(html).toContain("font-mono");
  });

  it('renders the footer variant with low-emphasis tone (no button chrome)', () => {
    process.env[KEY] = "https://discord.gg/gawk-test";
    const html = renderToStaticMarkup(<CommunityLink variant="footer" />);
    expect(html).toContain('data-testid="community-link-footer"');
    expect(html).not.toContain("font-mono");
    expect(html).toContain("Community");
  });
});
