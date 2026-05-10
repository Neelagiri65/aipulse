/**
 * Records a full walkthrough of gawk.dev — map + panels.
 * This IS the video. No Remotion needed for data scenes.
 *
 * Flow:
 *   [0-3s]   Global map view, settle
 *   [3-30s]  Fly to 3 continents with injected overlay labels, click clusters
 *   [30-45s] Navigate to Tools panel (screen record real UI)
 *   [45-60s] Navigate to Models panel
 *   [60-75s] Navigate to Wire panel
 *   [75-85s] Navigate to SDK Adoption panel
 *   [85-90s] Return to map, hold
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
  zoom: number;
  events: number;
  detail: string;
};

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // Load video data if available (for overlay stats)
  let videoData: Record<string, unknown> = {};
  try {
    videoData = JSON.parse(readFileSync(resolve(process.cwd(), "data/video-daily.json"), "utf8"));
  } catch { /* optional */ }

  const continents = (videoData as any).continents ?? [];
  const flights: ContinentFlight[] = [
    {
      name: "EUROPE",
      lat: 50, lng: 15, zoom: 4,
      events: continents.find((c: any) => c.name === "Europe")?.totalEvents ?? 302,
      detail: continents.find((c: any) => c.name === "Europe")?.topCountries?.[0]?.country ?? "Germany",
    },
    {
      name: "NORTH AMERICA",
      lat: 40, lng: -95, zoom: 4,
      events: continents.find((c: any) => c.name === "North America")?.totalEvents ?? 221,
      detail: continents.find((c: any) => c.name === "North America")?.topCountries?.[0]?.country ?? "United States",
    },
    {
      name: "ASIA",
      lat: 30, lng: 100, zoom: 4,
      events: continents.find((c: any) => c.name === "Asia")?.totalEvents ?? 265,
      detail: continents.find((c: any) => c.name === "Asia")?.topCountries?.[0]?.country ?? "China",
    },
  ];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: OUT_DIR,
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();

  // Inject overlay CSS once
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
        animation: gawk-fade-in 0.6s ease-out;
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
        from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
    `,
  });

  console.log("Loading gawk.dev...");
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });

  // Wait for map clusters
  console.log("Waiting for map clusters...");
  try {
    await page.waitForSelector(".ap-fm-cluster", { timeout: 15000 });
  } catch {
    console.warn("No clusters found — continuing...");
  }
  await page.waitForTimeout(2000);

  // Get the Leaflet map instance
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

  console.log("Map ready. Starting walkthrough...\n");

  // ============== PHASE 1: MAP WALKTHROUGH ==============

  // Hold global view
  console.log("  [GLOBAL] Holding global view (3s)...");
  await page.waitForTimeout(3000);

  for (const flight of flights) {
    console.log(`  [MAP] Flying to ${flight.name}...`);

    // Inject continent overlay
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

    // Fly to the continent
    await page.evaluate(({ lat, lng, zoom }) => {
      (window as any).__map.flyTo([lat, lng], zoom, { duration: 2.5 });
    }, flight);

    // Wait for fly + tile load
    await page.waitForTimeout(3500);

    // Click the largest visible cluster
    const clicked = await clickLargestCluster(page);
    if (clicked) {
      console.log(`    ✓ Clicked cluster — holding popup (6s)...`);
      await page.waitForTimeout(6000);
      // Dismiss popup
      await page.mouse.click(100, 100);
      await page.waitForTimeout(800);
    } else {
      console.log(`    ✗ No cluster found, holding view (4s)...`);
      await page.waitForTimeout(4000);
    }

    // Remove overlay before next flight
    await page.evaluate(() => {
      document.querySelectorAll(".gawk-video-overlay").forEach(el => el.remove());
    });
    await page.waitForTimeout(500);
  }

  // Return to global view
  console.log("  [MAP] Zooming out to global...");
  await page.evaluate(() => {
    (window as any).__map.flyTo([20, 0], 2, { duration: 2 });
  });
  await page.waitForTimeout(3000);

  // ============== PHASE 2: PANEL WALKTHROUGH ==============

  const panelsToShow: { id: string; label: string; holdMs: number }[] = [
    { id: "tools", label: "Tools", holdMs: 6000 },
    { id: "models", label: "Models", holdMs: 8000 },
    { id: "wire", label: "Wire", holdMs: 6000 },
    { id: "sdk-adoption", label: "SDK Adoption", holdMs: 6000 },
  ];

  for (const panel of panelsToShow) {
    console.log(`  [PANEL] Opening ${panel.label}...`);

    // Click the nav item to open the panel
    const opened = await page.evaluate((panelId) => {
      const navItems = document.querySelectorAll(".ap-icon-nav__item");
      for (const item of navItems) {
        const label = item.querySelector(".ap-icon-nav__label");
        if (!label) continue;
        // Match by data attribute or label text
        const text = label.textContent?.trim().toLowerCase() ?? "";
        const targetText = panelId.replace(/-/g, " ");
        if (text === targetText || text === panelId) {
          (item as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, panel.id);

    if (!opened) {
      // Fallback: try clicking by nav item order
      const fallbackOpened = await page.evaluate((panelLabel) => {
        const navItems = document.querySelectorAll(".ap-icon-nav__item");
        for (const item of navItems) {
          if (item.getAttribute("title")?.toLowerCase().includes(panelLabel.toLowerCase())) {
            (item as HTMLElement).click();
            return true;
          }
        }
        return false;
      }, panel.label);

      if (!fallbackOpened) {
        console.log(`    ✗ Could not find ${panel.label} nav item`);
        continue;
      }
    }

    console.log(`    ✓ Opened — holding (${panel.holdMs / 1000}s)...`);
    await page.waitForTimeout(panel.holdMs);
  }

  // ============== PHASE 3: RETURN TO MAP ==============

  console.log("  [END] Returning to map view...");
  // Close all panels by clicking the map tab or body
  await page.evaluate(() => {
    // Click away from panels to show the map
    const mapArea = document.querySelector(".ap-fm-root") ?? document.querySelector("canvas");
    if (mapArea) (mapArea as HTMLElement).click();
  });
  await page.waitForTimeout(3000);

  // Finalize video
  const videoPath = await page.video()?.path();
  await context.close();
  await browser.close();

  if (videoPath) {
    console.log(`\nWalkthrough saved to: ${videoPath}`);
  } else {
    console.log("\nVideo recording complete (check out/ directory).");
  }
}

async function clickLargestCluster(page: import("@playwright/test").Page): Promise<boolean> {
  const clusterInfo = await page.evaluate(() => {
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

  if (!clusterInfo) return false;

  await page.mouse.click(clusterInfo.x, clusterInfo.y);
  await page.waitForTimeout(800);
  return true;
}

main().catch((e) => {
  console.error("Walkthrough recording failed:", e);
  process.exit(1);
});
