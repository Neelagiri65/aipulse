import { expect, test } from "@playwright/test";
import {
  closePanel,
  openDashboard,
  shot,
  switchTab,
  waitForMapReady,
  waitForWireReady,
} from "./_helpers";

/**
 * Dynamic interactions — cluster click → EventCard, HN orange pill
 * presence in The Wire, filter-panel toggle. Each test scopes its own
 * setup so they can be run individually.
 */

test.describe("interactions", () => {
  test("Map cluster click opens the EventCard", async ({ page }) => {
    await openDashboard(page);
    await switchTab(page, "The Map");
    await waitForMapReady(page);

    // Close the default Wire + Tools panels so they don't occlude the
    // map clusters at the left/right edges. EventCard still opens
    // correctly with them open, but the click target has to be visibly
    // clear for Playwright's force-click to hit the leaflet handler.
    await closePanel(page, /Live feed/i, "Wire");
    await closePanel(page, /Tool health/i, "Tools");
    await page.waitForTimeout(300);

    // Prefer a cluster bubble (≥2 markers overlapping). Fall back to a
    // leaf marker — both open the shared EventCard.
    const cluster = page.locator(".marker-cluster").first();
    const marker = page.locator(".leaflet-marker-icon").first();
    if ((await cluster.count()) > 0) {
      await cluster.click({ force: true });
    } else {
      await marker.click({ force: true });
    }

    const card = page.getByRole("dialog", { name: /event(s)? in this region/i });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await shot(page, "interaction-eventcard");
  });

  test("The Wire shows the HN orange pill when HN stories are present", async ({
    page,
  }) => {
    await openDashboard(page);
    await switchTab(page, "The Wire");
    await waitForWireReady(page);

    const hnPill = page
      .locator("span", { hasText: /^HN · \d+/ })
      .first();
    await expect(hnPill).toBeVisible({ timeout: 15_000 });
    // Computed background must be HN brand orange #ff6600 → rgb(255,102,0).
    const bg = await hnPill.evaluate(
      (el) => globalThis.getComputedStyle(el).backgroundColor,
    );
    expect(bg).toBe("rgb(255, 102, 0)");
    await shot(page, "interaction-hn-pill");
  });

  test("Headline metric cards are visible above the ticker", async ({
    page,
  }) => {
    await openDashboard(page);
    await switchTab(page, "The Map");
    await waitForMapReady(page);
    const metrics = page.locator('[aria-label="Headline metrics"]').first();
    await expect(metrics).toBeVisible();
    // Four cards per MetricsRow.tsx.
    const count = await metrics.locator("> div").count();
    expect(count).toBeGreaterThanOrEqual(4);
    await shot(page, "interaction-metric-cards");
  });

  test("Bottom MetricTicker is visible", async ({ page }) => {
    await openDashboard(page);
    await switchTab(page, "The Map");
    await waitForMapReady(page);
    const ticker = page.locator('[aria-label="Dashboard metric ticker"]');
    await expect(ticker).toBeVisible();
    await shot(page, "interaction-metric-ticker");
  });

  test("Globe filters panel is present on Map view", async ({ page }) => {
    await openDashboard(page);
    await switchTab(page, "The Map");
    await waitForMapReady(page);
    // FilterPanel renders with aria-label "Globe filters" on map + globe.
    const filter = page.getByRole("complementary", { name: "Globe filters" });
    await expect(filter).toBeVisible();
    await shot(page, "interaction-filter-panel");
  });
});
