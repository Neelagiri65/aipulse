import { colorForTypeIn } from "@/components/map/event-palette";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MapLegend } from "@/components/chrome/MapLegend";
import { DEFAULT_FILTERS, type FilterState } from "@/components/chrome/FilterPanel";

const ALL_OFF: FilterState = {
  ...DEFAULT_FILTERS,
  push: false,
  pr: false,
  issue: false,
  release: false,
  fork: false,
  watch: false,
};

describe("MapLegend", () => {
  it("renders one row per active event-type filter", () => {
    const html = renderToStaticMarkup(<MapLegend filters={DEFAULT_FILTERS} />);
    // All 6 default-on types should appear.
    expect(html).toContain("Push");
    expect(html).toContain("PR");
    expect(html).toContain("Issue");
    expect(html).toContain("Release");
    expect(html).toContain("Fork");
    expect(html).toContain("Star");
  });

  it("hides rows for unchecked event types", () => {
    const onlyPush: FilterState = { ...ALL_OFF, push: true };
    const html = renderToStaticMarkup(<MapLegend filters={onlyPush} />);
    expect(html).toContain("Push");
    expect(html).not.toContain(">PR<");
    expect(html).not.toContain(">Issue<");
  });

  it("returns null entirely when no event types are active", () => {
    const html = renderToStaticMarkup(<MapLegend filters={ALL_OFF} />);
    expect(html).toBe("");
  });

  it("uses role=group with an aria-label for accessibility", () => {
    const html = renderToStaticMarkup(<MapLegend filters={DEFAULT_FILTERS} />);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Map legend — active event types"');
  });

  it("renders coloured dots that match the FilterPanel checkbox swatches", () => {
    const onlyPush: FilterState = { ...ALL_OFF, push: true };
    const html = renderToStaticMarkup(<MapLegend filters={onlyPush} />);
    // The swatch is the colour the map paints on the reader's ground. Server render resolves to
    // the light theme, so the light-ground push value is what ships in the markup; the point of
    // the assertion is that legend and markers read the SAME palette, not a copied constant.
    expect(html).toContain(colorForTypeIn("light", "PushEvent"));
  });
});
