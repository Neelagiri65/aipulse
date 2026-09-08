import { expect, test } from "@playwright/test";
import { boardRow, openDashboard, shot, switchTab } from "./_helpers";

/**
 * Chrome = the non-stage UI: TopBar (brand, tabs, freshness, severity, sources count, UTC clock)
 * and the More index that replaced the left icon rail.
 */

test.describe("chrome", () => {
  test("TopBar brand + tabs + freshness pill are visible", async ({ page }) => {
    await openDashboard(page);

    await expect(page.getByRole("link", { name: "gawk.dev home" }).first()).toBeVisible();
    for (const name of ["Health", "Feed", "Map", "Community", "More"]) {
      await expect(page.getByRole("tab", { name, exact: true }).first()).toBeVisible();
    }
    // Session 27 hid the Globe tab from the switcher. Assert absence so
    // the test catches any accidental re-add.
    await expect(page.getByRole("tab", { name: "The Globe" })).toHaveCount(0);

    // Freshness pill cycles through connecting… / live · Xs / stale / offline.
    const pill = page
      .locator(".ap-sev-pill")
      .filter({ hasText: /connecting|live|stale|offline/ })
      .first();
    await expect(pill).toBeVisible({ timeout: 20_000 });

    await shot(page, "chrome-topbar", { fullPage: false });
  });

  test("the More index lists every board, Audit inert", async ({ page }) => {
    await openDashboard(page);
    await switchTab(page, "More");
    // The left icon rail retired with the floating windows; More is the board index now. Each
    // live board is a real link (so it works as a deep link and before hydration); Audit is
    // announced but not built, so it is present and inert rather than a dead link.
    for (const label of [
      "Wire",
      "Tools",
      "Models",
      "Research",
      "Benchmarks",
      "AI Labs",
      "Regional Wire",
      "SDK Adoption",
      "Model Usage",
      "Agents",
      "Launches",
    ]) {
      await expect(boardRow(page, label)).toBeVisible({ timeout: 15_000 });
    }
    // Audit is announced but not built: present, inert, and not a link.
    const audit = boardRow(page, "Audit");
    await expect(audit).toBeVisible();
    await expect(audit).toHaveClass(/ap-list-row--soon/);
    await expect(audit).toHaveAttribute("aria-disabled", "true");
    await shot(page, "chrome-more-index");
  });

  test("UTC clock renders in the top-right corner", async ({ page }) => {
    await openDashboard(page);
    await expect(
      page.getByText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2} UTC/),
    ).toBeVisible();
  });

  test("Sources count link in the header shows verified count", async ({
    page,
  }) => {
    await openDashboard(page);
    // Scope to the TopBar header — the audit page also links to
    // /data-sources.md (that's the footer reference, a separate element).
    const srcLink = page.locator("header a[href='/data-sources.md']");
    await expect(srcLink).toBeVisible();
    const txt = await srcLink.innerText();
    const n = Number.parseInt(txt.match(/(\d+)\s*src/i)?.[1] ?? "0", 10);
    // 11 verified as of session 18, 16 at time of harness build; allow ≥ 5
    // to stay forward/backward-compatible.
    expect(n).toBeGreaterThanOrEqual(5);
  });
});
