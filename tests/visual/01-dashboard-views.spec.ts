import { expect, test } from "@playwright/test";
import {
  openDashboard,
  shot,
  switchTab,
  waitForGlobeReady,
  waitForMapReady,
  waitForWireReady,
} from "./_helpers";

/**
 * Views — the three top-bar tabs. Each test is independent so a flake in
 * one (e.g. headless WebGL for Globe) doesn't hide regressions in the others.
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

  test("@globe — The Globe renders three.js canvas", async ({ page }) => {
    await openDashboard(page);
    await switchTab(page, "The Globe");
    await waitForGlobeReady(page);
    await expect(page.locator("canvas").first()).toBeVisible();
    await shot(page, "view-globe");
  });

  test("default tab on load is The Map", async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByRole("tab", { name: "The Map" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
