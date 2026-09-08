import { expect, test } from "@playwright/test";
import {
  openDashboard,
  openFilters,
  shot,
  skipWhenLocalAndEmpty,
  switchTab,
  openFeedWire,
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
    await switchTab(page, "Map");
    await waitForMapReady(page);

    // Nothing floats over the map any more — the boards moved under More — so the clusters are
    // clear without closing anything first.

    // FlatMap renders cluster bubbles through a custom `iconCreateFunction`,
    // so they carry `.ap-fm-cluster` and never Leaflet's stock
    // `.marker-cluster` class. A previous version of this test branched on
    // `.marker-cluster` first; that branch matched nothing and the test
    // silently always took the fallback path.
    const marker = page.locator(".leaflet-marker-icon").first();
    skipWhenLocalAndEmpty(
      await page.locator(".leaflet-marker-icon").count(),
      "map has no markers to click",
    );
    await marker.click({ force: true });

    // Match the shared region card by the half of its label that is a
    // contract, not the half that is data. Every variant ends in "in this
    // region" — events, AI labs, and AI-config events all reuse the same
    // card. Which one the first marker belongs to depends on what the
    // feeds happen to hold: locally it is often an AI-labs cluster, on
    // prod usually an events cluster. Asserting `/events? in this region/`
    // pinned the test to that accident and made it fail against a local
    // dev server while passing against gawk.dev.
    const card = page.getByRole("dialog", { name: /in this region/i });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await shot(page, "interaction-eventcard");
  });

  test("Feed › Wire shows the HN orange pill when HN stories are present", async ({
    page,
  }) => {
    await openDashboard(page);
    await switchTab(page, "Feed");
    await openFeedWire(page);
    await waitForWireReady(page);

    // The coverage line is the truth about the window: "N rows (g gh · h hn)".
    const coverage = await page.locator(".ap-wire__coverage").first().textContent();
    const hnInWindow = Number(coverage?.match(/(\d+) hn\)/)?.[1] ?? "0");
    skipWhenLocalAndEmpty(hnInWindow, "The Wire has no HN stories");
    // The wire pages at 200 rows, newest first — HN stories may sit past the first page.
    const hnPill = page.locator("span.ap-hnpill").first();
    for (let i = 0; i < 10 && (await hnPill.count()) === 0; i++) {
      const more = page.getByRole("button", { name: /^Show \d+ more$/ });
      if ((await more.count()) === 0) break;
      await more.click();
    }
    await hnPill.scrollIntoViewIfNeeded();
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
    await switchTab(page, "Map");
    await waitForMapReady(page);
    const metrics = page.locator('[aria-label="Headline metrics"]').first();
    await expect(metrics).toBeVisible();
    // Three cards per MetricsRow.tsx (AI-cfg events, AI-cfg share,
    // events/window). The MetricTicker 6-tile diagnostics row is hidden
    // from the default view, so these headline cards are the only metrics.
    const count = await metrics.locator("> div").count();
    expect(count).toBe(3);
    await shot(page, "interaction-metric-cards");
  });

  test("Bottom live event ticker is visible", async ({ page }) => {
    await openDashboard(page);
    await switchTab(page, "Map");
    await waitForMapReady(page);
    // The bottom-pinned strip on map/globe views is the LiveTicker
    // ("Live event ticker"). The older MetricTicker ("Dashboard metric
    // ticker") is intentionally hidden from the default view — its data
    // now lives on /sources + /api/cron-health.
    const ticker = page.getByRole("status", { name: "Live event ticker" });
    await expect(ticker).toBeVisible();
    await shot(page, "interaction-live-ticker");
  });

  test("the ticker's LIVE cap is not painted over by the scrolling rows", async ({ page }) => {
    // The track composites itself (`will-change: transform`) and used to paint over the cap, so
    // prod showed a row's text and the word LIVE on the same pixels. Occlusion, not colour: ask
    // the document what is actually on top at the cap's centre.
    await openDashboard(page);
    await switchTab(page, "Map");
    const tag = page.locator(".ap-live-ticker-tag").first();
    await expect(tag).toBeVisible({ timeout: 20_000 });

    const seen = await tag.evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        positioned: cs.position !== "static",
        zIndex: Number(cs.zIndex),
        onTop: hit ? hit.closest(".ap-live-ticker-tag") !== null : false,
      };
    });
    // The stacking assertions bite anywhere; the occlusion one only bites when the ticker has
    // rows to scroll — i.e. against gawk.dev, which is where the defect was seen.
    expect(seen.positioned).toBe(true);
    expect(seen.zIndex).toBeGreaterThanOrEqual(1);
    expect(seen.onTop).toBe(true);
  });

  test("Globe filters panel opens on Map view", async ({ page }) => {
    await openDashboard(page);
    await switchTab(page, "Map");
    await waitForMapReady(page);
    // FilterPanel collapses to a "Show filters" trigger by default;
    // opening it mounts the labelled "Globe filters" complementary.
    const filter = await openFilters(page);
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
    await switchTab(page, "Map");
    await waitForMapReady(page);

    // FilterPanel collapses to a "Show filters" trigger by default — open
    // it first. It then renders two sibling DOM nodes (full panel at
    // ≥1440px, icon rail below); the suite viewport is 1440px so the full
    // panel is the visible variant, but `display:none` keeps the other out
    // of the a11y tree. Scope to the visible complementary and toggle via
    // whichever role the rendered variant uses (checkbox for full, pressed
    // button for icon rail). Same contract applies to both.
    const panel = await openFilters(page);
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

  test("the Map stage counts marks, and the digest prompt stays off the ticker", async ({
    page,
  }) => {
    await openDashboard(page);
    await switchTab(page, "Map");

    // The stage pill counts every mark on the map — events, AI-config repos, labs, publishers —
    // while the metrics row below counts events in the poll window. It used to say "evt", which
    // read as the same number, in smaller type, disagreeing by an order of magnitude.
    const status = page.getByText(/marks, all layers/i).first();
    await expect(status).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/\d+ evt ·/)).toHaveCount(0);

    // The digest prompt is a floating panel; the ticker is content in motion underneath it.
    // It only appears after its own gates pass, so this asserts the geometry when it is there.
    const ticker = page.locator(".ap-live-ticker");
    await expect(ticker).toBeVisible();
    const modal = page.locator('[data-testid="subscribe-modal"], .fixed.right-6.z-40').first();
    if (await modal.isVisible().catch(() => false)) {
      const [m, t] = [await modal.boundingBox(), await ticker.boundingBox()];
      if (m && t) expect(m.y + m.height).toBeLessThanOrEqual(t.y + 1);
    }
  });
});
