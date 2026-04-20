import { expect, test } from "@playwright/test";
import {
  openDashboard,
  openPanelViaNav,
  panelByTitle,
  shot,
  switchTab,
  waitForMapReady,
} from "./_helpers";

/**
 * AI Labs layer smoke coverage (PRD AC 11–12, issue LABS-05).
 *
 * Three things must be visibly true on prod before labs ship:
 *   1. The map renders ≥ 20 violet-toned markers for lab HQs (curated
 *      registry is ≥ 30 entries; allowing 20 as the floor covers a
 *      transient GH-upstream degrade without failing the smoke).
 *   2. The LeftNav now has 8 buttons and "AI Labs" opens a panel titled
 *      "AI Labs · 7d activity · curated registry".
 *   3. The open panel lists ≥ 20 rows (one per lab, sorted by 7d total).
 *
 * Trust-contract guards: we assert dot count > 20 and row count > 20,
 * not equality, so a week where one lab's 404s on upstream doesn't
 * manufacture a red test — the feature surface is still honest.
 */

test.describe("AI Labs layer", () => {
  test.beforeEach(async ({ page }) => {
    await openDashboard(page);
    await switchTab(page, "The Map");
    await waitForMapReady(page);
  });

  test("map renders ≥ 20 lab HQ markers in violet", async ({ page }) => {
    // Lab markers carry the LABS_VIOLET colour (#a855f7). FlatMap
    // singleton markers inline the colour as a CSS var on the element's
    // style attr via the `ap-marker` wrapper — we match on the explicit
    // hex so registry/live markers (slate / teal / HN orange) don't
    // sneak into the count.
    const violetMarkers = page.locator(
      '.leaflet-marker-icon [style*="#a855f7"]',
    );
    // Wait for the /api/labs poll to resolve; the 10-min poll fires
    // immediately on mount so 20s headroom covers a cold Next.js Data
    // Cache miss on first hit.
    await expect
      .poll(async () => await violetMarkers.count(), { timeout: 25_000 })
      .toBeGreaterThanOrEqual(20);
    await shot(page, "labs-map-violet-dots");
  });

  test("AI Labs button opens the panel from LeftNav", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Panel navigation" });
    // LeftNav is now 8 buttons: Wire, Tools, Models, Agents, Research,
    // Benchmarks, AI Labs, Audit (+ the hamburger doesn't count). Expect
    // ≥ 8 visible panel buttons (hamburger lives in a separate region).
    const buttons = nav.locator("button").filter({ hasText: /./ });
    await expect
      .poll(async () => await buttons.count(), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(8);

    await openPanelViaNav(page, "AI Labs");
    const labs = panelByTitle(page, /AI Labs · 7d activity/i);
    await expect(labs).toBeVisible({ timeout: 15_000 });
    await shot(page, "labs-panel-open");
  });

  test("AI Labs panel lists ≥ 20 labs with kind badge and 7d total", async ({
    page,
  }) => {
    await openPanelViaNav(page, "AI Labs");
    const labs = panelByTitle(page, /AI Labs · 7d activity/i);
    await expect(labs).toBeVisible({ timeout: 15_000 });
    // Each lab is an <li>. Wait for the /api/labs fetch to resolve.
    const rows = labs.locator("ul > li");
    await expect
      .poll(async () => await rows.count(), { timeout: 25_000 })
      .toBeGreaterThanOrEqual(20);
    // Kind pill ("IND" / "ACA" / "NGO") is in the first row; confirms
    // the row rendered the full LabRow body, not a bare placeholder.
    const firstRow = rows.first();
    await expect(firstRow).toContainText(/IND|ACA|NGO/);
    // The 7d total token ("7d") appears in every row's rank cap.
    await expect(firstRow).toContainText(/7d/);
    await shot(page, "labs-panel-rows");
  });
});
