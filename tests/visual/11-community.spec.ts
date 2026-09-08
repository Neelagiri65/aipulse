import { expect, test } from "@playwright/test";

import { openDashboard, switchTab } from "./_helpers";

/**
 * /api/community contract against the deployed target. Either the widget
 * answers (200, integer count with its meaning) or the route degrades
 * honestly (503 with a reason). Anything else is a regression.
 */
test.describe("community", () => {
  test("/api/community answers with the minimal DTO or an honest 503", async ({ request }) => {
    const res = await request.get("/api/community");
    expect([200, 503]).toContain(res.status());
    const body = (await res.json()) as Record<string, unknown>;
    expect((body.source as { id: string }).id).toBe("discord-widget");
    expect(typeof body.fetchedAt).toBe("string");
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("members");
    expect(raw).not.toContain("instant_invite");
    if (res.status() === 200) {
      expect(body.ok).toBe(true);
      expect(Number.isInteger(body.onlineCount)).toBe(true);
      expect(String(body.countMeaning)).toMatch(/includes bots/i);
      expect(res.headers()["cache-control"]).toContain("s-maxage=300");
    } else {
      expect(body.ok).toBe(false);
      expect(["widget-disabled", "upstream-error", "invalid-payload"]).toContain(body.reason);
    }
  });

  test("the Community tab leads with the server, its meaning and the join link", async ({
    page,
  }) => {
    await openDashboard(page);
    await switchTab(page, "Community");

    const panel = page.getByTestId("community-discord");
    await expect(panel).toBeVisible({ timeout: 20_000 });

    // Whatever the widget says, the panel says which of the three states it is in.
    const state = panel.locator("[data-community-state]");
    await expect(state).toHaveAttribute("data-community-state", /ok|pending|unavailable/);

    // The door is always shown; a count is only shown with the sentence that qualifies it.
    await expect(page.getByTestId("community-join")).toBeVisible();
    const column = page.locator('section[aria-label="Community"]');
    const kind = await state.getAttribute("data-community-state");
    if (kind === "ok") {
      await expect(column).toContainText(/online now in/i);
      await expect(column).toContainText(/includes bots/i);
    } else {
      await expect(column).not.toContainText(/online now in/i);
    }

    // The GitHub panel below is a different measure and says so.
    await expect(column).toContainText("Active now · repos with AI config");
    await expect(column).toContainText("A different measure from the count above");
  });
});
