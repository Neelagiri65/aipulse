import { test, expect } from "@playwright/test";
import { openDashboard, shot, switchTab } from "./_helpers";

/**
 * "Your stack" applied to the Feed. The contract (src/lib/feed/stack.ts):
 *  - no stack: today's heading, every card in rank order, no divider;
 *  - pick a tool on Health, open Feed: cards naming a stack tool first, one
 *    divider, everything else after — nothing hidden, row count unchanged;
 *  - the first row is the reading surface's card (the stack answers first);
 *  - the choice survives a reload; "Show all" clears it.
 * Structural assertions only: which tools carry incident cards changes daily,
 * so the spec never pins a tool id, and both divider copies are acceptable.
 */
const DIVIDER = /Everything else · \d+ · still ranked, nothing hidden|Nothing among these \d+ cards names a tool in your stack/;
// The feed mounts in a loading state and fetches /api/feed on the client; a
// cold local build composes it from live sources and can take a while.
const FEED_READY_MS = 120_000;

test.describe("feed × stack", () => {
  test("journey from the landing tab: pick on Health → Feed partitions, reload persists, show all clears", async ({ page }) => {
    await openDashboard(page);
    await switchTab(page, "Feed");
    const rowsBox = page.getByTestId("feed-rows");
    await expect(rowsBox).toBeVisible({ timeout: FEED_READY_MS });
    await expect(rowsBox).toHaveAttribute("data-stack", "0");
    await expect(page.getByTestId("feed-heading")).toContainText("Feed · since the last quiet hour");
    const rows = page.locator('[data-testid="feed-rows"] li.ap-trow');
    await expect(rows.first()).toBeVisible();
    const total = await rows.count();
    expect(total).toBeGreaterThan(0);
    await expect(page.getByTestId("feed-stack-divider")).toHaveCount(0);

    await switchTab(page, "Health");
    await page.getByTestId("stack-chip-copilot").first().click();
    await switchTab(page, "Feed");
    await expect(rowsBox).toBeVisible({ timeout: FEED_READY_MS });
    await expect(rowsBox).toHaveAttribute("data-stack", "1");
    await expect(page.getByTestId("feed-heading")).toContainText(/your stack · \d+ of \d+/i);
    await expect(page.getByTestId("feed-stack-divider")).toHaveCount(1);
    await expect(page.getByTestId("feed-stack-divider")).toContainText(DIVIDER);
    await expect(rows).toHaveCount(total); // nothing hidden
    const mine = Number(await rowsBox.getAttribute("data-stack-mine"));
    const rest = Number(await rowsBox.getAttribute("data-stack-rest"));
    expect(mine + rest).toBe(total);
    // The first row is the selected reading card: the reading surface answers for the stack.
    const firstTitle = await rows.first().locator(".ap-trow__title").textContent();
    await expect(page.getByTestId("feed-reading").locator(".ap-reading__headline")).toHaveText(firstTitle ?? "");
    await shot(page, "feed-stack-desktop");

    await page.reload();
    await openDashboard(page);
    await switchTab(page, "Feed");
    await expect(rowsBox).toBeVisible({ timeout: FEED_READY_MS });
    await expect(rowsBox).toHaveAttribute("data-stack", "1");
    await expect(page.getByTestId("feed-stack-divider")).toHaveCount(1);

    await switchTab(page, "Health");
    await page.getByTestId("stack-clear").first().click();
    await switchTab(page, "Feed");
    await expect(rowsBox).toBeVisible({ timeout: FEED_READY_MS });
    await expect(rowsBox).toHaveAttribute("data-stack", "0");
    await expect(page.getByTestId("feed-stack-divider")).toHaveCount(0);
    await expect(rows).toHaveCount(total);
  });

  test("phone: the same partition renders in the mobile feed", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("gawk-stack", JSON.stringify(["copilot"]));
      } catch {}
    });
    const page = await ctx.newPage();
    await openDashboard(page);
    // The phone's bottom bar is the tablist; switchTab() checks the desktop active class.
    await page.getByRole("tab", { name: "Feed", exact: true }).click();
    const rowsBox = page.getByTestId("feed-rows");
    await expect(rowsBox).toBeVisible({ timeout: FEED_READY_MS });
    await expect(rowsBox).toHaveAttribute("data-stack", "1");
    await expect(page.getByTestId("feed-stack-divider")).toHaveCount(1);
    await expect(page.getByTestId("feed-stack-divider")).toContainText(DIVIDER);
    await shot(page, "feed-stack-phone");
    await ctx.close();
  });

  test("server HTML never carries a stack: a stored choice does not change the prerendered feed", async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("gawk-stack", JSON.stringify(["cursor"]));
      } catch {}
    });
    const page = await ctx.newPage();
    const html = await (await page.request.get("/")).text();
    expect(html).not.toContain("feed-stack-divider");
    expect(html).not.toContain("Your stack ·");
    await ctx.close();
  });
});
