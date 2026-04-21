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
  test("@map — The Map renders leaflet tiles + markers", async ({ page }) => {
    await openDashboard(page);
    await switchTab(page, "The Map");
    await waitForMapReady(page);
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await shot(page, "view-map");
  });

  test("@wire — The Wire renders chronological feed", async ({ page }) => {
    await openDashboard(page);
    await switchTab(page, "The Wire");
    await waitForWireReady(page);
    await expect(page.getByText(/Chronological/).first()).toBeVisible();
    await shot(page, "view-wire", { fullPage: true });
  });

  test("default tab on load is The Map", async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByRole("tab", { name: "The Map" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
