import { expect, test } from "@playwright/test";
import {
  boardByTitle,
  boardRow,
  closeBoard,
  openBoardViaMore,
  openDashboard,
  shot,
} from "./_helpers";

/**
 * Boards are reading surfaces under More (`?tab=more&board=`), not windows over the map — the
 * floating `Win` and the left icon rail retired with the restyle. Each test opens its board the
 * way a reader does: More, then the row.
 */

test.describe("boards", () => {
  test.beforeEach(async ({ page }) => {
    await openDashboard(page);
  });

  test("Tools panel (Tool health) opens on nav click", async ({ page }) => {
    await openBoardViaMore(page, "Tools");
    const tools = boardByTitle(page, /Tool health/i);
    await expect(tools).toBeVisible({ timeout: 15_000 });
    await shot(page, "board-tools");
  });

  test("Models panel opens on nav click", async ({ page }) => {
    await openBoardViaMore(page, "Models");
    const models = boardByTitle(page, /Top models/i);
    await expect(models).toBeVisible({ timeout: 15_000 });
    // Wait for the poll to settle — either rows or an awaiting-state body.
    await page.waitForTimeout(800);
    await shot(page, "board-models");
  });

  test("Research panel opens on nav click", async ({ page }) => {
    await openBoardViaMore(page, "Research");
    const research = boardByTitle(page, /Recent papers/i);
    await expect(research).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await shot(page, "board-research");
  });

  test("Benchmarks panel opens on nav click and renders the top-20 table", async ({
    page,
  }) => {
    await openBoardViaMore(page, "Benchmarks");
    const bench = boardByTitle(page, /Chatbot Arena/i);
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
    await shot(page, "board-benchmarks");
  });

  test("a board returns to the More index", async ({ page }) => {
    await openBoardViaMore(page, "Benchmarks");
    await expect(boardByTitle(page, /Chatbot Arena/i)).toBeVisible();
    await closeBoard(page);
    // Back on the index, with every row still there.
    await expect(boardRow(page, "Benchmarks")).toBeVisible();
  });

  test("a board deep link opens it directly", async ({ page }) => {
    await page.goto("/?tab=more&board=benchmarks");
    await expect(page.getByTestId("board-view")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("board-view")).toHaveAttribute("data-board", "benchmarks");
  });

  test("SDK Adoption panel opens on nav click", async ({ page }) => {
    await openBoardViaMore(page, "SDK Adoption");
    const sdk = boardByTitle(page, /SDK Adoption/i);
    await expect(sdk).toBeVisible({ timeout: 15_000 });
    // The board can take one /api/panels/sdk-adoption fetch to settle —
    // empty/loading state is also an acceptable visual.
    await page.waitForTimeout(800);
    await shot(page, "panel-sdk-adoption");
  });

  test("Model Usage panel opens on nav click", async ({ page }) => {
    await openBoardViaMore(page, "Model Usage");
    const mu = boardByTitle(page, /Model Usage/i);
    await expect(mu).toBeVisible({ timeout: 15_000 });
    // The board can take one /api/panels/model-usage fetch to settle —
    // pre-cron empty state is also an acceptable visual until the
    // first 6h cron fires in prod.
    await page.waitForTimeout(800);
    await shot(page, "panel-model-usage");
  });
});
