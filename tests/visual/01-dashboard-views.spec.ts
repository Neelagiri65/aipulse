import { expect, test } from "@playwright/test";
import {
  openDashboard,
  shot,
  switchTab,
  openFeedWire,
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

  // web-v2: the chronological Wire lives inside Feed as the "Wire" view (`?view=wire`).
  test("@wire — Feed › Wire renders the chronological wire", async ({ page }) => {
    await openDashboard(page);
    await switchTab(page, "Feed");
    await openFeedWire(page);
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

  test("Health carries the world-in-marks band; tapping it opens Map", async ({ page }) => {
    await openDashboard(page);
    const band = page.getByTestId("world-band");
    await expect(band).toBeVisible();
    // The band never claims without its provenance: caption, legend and the ODbL land-mask
    // attribution are visible text, not a title attribute.
    await expect(band).toContainText("Where events landed");
    await expect(band).toContainText("© OpenStreetMap contributors");
    await expect(band).toContainText("solid = an event landed here");
    // A cell is drawn for every land cell even before the poll answers, so the SVG is never empty.
    const svg = band.locator("svg.ap-worldband__svg");
    expect(await svg.locator("circle").count()).toBeGreaterThan(500);
    await shot(page, "health-world-band");
    // Pointing at the band opens the lens on the region under the pointer (here: the middle of the
    // band, which is land or sea — either way the lens names it).
    await svg.hover({ position: { x: 300, y: 120 } });
    const lens = page.getByTestId("world-lens");
    await expect(lens).toBeVisible();
    await expect(lens).toContainText(/events|nothing recorded|Sea/);
    await shot(page, "health-world-lens");
    // A click on a cell that recorded events opens the drilldown — only with real events (prod).
    const solid = svg.locator("circle.ap-worldband__solid");
    const solidCount = await solid.count();
    if (solidCount > 0) {
      await solid.first().click({ force: true });
      const region = page.getByTestId("world-region");
      await expect(region).toBeVisible();
      await expect(region).toContainText("located events in the window");
      expect(await region.locator("li").count()).toBeGreaterThan(0);
      await shot(page, "health-world-region");
      await region.getByRole("button", { name: "Close" }).click();
      await expect(region).toHaveCount(0);
    }
    await band.getByRole("button", { name: "Open the full map" }).click();
    await expect(page.getByRole("tab", { name: "Map", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("on touch, a tap does nothing and a press-and-hold opens the lens", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const band = page.getByTestId("world-band");
    await expect(band).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(500);
    await band.scrollIntoViewIfNeeded();
    const svg = band.locator("svg.ap-worldband__svg");
    const box = await svg.boundingBox();
    if (!box) throw new Error("band has no box");
    const x = box.x + box.width * 0.55;
    const y = box.y + box.height * 0.3;
    // A plain tap: no lens, no drilldown.
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(300);
    await expect(page.getByTestId("world-lens")).toHaveCount(0);
    await expect(page.getByTestId("world-region")).toHaveCount(0);
    // Press and hold (the touchscreen API has no hold, so drive the touch events directly).
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await page.waitForTimeout(700);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const lens = page.getByTestId("world-lens");
    await expect(lens).toBeVisible();
    await expect(lens).toContainText(/tap for the events|tap to close/);
    await shot(page, "health-world-lens-touch");
    await ctx.close();
  });
});
