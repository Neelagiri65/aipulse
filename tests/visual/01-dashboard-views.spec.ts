import { expect, test } from "@playwright/test";
import {
  openDashboard,
  shot,
  switchTab,
  waitForMapReady,
  waitForWireReady,
} from "./_helpers";

/**
 * Views — the two user-facing top-bar tabs. Each test is independent so
 * a flake in one doesn't hide regressions in the other.
 *
 * The Globe tab was hidden from the nav in session 27 (ViewTabId="globe"
 * still exists in the codebase). No user-facing path to the Globe view
 * currently exists, so its smoke test is retired until the tab returns.
 *
 * Assertions are intentionally light (visible element checks, tab aria-state),
 * not exact-pixel diffs — the suite is a *smoke* harness, not a regression
 * pixel-locker. The value is the screenshot trail under
 * `test-results/screenshots/` for manual eyeballing.
 */

test.describe("dashboard views", () => {
  test("@map — Map renders leaflet tiles + markers", async ({ page }) => {
    await openDashboard(page);
    await switchTab(page, "Map");
    await waitForMapReady(page);
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await shot(page, "view-map");
  });

  // web-v2 phase 2: the full-screen chronological Wire (WirePage) has no desktop entry point —
  // the five primary surfaces are Health · Feed · Map · Rooms · More and the Wire board is the
  // LiveFeed window. Restoring or retiring WirePage on desktop is the founder's call (PR #107).
  test.skip("@wire — The Wire renders chronological feed", async ({ page }) => {
    await openDashboard(page);
    await switchTab(page, "Feed");
    await waitForWireReady(page);
    await expect(page.getByText(/Chronological/).first()).toBeVisible();
    await shot(page, "view-wire", { fullPage: true });
  });

  test("default tab on load is Health", async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByRole("tab", { name: "Health", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
