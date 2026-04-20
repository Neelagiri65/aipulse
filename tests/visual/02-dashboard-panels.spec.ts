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
 * Panels are only rendered on the Map + Globe stages (Dashboard.tsx
 * gates them behind `activeTab === "map" || activeTab === "globe"`).
 * Tests use the Map stage (faster to become interactive than Globe).
 *
 * Wire + Tools are open by default; Models / Research / Benchmarks open
 * on first nav click. Each test opens exactly one panel so the
 * screenshot captures the panel in focus.
 */

test.describe("dashboard panels", () => {
  test.beforeEach(async ({ page }) => {
    await openDashboard(page);
    await switchTab(page, "The Map");
    await waitForMapReady(page);
  });

  test("Wire panel (Live feed · gh-events) is open by default", async ({
    page,
  }) => {
    const wire = panelByTitle(page, /Live feed/i);
    await expect(wire).toBeVisible();
    await shot(page, "panel-wire");
  });

  test("Tools panel (Tool health) is open by default", async ({ page }) => {
    const tools = panelByTitle(page, /Tool health/i);
    await expect(tools).toBeVisible();
    await shot(page, "panel-tools");
  });

  test("Models panel opens on nav click", async ({ page }) => {
    await openPanelViaNav(page, "Models");
    const models = panelByTitle(page, /Top models/i);
    await expect(models).toBeVisible({ timeout: 15_000 });
    // Wait for the poll to settle — either rows or an awaiting-state body.
    await page.waitForTimeout(800);
    await shot(page, "panel-models");
  });

  test("Research panel opens on nav click", async ({ page }) => {
    await openPanelViaNav(page, "Research");
    const research = panelByTitle(page, /Recent papers/i);
    await expect(research).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await shot(page, "panel-research");
  });

  test("Benchmarks panel opens on nav click and renders the top-20 table", async ({
    page,
  }) => {
    await openPanelViaNav(page, "Benchmarks");
    const bench = panelByTitle(page, /Chatbot Arena/i);
    await expect(bench).toBeVisible({ timeout: 15_000 });
    // Table renders once the /api/benchmarks payload resolves.
    const table = bench.locator("table");
    await expect(table).toBeVisible({ timeout: 20_000 });
    // Body rows — trust contract: exactly 20.
    const rowCount = await table.locator("tbody tr").count();
    expect(rowCount).toBe(20);
    // Header labels the 7 expected columns. Use exact match so "Elo"
    // doesn't also match "Δ Elo" (and likewise "#" vs ΔRank/ΔElo symbols).
    // Actual rendered column labels include a non-breaking space between
    // Δ and its subject, which Playwright treats as part of the name.
    const headers = await table
      .locator("thead th")
      .allTextContents();
    const trimmed = headers.map((s) => s.trim());
    expect(trimmed).toContain("#");
    expect(trimmed).toContain("Model");
    expect(trimmed).toContain("Org");
    expect(trimmed).toContain("Elo");
    expect(trimmed).toContain("Votes");
    expect(trimmed.some((s) => /Δ\s*Rank/.test(s))).toBe(true);
    expect(trimmed.some((s) => /Δ\s*Elo/.test(s))).toBe(true);
    await shot(page, "panel-benchmarks");
  });

  test("Benchmarks panel closes on second nav click (toggle)", async ({
    page,
  }) => {
    await openPanelViaNav(page, "Benchmarks");
    await expect(panelByTitle(page, /Chatbot Arena/i)).toBeVisible();
    await openPanelViaNav(page, "Benchmarks");
    await expect(panelByTitle(page, /Chatbot Arena/i)).toHaveCount(0);
  });
});
