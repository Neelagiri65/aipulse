/**
 * Records a full walkthrough of gawk.dev — map + panels.
 * This IS the video. No Remotion needed for data scenes.
 *
 * Flow:
 *   [0-4s]   Global map view, settle + tile load
 *   [4-50s]  Fly to 3 continents: zoom in smoothly, hover→click cluster,
 *            hold EventCard popup showing repos, dismiss, next continent
 *   [50-55s] Return to global view
 *   [55-70s] Navigate to panels: Tools → Models (scroll) → Wire (scroll)
 *   [70-80s] SDK Adoption panel
 *   [80-85s] Return to map, hold
 *
 * Output: out/walkthrough.webm
 *
 * Usage: npx tsx scripts/video/record-map.ts
 */

import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = process.env.GAWK_BASE_URL || "https://gawk.dev";
const OUT_DIR = resolve(process.cwd(), "out");

type ContinentFlight = {
  name: string;
  lat: number;
  lng: number;
  zoomWide: number;
  zoomClose: number;
  events: number;
  detail: string;
};

async function smoothMouseMove(
  page: import("@playwright/test").Page,
  toX: number,
  toY: number,
  steps = 25,
) {
  await page.mouse.move(toX, toY, { steps });
}

async function waitForTiles(page: import("@playwright/test").Page, ms = 1500) {
  await page.waitForTimeout(ms);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  let videoData: Record<string, unknown> = {};
  try {
    videoData = JSON.parse(readFileSync(resolve(process.cwd(), "data/video-daily.json"), "utf8"));
  } catch { /* optional */ }

  const continents = (videoData as any).continents ?? [];
  const flights: ContinentFlight[] = [
    {
      name: "EUROPE",
      lat: 50, lng: 15, zoomWide: 4, zoomClose: 5,
      events: continents.find((c: any) => c.name === "Europe")?.totalEvents ?? 302,
      detail: continents.find((c: any) => c.name === "Europe")?.topCountries?.[0]?.country ?? "Germany",
    },
    {
      name: "NORTH AMERICA",
      lat: 40, lng: -95, zoomWide: 4, zoomClose: 5,
      events: continents.find((c: any) => c.name === "North America")?.totalEvents ?? 221,
      detail: continents.find((c: any) => c.name === "North America")?.topCountries?.[0]?.country ?? "United States",
    },
    {
      name: "ASIA",
      lat: 30, lng: 105, zoomWide: 4, zoomClose: 5,
      events: continents.find((c: any) => c.name === "Asia")?.totalEvents ?? 265,
      detail: continents.find((c: any) => c.name === "Asia")?.topCountries?.[0]?.country ?? "China",
    },
  ];

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--run-all-compositor-stages-before-draw",
      "--disable-checker-imaging",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: OUT_DIR,
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();

  // Inject overlay CSS
  await page.addStyleTag({
    content: `
      .gawk-video-overlay {
        position: fixed;
        top: 40px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 99999;
        background: rgba(8, 12, 20, 0.92);
        border: 1px solid rgba(20, 184, 166, 0.4);
        border-radius: 12px;
        padding: 16px 32px;
        display: flex;
        align-items: center;
        gap: 20px;
        font-family: ui-monospace, monospace;
        backdrop-filter: blur(12px);
        box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 16px rgba(20,184,166,0.15);
        animation: gawk-fade-in 0.8s ease-out;
        pointer-events: none;
      }
      .gawk-video-overlay__name {
        font-size: 18px;
        font-weight: 600;
        color: #14b8a6;
        letter-spacing: 4px;
        text-transform: uppercase;
      }
      .gawk-video-overlay__stat {
        font-size: 28px;
        font-weight: 700;
        color: #f1f5f9;
      }
      .gawk-video-overlay__unit {
        font-size: 13px;
        color: #94a3b8;
        margin-left: 6px;
      }
      .gawk-video-overlay__detail {
        font-size: 13px;
        color: #94a3b8;
        border-left: 1px solid rgba(30,41,59,0.6);
        padding-left: 16px;
      }
      @keyframes gawk-fade-in {
        from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      @keyframes gawk-fade-out {
        from { opacity: 1; }
        to { opacity: 0; transform: translateX(-50%) translateY(-8px); }
      }
    `,
  });

  console.log("Loading gawk.dev...");
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });

  console.log("Waiting for map clusters...");
  try {
    await page.waitForSelector(".ap-fm-cluster", { timeout: 15000 });
  } catch {
    console.warn("No clusters found — continuing...");
  }
  await page.waitForTimeout(2500);

  const mapReady = await page.evaluate(() => {
    const root = document.querySelector(".ap-fm-root");
    if (!root) return false;
    const map = (root as any).__apMap;
    if (!map || typeof map.flyTo !== "function") return false;
    (window as any).__map = map;
    return true;
  });

  if (!mapReady) {
    console.error("Could not find Leaflet map instance on .ap-fm-root.__apMap");
    await context.close();
    await browser.close();
    process.exit(1);
  }

  console.log("Map ready. Pre-warming tile cache...\n");

  // Pre-warm: visit every location so tiles are cached before recording begins.
  // Uses setView (instant, no animation) to avoid recording the pre-warm.
  for (const flight of flights) {
    await page.evaluate(({ lat, lng, zoom }) => {
      (window as any).__map.setView([lat, lng], zoom, { animate: false });
    }, { lat: flight.lat, lng: flight.lng, zoom: flight.zoomWide });
    await page.waitForTimeout(1200);
    await page.evaluate(({ lat, lng, zoom }) => {
      (window as any).__map.setView([lat, lng], zoom, { animate: false });
    }, { lat: flight.lat, lng: flight.lng, zoom: flight.zoomClose });
    await page.waitForTimeout(1200);
  }
  await page.evaluate(() => {
    (window as any).__map.setView([20, 0], 2, { animate: false });
  });
  await page.waitForTimeout(1000);

  console.log("Tiles cached. Starting walkthrough...\n");

  // ============== PHASE 1: MAP WALKTHROUGH ==============

  console.log("  [GLOBAL] Holding global view (4s)...");
  await page.waitForTimeout(4000);

  for (const flight of flights) {
    console.log(`  [MAP] Flying to ${flight.name}...`);

    // Step 1: Fly to continent (wide view)
    await page.evaluate(({ lat, lng, zoom }) => {
      (window as any).__map.flyTo([lat, lng], zoom, { duration: 3.5 });
    }, { lat: flight.lat, lng: flight.lng, zoom: flight.zoomWide });

    await page.waitForTimeout(4000);
    await waitForTiles(page);

    // Step 2: Inject overlay after arriving
    await page.evaluate(({ name, events, detail }) => {
      document.querySelectorAll(".gawk-video-overlay").forEach(el => el.remove());
      const overlay = document.createElement("div");
      overlay.className = "gawk-video-overlay";
      overlay.innerHTML = `
        <span class="gawk-video-overlay__name">${name}</span>
        <span class="gawk-video-overlay__stat">${events}<span class="gawk-video-overlay__unit">events · 24h</span></span>
        <span class="gawk-video-overlay__detail">Led by ${detail}</span>
      `;
      document.body.appendChild(overlay);
    }, flight);

    await page.waitForTimeout(2000);

    // Step 3: Zoom in closer
    console.log(`    → Zooming closer (zoom ${flight.zoomClose})...`);
    await page.evaluate(({ lat, lng, zoom }) => {
      (window as any).__map.flyTo([lat, lng], zoom, { duration: 2 });
    }, { lat: flight.lat, lng: flight.lng, zoom: flight.zoomClose });

    await page.waitForTimeout(2500);
    await waitForTiles(page);

    // Step 4: Find the largest cluster and move mouse to it smoothly
    const clusterPos = await findLargestCluster(page);
    if (clusterPos) {
      console.log(`    → Moving to cluster at (${clusterPos.x}, ${clusterPos.y})...`);
      await smoothMouseMove(page, clusterPos.x, clusterPos.y);
      await page.waitForTimeout(600);

      // Step 5: Click — opens EventCard with repo details
      console.log(`    ✓ Clicking cluster...`);
      await page.mouse.click(clusterPos.x, clusterPos.y);
      await page.waitForTimeout(1200);

      // Step 6: Hold to show EventCard content (repos, event types)
      console.log(`    ✓ Holding EventCard (5s)...`);
      await page.waitForTimeout(5000);

      // Step 7: Dismiss by clicking empty area
      await smoothMouseMove(page, 100, 100, 15);
      await page.mouse.click(100, 100);
      await page.waitForTimeout(800);
    } else {
      console.log(`    ✗ No cluster visible, holding (3s)...`);
      await page.waitForTimeout(3000);
    }

    // Fade out overlay
    await page.evaluate(() => {
      const overlay = document.querySelector(".gawk-video-overlay") as HTMLElement | null;
      if (overlay) {
        overlay.style.animation = "gawk-fade-out 0.5s ease-in forwards";
        setTimeout(() => overlay.remove(), 500);
      }
    });
    await page.waitForTimeout(800);
  }

  // Return to global view
  console.log("  [MAP] Zooming out to global...");
  await page.evaluate(() => {
    (window as any).__map.flyTo([20, 0], 2, { duration: 3 });
  });
  await page.waitForTimeout(4000);

  // ============== PHASE 2: PANEL WALKTHROUGH ==============

  const panelsToShow: { id: string; label: string; holdMs: number; scroll?: boolean }[] = [
    { id: "tools", label: "Tools", holdMs: 5000 },
    { id: "models", label: "Models", holdMs: 7000, scroll: true },
    { id: "wire", label: "Wire", holdMs: 6000, scroll: true },
    { id: "sdk-adoption", label: "SDK Adoption", holdMs: 5000, scroll: true },
  ];

  for (const panel of panelsToShow) {
    console.log(`  [PANEL] Opening ${panel.label}...`);

    const opened = await openPanel(page, panel.id, panel.label);
    if (!opened) {
      console.log(`    ✗ Could not find ${panel.label} nav item`);
      continue;
    }

    console.log(`    ✓ Opened — holding (${panel.holdMs / 1000}s)...`);
    await page.waitForTimeout(1500);

    // Scroll panel content for a natural browsing feel
    if (panel.scroll) {
      try { await scrollPanelContent(page); } catch { /* page may have closed */ }
    }

    await page.waitForTimeout(panel.holdMs - (panel.scroll ? 2000 : 0));
  }

  // ============== PHASE 3: RETURN TO MAP ==============

  console.log("  [END] Returning to map view...");
  await page.evaluate(() => {
    const mapArea = document.querySelector(".ap-fm-root") ?? document.querySelector("canvas");
    if (mapArea) (mapArea as HTMLElement).click();
  });
  await page.waitForTimeout(3000);

  const videoPath = await page.video()?.path();
  await context.close();
  await browser.close();

  if (videoPath) {
    console.log(`\nWalkthrough saved to: ${videoPath}`);
  } else {
    console.log("\nVideo recording complete (check out/ directory).");
  }
}

async function findLargestCluster(
  page: import("@playwright/test").Page,
): Promise<{ x: number; y: number; count: number } | null> {
  return page.evaluate(() => {
    const clusters = document.querySelectorAll(".ap-fm-cluster");
    if (clusters.length === 0) return null;

    let best: { x: number; y: number; count: number } | null = null;
    for (const el of clusters) {
      const rect = el.getBoundingClientRect();
      if (rect.top < 0 || rect.left < 0 || rect.bottom > window.innerHeight || rect.right > window.innerWidth) continue;

      const text = el.textContent?.trim() ?? "";
      const countMatch = text.match(/^(\d+\+?)/);
      let count = 0;
      if (countMatch) {
        count = countMatch[1].endsWith("+") ? 100 : parseInt(countMatch[1], 10);
      }

      if (!best || count > best.count) {
        best = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          count,
        };
      }
    }
    return best;
  });
}

async function openPanel(
  page: import("@playwright/test").Page,
  panelId: string,
  panelLabel: string,
): Promise<boolean> {
  const opened = await page.evaluate((targetText) => {
    const navItems = document.querySelectorAll(".ap-icon-nav__item");
    for (const item of navItems) {
      const label = item.querySelector(".ap-icon-nav__label");
      if (!label) continue;
      const text = label.textContent?.trim().toLowerCase() ?? "";
      const target = targetText.replace(/-/g, " ");
      if (text === target || text === targetText) {
        (item as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, panelId);

  if (opened) return true;

  return page.evaluate((label) => {
    const navItems = document.querySelectorAll(".ap-icon-nav__item");
    for (const item of navItems) {
      if (item.getAttribute("title")?.toLowerCase().includes(label.toLowerCase())) {
        (item as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, panelLabel);
}

async function scrollPanelContent(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const panel = document.querySelector("[class*='panel-body']")
      ?? document.querySelector("[class*='PanelBody']")
      ?? document.querySelector("[class*='drawer']")
      ?? document.querySelector(".ap-panel-scroll");

    if (!panel) {
      const candidates = document.querySelectorAll("[style*='overflow']");
      for (const c of candidates) {
        if (c.scrollHeight > c.clientHeight + 50) {
          c.scrollTo({ top: c.scrollHeight * 0.4, behavior: "smooth" });
          return;
        }
      }
      return;
    }
    panel.scrollTo({ top: panel.scrollHeight * 0.4, behavior: "smooth" });
  });
  await page.waitForTimeout(2000);
}

main().catch((e) => {
  console.error("Walkthrough recording failed:", e);
  process.exit(1);
});
