import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { MobileBottomBar } from "@/components/chrome/MobileBottomBar";
import { ROOMS_LABEL } from "@/components/chrome/primary-tabs";

describe("MobileBottomBar", () => {
  it("renders the five primary tabs in the locked order: Health, Feed, Map, Community, More", () => {
    const html = renderToStaticMarkup(
      <MobileBottomBar active="health" onSelect={() => {}} />,
    );
    const idx = ["Health", "Feed", "Map", ROOMS_LABEL, "More"].map((l) => html.indexOf(`>${l}<`));
    expect(idx[0]).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1]);
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
      <MobileBottomBar active="health" onSelect={() => {}} />,
    );
    const mapBtn = html.match(/<button[^>]*data-tab="map"[^>]*>/)?.[0];
    const moreBtn = html.match(/<button[^>]*data-tab="more"[^>]*>/)?.[0];
    expect(mapBtn).toContain('aria-selected="false"');
    expect(moreBtn).toContain('aria-selected="false"');
  });
});
