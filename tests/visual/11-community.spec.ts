import { expect, test } from "@playwright/test";

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
});
