import { expect, test, type Page } from "@playwright/test";
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

  test("the Community tab is the way in, and it opens the server", async ({ page }) => {
    await openDashboard(page);
    // #106 put a Community chip in the header; the five-tab chrome made Community a destination,
    // so the chip is retired and the tab is the single entry point. Assert both halves: no chip,
    // and the tab actually lands on the Discord panel.
    await expect(page.locator("header [data-testid='community-link']")).toHaveCount(0);

    const tab = page.getByRole("tab", { name: "Community", exact: true });
    await expect(tab).toBeVisible();
    await switchTab(page, "Community");
    await expect(page.getByTestId("community-discord")).toBeVisible({ timeout: 20_000 });
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

/**
 * The theme is one decision. `globals.css` has no `prefers-color-scheme` block — light unless the
 * reader flips the switch (PRD web-restyle-v2 §6, restated in ThemeSwitch) — so no surface may
 * resolve the OS preference on its own. After #111 the map did: with OS dark and no stored choice,
 * prod served the dark basemap under light chrome. The whole suite runs `colorScheme: "dark"`
 * (playwright.config.ts), which is why nothing caught it; these tests assert the agreement.
 *
 * The ground is read from the style OpenFreeMap is asked for (`positron` light, `dark` dark) —
 * the Leaflet container keeps its own grey behind the WebGL canvas either way, so its computed
 * background says nothing about what was painted.
 */
test.describe("theme", () => {
  const bodyLuminance = (page: Page) =>
    page.evaluate(() => {
      const [r, g, b] = (
        getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) ?? ["255", "255", "255"]
      ).map(Number);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    });

  function watchBasemapStyles(page: Page) {
    const styles: string[] = [];
    page.on("request", (req) => {
      const m = req.url().match(/openfreemap\.org\/styles\/([a-z]+)/);
      if (m) styles.push(m[1]);
    });
    return styles;
  }

  test("with the OS preferring dark and no stored choice, chrome and basemap are both light", async ({
    page,
  }) => {
    const styles = watchBasemapStyles(page);
    await openDashboard(page);
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
    expect(await bodyLuminance(page)).toBeGreaterThan(0.6);

    await switchTab(page, "Map");
    await expect.poll(() => styles, { timeout: 30_000 }).toContain("positron");
    expect(styles).not.toContain("dark");
  });

  test("the switch takes the chrome and the basemap to dark together", async ({ page }) => {
    const styles = watchBasemapStyles(page);
    await openDashboard(page);
    await page.locator("[data-theme-switch]").first().click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await bodyLuminance(page)).toBeLessThan(0.4);

    await switchTab(page, "Map");
    await expect.poll(() => styles, { timeout: 30_000 }).toContain("dark");
  });
});
