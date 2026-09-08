/**
 * TopBar — the Community entry point is the tab, not a second chip.
 *
 * #106 mounted a compact CommunityLink in the right-hand cluster; the five-tab chrome that
 * landed later made "Community" a primary tab carrying the Discord mark. Two doors to the same
 * room on one bar is the duplicate-panel trap, so the chip is gone. This test pins that: the tab
 * is present with its mark, and no `community-link` chip is rendered whether or not the invite
 * env var is set. SSR render only — the UTC clock effect never runs, which suits a presence check.
 */

import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TopBar } from "@/components/chrome/TopBar";

const KEY = "NEXT_PUBLIC_COMMUNITY_URL";
const LEGACY = "NEXT_PUBLIC_DISCORD_INVITE_URL";
const ORIG = process.env[KEY];
const ORIG_LEGACY = process.env[LEGACY];

afterEach(() => {
  if (ORIG === undefined) delete process.env[KEY];
  else process.env[KEY] = ORIG;
  if (ORIG_LEGACY === undefined) delete process.env[LEGACY];
  else process.env[LEGACY] = ORIG_LEGACY;
});

const freshness = { isInitialLoading: false, intervalMs: 60_000 };

describe("TopBar — the Community entry point", () => {
  it("carries the Community tab with the Discord mark", () => {
    const html = renderToStaticMarkup(<TopBar freshness={freshness} />);
    expect(html).toContain("Community");
    expect(html).toContain("ap-tab-mark");
  });

  it("does not also mount a community chip when the invite is set", () => {
    process.env[KEY] = "https://discord.gg/test-invite";
    const html = renderToStaticMarkup(<TopBar freshness={freshness} />);
    expect(html).not.toContain('data-testid="community-link"');
    expect(html).not.toContain("https://discord.gg/test-invite");
  });

  it("renders no community chip when the env var is unset either", () => {
    delete process.env[KEY];
    delete process.env[LEGACY];
    const html = renderToStaticMarkup(<TopBar freshness={freshness} />);
    expect(html).not.toContain("community-link");
  });
});
