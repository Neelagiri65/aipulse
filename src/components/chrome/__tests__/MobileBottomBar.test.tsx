import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { MobileBottomBar } from "@/components/chrome/MobileBottomBar";

describe("MobileBottomBar", () => {
  it("renders three tabs in the locked order: FEED, MAP, PANELS", () => {
    const html = renderToStaticMarkup(
      <MobileBottomBar active="feed" onSelect={() => {}} />,
    );
    const feedIdx = html.indexOf(">FEED<");
    const mapIdx = html.indexOf(">MAP<");
    const panelsIdx = html.indexOf(">PANELS<");
    expect(feedIdx).toBeGreaterThanOrEqual(0);
    expect(mapIdx).toBeGreaterThan(feedIdx);
    expect(panelsIdx).toBeGreaterThan(mapIdx);
  });

  it("marks the active tab with is-active + aria-selected", () => {
    const html = renderToStaticMarkup(
      <MobileBottomBar active="map" onSelect={() => {}} />,
    );
    // React serialises attributes in insertion order which differs by
    // version — assert the active button shape via a single match that
    // tolerates attribute reordering.
    const activeButton = html.match(/<button[^>]*data-tab="map"[^>]*>/)?.[0];
    expect(activeButton).toBeDefined();
    expect(activeButton).toContain('aria-selected="true"');
    expect(activeButton).toContain("is-active");
  });

  it("non-active tabs render aria-selected='false'", () => {
    const html = renderToStaticMarkup(
      <MobileBottomBar active="feed" onSelect={() => {}} />,
    );
    const mapBtn = html.match(/<button[^>]*data-tab="map"[^>]*>/)?.[0];
    const panelsBtn = html.match(/<button[^>]*data-tab="panels"[^>]*>/)?.[0];
    expect(mapBtn).toContain('aria-selected="false"');
    expect(panelsBtn).toContain('aria-selected="false"');
  });
});
