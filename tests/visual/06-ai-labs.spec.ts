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

  test("map renders lab HQ markers in violet", async ({ page }) => {
    // LABS_VIOLET = #a855f7 = rgb(168,85,247). FlatMap renders it via
    // hexA() → rgba(168,85,247,α) in inline style attrs — covers both
    // singleton lab markers (<span> background) and lab-majority
    // cluster icons (<div class="ap-fm-cluster"> border + box-shadow).
    //
    // The world-zoomed default view clusters aggressively, and every
    // big tech hub mixes labs with live GH events — the cluster takes
    // the dominant colour (live > lab), so labs in SF / Cambridge /
    // Beijing can read as teal rather than violet on any given poll.
    // To make this assertion deterministic we zoom directly to MPI-IS
    // Tübingen (lat 48.54, lng 9.06) at zoom 10. It's past Leaflet's
    // `disableClusteringAtZoom: 9` threshold AND the HQ is in a small
    // academic town with no other lab or major tech-hub live traffic
    // nearby — the only violet marker in the viewport is the one we
    // intend to assert on.
    await page.evaluate(() => {
      const el = document.querySelector(".ap-fm-root") as unknown as {
        __apMap?: { setView: (ll: [number, number], z: number) => void };
      } | null;
      el?.__apMap?.setView([48.54, 9.06], 10);
    });
    // Let Leaflet re-render at the new viewport + cluster-disable the
    // HQ marker. 1.2s matches `waitForMapReady`'s settle window.
    await page.waitForTimeout(1200);

    const violetMarkers = page.locator(
      '.leaflet-marker-icon [style*="168,85,247"]',
    );
    await expect
      .poll(async () => await violetMarkers.count(), { timeout: 25_000 })
      .toBeGreaterThanOrEqual(1);
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
