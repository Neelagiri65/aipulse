import { describe, it, expect } from "vitest";
import { og, mark } from "../og-brand";

/**
 * The OG cards drifted two generations behind the brand because three files each
 * carried their own copy of a palette and nothing checked them. These are what
 * checks them.
 */
describe("og-brand", () => {
  it("carries no trace of the S40 identity", () => {
    const values = [...Object.values(og), ...mark.colours].map((v) => v.toLowerCase());
    for (const dead of ["#2dd4bf", "#06080a", "#0b0f14"]) {
      expect(values).not.toContain(dead);
    }
  });

  it("uses the product's own tokens", () => {
    expect(og.paper).toBe("#FAFAF6");
    expect(og.ink).toBe("#16160F");
    expect(og.accent).toBe("#C8401F");
  });

  /**
   * These fractions are copied from the app icon's generator, which this repo
   * cannot import. If someone nudges one, the site's mark stops being the app's
   * mark, and the only way to notice is here.
   */
  it("keeps the mark geometry the app icon actually ships", () => {
    expect(mark.margin).toBeCloseTo(0.145898, 6);
    expect(mark.barWidth).toBeCloseTo(0.708204, 6);
    expect(mark.barHeight).toBeCloseTo(0.27051, 5);
    expect(mark.diameters).toEqual([0.063859, 0.103326, 0.167184, 0.063859]);
    expect(mark.centres).toEqual([0.285811, 0.40887, 0.583592, 0.73858]);
  });

  it("keeps the run uneven, which is the whole point of the figure", () => {
    const [a, b, c, d] = mark.diameters;
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(d).toBeLessThan(c);
    expect(d).toBe(a);
  });

  it("steps the mark sizes by phi", () => {
    const phi = (1 + Math.sqrt(5)) / 2;
    const [a, b, c] = mark.diameters;
    expect(b / a).toBeCloseTo(phi, 3);
    expect(c / b).toBeCloseTo(phi, 3);
  });

  it("never lets a mark overlap its neighbour", () => {
    for (let i = 0; i < mark.diameters.length - 1; i++) {
      const edge = mark.centres[i] + mark.diameters[i] / 2;
      const next = mark.centres[i + 1] - mark.diameters[i + 1] / 2;
      expect(next).toBeGreaterThan(edge);
    }
  });

  it("keeps the whole run inside the bar", () => {
    const left = mark.centres[0] - mark.diameters[0] / 2;
    const right = mark.centres[3] + mark.diameters[3] / 2;
    expect(left).toBeGreaterThan(mark.margin);
    expect(right).toBeLessThan(mark.margin + mark.barWidth);
  });
});
