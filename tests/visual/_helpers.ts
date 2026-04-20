import { expect, type Locator, type Page } from "@playwright/test";
import path from "node:path";

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
  await expect(page.getByRole("tab", { name: "The Map" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByRole("navigation", { name: "Panel navigation" }),
  ).toBeVisible();
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
  label: "The Map" | "The Wire" | "The Globe",
) {
  const tab = page.getByRole("tab", { name: label, exact: true });
  await expect(tab).toBeVisible();
  await tab.click({ force: true });
  await expect(tab).toHaveClass(/ap-tabs__item--active/, { timeout: 15_000 });
}

/**
 * LeftNav buttons have accessible names like "Wire 52" / "Models 20" /
 * "Agents soon" (icon + label + count-or-soon-badge all join into the
 * accessible name). The stable identifier is the `title` attribute,
 * which is exactly `n.label` for enabled items and `"{label} · coming
 * soon"` for soon-flagged items.
 */
export function navButton(
  page: Page,
  label:
    | "Wire"
    | "Tools"
    | "Models"
    | "Agents"
    | "Research"
    | "Benchmarks"
    | "Audit",
): Locator {
  const nav = page.getByRole("navigation", { name: "Panel navigation" });
  // Title is either the bare label or "{label} · coming soon".
  const regex = new RegExp(`^${label}(?: ·|$)`);
  return nav.locator(`button[title^="${label}"]`).filter({
    hasNot: page.locator(`button:not([title^="${label}"])`),
  }).first().or(
    nav.locator("button").filter({ hasText: regex }),
  ).first();
}

/**
 * Toggle a panel via its LeftNav button. Uses `title` attribute match
 * which is stable regardless of count/soon badges.
 */
export async function openPanelViaNav(
  page: Page,
  label:
    | "Wire"
    | "Tools"
    | "Models"
    | "Research"
    | "Benchmarks"
    | "AI Labs"
    | "Regional Wire",
) {
  const nav = page.getByRole("navigation", { name: "Panel navigation" });
  const btn = nav.locator(`button[title="${label}"]`);
  await expect(btn).toBeVisible();
  await btn.click({ force: true });
}

/**
 * Close a panel (if open) by toggling its LeftNav button. The close
 * button on the Win chrome also works, but the LeftNav toggle is the
 * exact same state transition the user drives — and it sidesteps any
 * event-propagation subtleties on the title-bar close glyph.
 */
export async function closePanel(
  page: Page,
  titleFragment: string | RegExp,
  navLabel: "Wire" | "Tools" | "Models" | "Research" | "Benchmarks",
) {
  const panel = panelByTitle(page, titleFragment);
  if ((await panel.count()) === 0) return;
  await openPanelViaNav(page, navLabel);
  await expect(panel).toHaveCount(0, { timeout: 5_000 });
}

/**
 * A panel is a `.ap-win` window with a `.ap-win__title` matching the
 * given title fragment. Returns the Locator for that window.
 */
export function panelByTitle(page: Page, titleFragment: string | RegExp) {
  const titleLocator = page.locator(".ap-win__title", {
    hasText: titleFragment,
  });
  return page.locator(".ap-win").filter({ has: titleLocator });
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
