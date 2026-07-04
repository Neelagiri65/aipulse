import { expect, test } from "@playwright/test";

/**
 * Containment actuation render test (PRD F4 / Auditor suggestion 4): a
 * merged actuator without a render assertion IS the green≠delivered class
 * — this proves a quarantined state actually becomes a grey tile with the
 * disclosure text, on a REAL server render, not just in unit tests.
 *
 * Requires a LOCAL server started with the quarantined fixture:
 *
 *   npx next build
 *   CONTAINMENT_STATE_FIXTURE=$PWD/tests/visual/fixtures/containment-quarantined.json \
 *     npx next start -p 3100
 *   CONTAINMENT_E2E=1 LOCAL_URL=http://localhost:3100 \
 *     npx playwright test tests/visual/10-containment-quarantine.spec.ts
 *
 * Skipped in the normal prod visual suite (no fixture on prod — and a real
 * prod quarantine failing this suite would be the loop WORKING).
 *
 * The fixture's computedAt is intentionally ancient: it simultaneously
 * proves Auditor change 2 — a STALE containment state keeps the
 * quarantine applied (sticky) and adds the monitoring badge on top,
 * instead of un-greying the source the moment monitoring dies.
 */

test.describe("containment quarantine actuation", () => {
  test.skip(
    !process.env.CONTAINMENT_E2E,
    "needs a local server with CONTAINMENT_STATE_FIXTURE (see header comment)",
  );

  test("quarantined source renders the grey tile, disclosure, and sticky monitoring badge", async ({
    page,
  }) => {
    await page.goto("/board");

    // The Models tile is quarantined: badge + reason + last-known anchor.
    await expect(page.getByText("⊘ source quarantined")).toBeVisible();
    await expect(page.getByText("sanity: 400 above max 150")).toBeVisible();
    await expect(page.getByText(/last known value · as of/)).toBeVisible();

    // Derived cards are suppressed: no MODEL_MOVER row renders anywhere.
    await expect(page.locator("text=/rank .*(climb|drop)/i")).toHaveCount(0);

    // Sticky fail-safe: the ancient fixture state ALSO trips the additive
    // monitoring badge — quarantine held, impairment disclosed.
    await expect(page.getByText("◌ monitoring impaired")).toBeVisible();

    // The board still renders the rest of the page (containment is
    // surgical, not a site outage).
    await expect(
      page.getByText("Gawk — State of the AI Ecosystem"),
    ).toBeVisible();

    await page.screenshot({
      path: "test-results/screenshots/containment-quarantine-board.png",
      fullPage: true,
    });
  });
});
