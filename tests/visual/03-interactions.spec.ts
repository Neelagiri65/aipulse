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

  test("Unchecking every filter empties the map (honest-filter contract)", async ({
    page,
  }) => {
    // The user-surfaced bug (session 29) was: registry + HN dots
    // rendered regardless of filter state because those two layers
    // bypassed FilterPanel entirely. With the fix, every dot-producing
    // layer is gated by a filter toggle, so unchecking all 11 filters
    // leaves the map with zero leaflet markers / clusters.
    await openDashboard(page);
    await switchTab(page, "The Map");
    await waitForMapReady(page);

    // FilterPanel renders two sibling DOM nodes (full panel at ≥1440px,
    // icon rail below). Playwright's `Desktop Chrome` preset runs at
    // 1280px → icon rail is the visible variant, but both are in the
    // DOM. Scope to the visible complementary and toggle via whichever
    // role the rendered variant uses (checkbox for full, pressed button
    // for icon rail). Same contract applies to both.
    const panel = page.getByRole("complementary", { name: "Globe filters" });
    const on = panel.locator(
      '[role="checkbox"][aria-checked="true"], button[aria-pressed="true"]',
    );
    // Click toggles until none remain enabled. Cap the loop at 20 to
    // guard against a render bug causing an infinite toggle.
    for (let i = 0; i < 20; i++) {
      const count = await on.count();
      if (count === 0) break;
      await on.first().click({ force: true });
      await page.waitForTimeout(80);
    }
    await expect(on).toHaveCount(0);

    // Wait for the next paint + any throttled map updates before
    // asserting emptiness.
    await page.waitForTimeout(1200);

    // FlatMap renders via L.marker + L.divIcon (→ `.leaflet-marker-icon`)
    // and the clustering plugin wraps dense groups in `.marker-cluster`.
    // Either being present means a dot is still on the map.
    const markers = page.locator(".leaflet-marker-icon");
    const clusters = page.locator(".marker-cluster");
    expect(await markers.count()).toBe(0);
    expect(await clusters.count()).toBe(0);
    await shot(page, "interaction-filters-off-empty-map");
  });
});
