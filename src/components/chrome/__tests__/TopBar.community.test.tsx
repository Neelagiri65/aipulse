/**
 * TopBar — mounts the compact CommunityLink in the right-hand cluster.
 *
 * The link is env-gated inside CommunityLink itself; this test pins the
 * mount point (the header must carry `community-link` when the env var is
 * set) and the graceful absence when it is not. SSR render only — the UTC
 * clock effect never runs, which is fine for a presence check.
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

describe("TopBar — community link mount", () => {
  it("renders the compact Community link in the header when the env var is set", () => {
    process.env[KEY] = "https://discord.gg/test-invite";
    const html = renderToStaticMarkup(<TopBar freshness={freshness} />);
    expect(html).toContain('data-testid="community-link"');
    expect(html).toContain('href="https://discord.gg/test-invite"');
  });

  it("renders no community link when the env var is unset", () => {
    delete process.env[KEY];
    delete process.env[LEGACY];
    const html = renderToStaticMarkup(<TopBar freshness={freshness} />);
    expect(html).not.toContain("community-link");
  });
});
