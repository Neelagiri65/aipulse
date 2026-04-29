/**
 * Layout math for the cluster popup (`EventCard`).
 *
 * The user-reported symptom: clicking a cluster anchored near the
 * bottom of a small viewport produced a popup that extended below the
 * viewport edge, hiding the trailing rows + the "and N more" footer.
 * Pre-fix `top` was capped at `containerH - 260` while `maxHeight`
 * could grow to `min(70vh, 560)` — the two numbers disagreed about
 * how tall the card actually is.
 *
 * `computeEventCardLayout` pins `top` against the floor height of the
 * card and shrinks `maxHeight` to whatever is left below `top`. These
 * tests lock that contract in.
 */

import { describe, expect, it } from "vitest";
import { computeEventCardLayout } from "@/components/globe/event-detail";

const MARGIN = 48;
const MIN_H = 280;
const MAX_H = 560;

describe("computeEventCardLayout", () => {
  it("clears the top margin when anchored near the top edge", () => {
    const { top } = computeEventCardLayout(10, 800);
    expect(top).toBe(MARGIN);
  });

  it("returns the full ceiling height when the container is tall", () => {
    const { top, maxHeight } = computeEventCardLayout(200, 1080);
    expect(top).toBe(160); // anchor.y - 40
    expect(maxHeight).toBe(MAX_H);
  });

  it("never lets the card extend past the bottom margin", () => {
    // Mobile portrait — anchor near the bottom of a 667px viewport.
    const { top, maxHeight } = computeEventCardLayout(640, 667);
    expect(top + maxHeight + MARGIN).toBeLessThanOrEqual(667);
  });

  it("clamps top at containerH - CARD_MIN_HEIGHT - margin", () => {
    const { top } = computeEventCardLayout(2000, 700);
    // anchor far below the viewport — top pinned to topCeiling.
    expect(top).toBe(700 - MIN_H - MARGIN);
  });

  it("falls back to the minimum height when the container is shorter than the floor", () => {
    const { top, maxHeight } = computeEventCardLayout(100, 200);
    expect(top).toBe(MARGIN);
    expect(maxHeight).toBe(MIN_H);
  });

  it("shrinks maxHeight on a short viewport instead of overflowing", () => {
    // 500px tall — card cannot be 560 tall and respect both margins.
    const { top, maxHeight } = computeEventCardLayout(160, 500);
    expect(maxHeight).toBeLessThan(MAX_H);
    expect(maxHeight).toBeGreaterThanOrEqual(MIN_H);
    expect(top + maxHeight + MARGIN).toBeLessThanOrEqual(500);
  });
});
