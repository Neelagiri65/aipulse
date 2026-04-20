import { expect, test } from "@playwright/test";
import { openDashboard, shot } from "./_helpers";

/**
 * Chrome = the non-stage UI: TopBar (brand, tabs, freshness, severity,
 * sources count, UTC clock) + LeftNav rail.
 */

test.describe("chrome", () => {
  test("TopBar brand + tabs + freshness pill are visible", async ({ page }) => {
    await openDashboard(page);

    await expect(page.getByText("AI PULSE").first()).toBeVisible();
    await expect(page.getByRole("tab", { name: "The Map" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "The Wire" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "The Globe" })).toBeVisible();

    // Freshness pill cycles through connecting… / live · Xs / stale / offline.
    const pill = page
      .locator(".ap-sev-pill")
      .filter({ hasText: /connecting|live|stale|offline/ })
      .first();
    await expect(pill).toBeVisible({ timeout: 20_000 });

    await shot(page, "chrome-topbar", { fullPage: false });
  });

  test("LeftNav exposes all nine panel buttons", async ({ page }) => {
    await openDashboard(page);
    const nav = page.getByRole("navigation", { name: "Panel navigation" });
    // LeftNav buttons use `title` attribute as the stable identifier —
    // the accessible name includes the count/soon badge text so
    // role+name matching doesn't work for exact labels. Session 21
    // widened this list 8 → 9 with "Regional Wire" between AI Labs and
    // Audit (sibling map-layer panel; sits next to its HQ-layer cousin).
    for (const label of [
      "Wire",
      "Tools",
      "Models",
      "Research",
      "Benchmarks",
      "AI Labs",
      "Regional Wire",
      "Audit",
    ]) {
      await expect(nav.locator(`button[title="${label}"]`)).toBeVisible();
    }
    // Agents is soon-flagged → title includes " · coming soon", disabled.
    const agents = nav.locator('button[title="Agents · coming soon"]');
    await expect(agents).toBeVisible();
    await expect(agents).toBeDisabled();
    await shot(page, "chrome-leftnav");
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
