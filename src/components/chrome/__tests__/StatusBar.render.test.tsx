/**
 * Render test for the StatusBar cron-health segment.
 *
 * Trust-bar fix: when at least one cron is stale, surface BOTH the
 * healthy/total count AND the stale count, so a casual reader doesn't
 * lose the "most are fine" signal in the warning. Previously the bar
 * collapsed to "{N} Crons Stale" and dropped the healthy reference.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusBar } from "@/components/chrome/StatusBar";

const baseFreshness = {
  isInitialLoading: false,
  intervalMs: 60_000,
  lastSuccessAt: Date.now(),
};

describe("StatusBar — cron-health rendering", () => {
  it("shows healthy/total only when nothing is stale", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        freshness={baseFreshness}
        verifiedSourceCount={28}
        pendingSourceCount={0}
        cronHealth={{ total: 16, healthy: 16, stale: 0 }}
      />,
    );
    expect(html).toContain("16/16");
    expect(html).toContain("Crons");
    expect(html).not.toContain("Stale");
  });

  it("shows healthy/total AND stale count when a cron is stale", () => {
    const html = renderToStaticMarkup(
      <StatusBar
        freshness={baseFreshness}
        verifiedSourceCount={28}
        pendingSourceCount={0}
        cronHealth={{ total: 16, healthy: 14, stale: 2 }}
      />,
    );
    expect(html).toContain("14/16");
    expect(html).toContain("Crons");
    expect(html).toContain("Stale");
    // The "2" is in a coloured span next to "Stale".
    expect(html).toMatch(/>2<\/span>\s*Stale/);
  });
});
