import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SparklineMini } from "@/components/charts/SparklineMini";

/**
 * Pure render-output assertions on the SparklineMini SVG. The component
 * is shared with S36 sparkline retrofit on Tool Health, so the tests
 * pin the SVG contract — viewBox, path-d structure, null-gap break,
 * ARIA — independent of any consumer.
 */
describe("SparklineMini", () => {
  it("renders an SVG with the expected viewBox derived from width/height", () => {
    const html = renderToStaticMarkup(
      <SparklineMini data={[1, 2, 3]} width={120} height={32} label="trend" />,
    );
    expect(html).toContain("<svg");
    expect(html).toContain('viewBox="0 0 120 32"');
  });

  it("renders an aria-label for accessibility", () => {
    const html = renderToStaticMarkup(
      <SparklineMini
        data={[1, 2, 3]}
        width={120}
        height={32}
        label="transformers downloads, last 30 days"
      />,
    );
    expect(html).toContain('aria-label="transformers downloads, last 30 days"');
    expect(html).toContain('role="img"');
  });

  it("renders an empty SVG (no path, no circles) when data is empty", () => {
    const html = renderToStaticMarkup(
      <SparklineMini data={[]} width={120} height={32} label="empty" />,
    );
    expect(html).toContain("<svg");
    expect(html).not.toContain("<path");
    expect(html).not.toContain("<circle");
  });

  it("renders a circle (not a path) when only a single non-null point is present", () => {
    const html = renderToStaticMarkup(
      <SparklineMini data={[42]} width={120} height={32} label="one" />,
    );
    expect(html).toContain("<circle");
    expect(html).not.toContain("<path");
  });

  it("renders a path with one M command per contiguous non-null run", () => {
    const html = renderToStaticMarkup(
      <SparklineMini
        data={[1, 2, null, 3, 4]}
        width={120}
        height={32}
        label="gapped"
      />,
    );
    // Two contiguous runs → two M commands.
    const pathMatch = html.match(/d="([^"]+)"/);
    expect(pathMatch).toBeTruthy();
    const d = pathMatch?.[1] ?? "";
    const mCount = (d.match(/M/g) ?? []).length;
    expect(mCount).toBe(2);
  });

  it("renders a different path for log scale vs linear scale on wide-magnitude data", () => {
    const data = [10, 100, 1000, 10000];
    const linearHtml = renderToStaticMarkup(
      <SparklineMini
        data={data}
        width={100}
        height={50}
        label="lin"
        scale="linear"
      />,
    );
    const logHtml = renderToStaticMarkup(
      <SparklineMini
        data={data}
        width={100}
        height={50}
        label="log"
        scale="log"
      />,
    );
    const linearD = linearHtml.match(/d="([^"]+)"/)?.[1] ?? "";
    const logD = logHtml.match(/d="([^"]+)"/)?.[1] ?? "";
    expect(linearD).not.toBe(logD);
    // On linear scale, values 10..10000 are crammed near the bottom (top
    // of viewBox in inverted y); on log, they spread out evenly.
    const linearYs = (linearD.match(/[\d.]+/g) ?? [])
      .map(Number)
      .filter((_, i) => i % 2 === 1);
    const logYs = (logD.match(/[\d.]+/g) ?? [])
      .map(Number)
      .filter((_, i) => i % 2 === 1);
    // Spread = max-min y. Log spread should exceed linear spread for
    // exponentially distributed data.
    const linearSpread = Math.max(...linearYs) - Math.min(...linearYs);
    const logSpread = Math.max(...logYs) - Math.min(...logYs);
    expect(logSpread).toBeGreaterThanOrEqual(linearSpread);
  });

  it("treats zero counts safely in log scale (log10(0+1) = 0, no NaN)", () => {
    const html = renderToStaticMarkup(
      <SparklineMini
        data={[0, 1, 10, 100]}
        width={100}
        height={50}
        label="zero-safe"
        scale="log"
      />,
    );
    const d = html.match(/d="([^"]+)"/)?.[1] ?? "";
    expect(d).not.toMatch(/NaN/);
  });

  it("renders path coordinates inside the viewBox bounds", () => {
    const html = renderToStaticMarkup(
      <SparklineMini
        data={[10, 20, 30, 40]}
        width={100}
        height={50}
        label="bounded"
      />,
    );
    const pathMatch = html.match(/d="([^"]+)"/);
    const d = pathMatch?.[1] ?? "";
    const numbers = d.match(/-?[\d.]+/g)?.map(Number) ?? [];
    // Pairs (x,y); x ∈ [0,100], y ∈ [0,50].
    for (let i = 0; i < numbers.length; i += 2) {
      const x = numbers[i];
      const y = numbers[i + 1];
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(50);
    }
  });
});
