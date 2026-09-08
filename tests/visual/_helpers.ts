import { expect, test, type Locator, type Page } from "@playwright/test";
import path from "node:path";

/**
 * True when the suite is pointed at a local dev server rather than
 * production.
 */
export const IS_LOCAL = Boolean(process.env.LOCAL_URL);

/**
 * Skip a data-dependent assertion when — and only when — we are running
 * against localhost AND the backing data really is absent.
 *
 * Local dev has no Upstash credentials on purpose: they are Vercel env
 * vars only (see CLAUDE.md). So the live event map, The Wire and the
 * Regional Wire panel all render empty against localhost, and tests that
 * assert on that data fail for a reason that has nothing to do with the
 * code under test.
 *
 * Deliberately narrow, because a skip that hides a real outage is worse
 * than a red test. Against production the assertion ALWAYS runs, so a
 * genuine data outage still reds the suite; and a local run that does
 * have data still asserts normally. This exists only to stop an empty
 * dev environment from impersonating a product regression — four of
 * these were carried into a session as "pre-existing failures" when
 * nothing was actually broken.
 */
export function skipWhenLocalAndEmpty(count: number, what: string): void {
  test.skip(
    IS_LOCAL && count === 0,
    `${what}: no data on localhost (Upstash credentials are Vercel-only) — this assertion runs against gawk.dev`,
  );
}

export const SCREENSHOT_DIR = path.join(
  process.cwd(),
  "test-results",
  "screenshots",
);

/**
 * Sequence counter so screenshot filenames sort in capture order —
 * makes manual review (eyeballing the folder) read top-to-bottom in
 * the order the suite exercised the UI.
 */
let seq = 0;
function nextSeq(): string {
  seq += 1;
  return String(seq).padStart(2, "0");
}

export async function shot(
  page: Page,
  name: string,
  opts: { fullPage?: boolean } = {},
) {
  const safe = name.replace(/[^a-zA-Z0-9_-]+/g, "_");
  const file = path.join(SCREENSHOT_DIR, `${nextSeq()}-${safe}.png`);
  await page.screenshot({ path: file, fullPage: opts.fullPage ?? false });
  return file;
}

/**
 * Navigate to the dashboard root and wait for the TopBar + LeftNav to be
 * hydrated and interactive. `domcontentloaded` + the tab/nav visibility
 * check is enough — the polling data fetches resolve on their own schedule
 * and each spec waits for its own readiness signal.
 */
export async function openDashboard(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("tab", { name: "Map", exact: true })).toBeVisible({
    timeout: 20_000,
  });
  // The boards moved under More; the left icon rail is retired. The primary tablist is the
  // dashboard-ready signal now — it is the first interactive chrome on every tab.
  await expect(page.getByRole("tablist").first()).toBeVisible();
  // Ensure React handlers are wired before we start synthesising clicks.
  // `networkidle` is too strict on the live site (polling never idles);
  // a short settle delay catches the hydration window instead.
  await page.waitForTimeout(500);
}

/**
 * Click a top-bar tab and wait for it to mark itself active. Use the
 * active-class check (`ap-tabs__item--active`) rather than
 * `aria-selected="true"`: the class flips synchronously with React state
 * and doesn't race against attribute serialisation order. Falls back to
 * force-click if the viewport has something layered on top of the tab.
 */
export async function switchTab(
  page: Page,
  label: "Health" | "Feed" | "Map" | "Community" | "More",
) {
  const tab = page.getByRole("tab", { name: label, exact: true });
  await expect(tab).toBeVisible();
  // A single click can land before React wires the tab's onClick during
  // the hydration window — likelier under full-suite load, where it
  // surfaced as a flaky "class never flipped" failure. Re-click until the
  // active class actually flips rather than betting on one click.
  await expect(async () => {
    await tab.click({ force: true });
    await expect(tab).toHaveClass(/ap-tabs__item--active/, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

/** Label → board id, so specs can name boards the way the index shows them. */
export const BOARD_ROW_ID: Record<string, string> = {
  Wire: "wire",
  Tools: "tools",
  Models: "models",
  Research: "research",
  Benchmarks: "benchmarks",
  "AI Labs": "labs",
  "Regional Wire": "regional-wire",
  "SDK Adoption": "sdk-adoption",
  "Model Usage": "model-usage",
  Agents: "agents",
  Launches: "launches",
  Audit: "audit",
};

/** A board row on the More index, addressed by its label. */
export function boardRow(page: Page, label: string): Locator {
  return page.locator(`[data-board-row="${BOARD_ROW_ID[label] ?? label}"]`);
}

/**
 * Open a board the way a reader does: More, then its row. Boards are reading surfaces under More
 * since the floating windows retired, so there is no rail and no window to address.
 */
export async function openBoardViaMore(
  page: Page,
  label:
    | "Tools"
    | "Models"
    | "Research"
    | "Benchmarks"
    | "AI Labs"
    | "Regional Wire"
    | "SDK Adoption"
    | "Model Usage"
    | "Agents"
    | "Launches",
) {
  await switchTab(page, "More");
  // The row's accessible name carries its live count ("Tools 6"), so the stable handle is the
  // data attribute, not the label.
  const row = page.locator(`[data-board-row="${BOARD_ROW_ID[label]}"]`);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  await expect(page.getByTestId("board-view")).toBeVisible({ timeout: 20_000 });
}

/** The open board's column, addressed by its title. */
export function boardByTitle(page: Page, title: string | RegExp) {
  return page.getByTestId("board-view").filter({ hasText: title });
}

/** Back to the More index from an open board. */
export async function closeBoard(page: Page) {
  await page.getByRole("link", { name: "‹ More" }).click();
  await expect(page.getByTestId("board-view")).toHaveCount(0);
}

export async function openFilters(page: Page): Promise<Locator> {
  const trigger = page.getByRole("button", { name: "Show filters" });
  if ((await trigger.count()) > 0) {
    await trigger.first().click({ force: true });
  }
  const panel = page.getByRole("complementary", { name: "Globe filters" });
  await expect(panel).toBeVisible({ timeout: 15_000 });
  return panel;
}

/**
 * Leaflet map readiness: waits for `.leaflet-container` + at least one
 * marker so the MAP screenshot captures real data rather than an empty
 * stage.
 */
export async function waitForMapReady(page: Page) {
  await page.waitForSelector(".leaflet-container", { state: "visible" });
  await page.waitForSelector(".leaflet-marker-icon", {
    state: "attached",
    timeout: 30_000,
  });
  await page.waitForTimeout(1200);
}

/**
 * Globe readiness: canvas + WebGL warm-up. Headless GPU is slow on
 * first frame.
 */
export async function waitForGlobeReady(page: Page) {
  await page.waitForSelector("canvas", { state: "visible" });
  await page.waitForTimeout(3500);
}

/**
 * Wire page readiness: header + either a row or the documented empty
 * state (both are legitimate end-states depending on upstream volume).
 */
/** Feed › Wire: click the "Wire" segment of the Feed view switch and wait for it to select. */
export async function openFeedWire(page: Page) {
  const seg = page.getByRole("tablist", { name: "Feed view" }).getByRole("tab", { name: "Wire", exact: true });
  await expect(seg).toBeVisible();
  await expect(async () => {
    await seg.click({ force: true });
    await expect(seg).toHaveAttribute("aria-selected", "true", { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

export async function waitForWireReady(page: Page) {
  // "Chronological" appears only on the WirePage body (either
  // "Chronological · last Xm · …" or the fallback "Chronological feed")
  // — unique, unlike "The Wire" which also matches the TopBar tab.
  await expect(page.getByText(/Chronological/).first()).toBeVisible({
    timeout: 20_000,
  });
  await page
    .waitForSelector("ul li, text=No rows in this window", {
      timeout: 30_000,
    })
    .catch(() => {
      /* empty state also acceptable */
    });
  await page.waitForTimeout(400);
}
