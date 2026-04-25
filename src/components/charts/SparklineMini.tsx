/**
 * SparklineMini — a tiny inline SVG sparkline. Render-only, no
 * interactivity. Designed to drop into the SDK Adoption row drawer
 * and to be reused by the S36 sparkline retrofit on Tool Health and
 * benchmark leaderboards without modification.
 *
 * Behaviour:
 *   - Maps `data` evenly across the SVG width.
 *   - `null` entries break the line — multiple `M` commands in the
 *     path so consumers can see at-a-glance which days are missing
 *     rather than implying a continuous interpolated trend.
 *   - Single non-null point renders as a circle (a path of length 1
 *     wouldn't render in any browser).
 *   - All-null / empty data renders an empty SVG so layouts don't
 *     jump as data lands later.
 *   - viewBox is exactly `0 0 {width} {height}`; the path stays
 *     inside those bounds even with extreme values via
 *     min-max normalisation against the non-null range.
 */

import * as React from "react";

export type SparklineMiniProps = {
  data: Array<number | null>;
  width: number;
  height: number;
  /** Required for accessibility — describe what the line represents. */
  label: string;
  /** Optional stroke colour override. Defaults to currentColor so the
   *  consumer can theme via parent CSS. */
  stroke?: string;
  /** Optional stroke-width override. Defaults to 1.5. */
  strokeWidth?: number;
  /** Optional padding inside the viewBox so the stroke isn't clipped
   *  at the edges. Defaults to 1.5 (matches default strokeWidth). */
  padding?: number;
  /** "linear" (default) plots raw values; "log" plots log10(v + 1) so a
   *  10x range fits the same visual height as a 10x range elsewhere on
   *  the chart. Use log when the same chart compares packages spanning
   *  ~3+ orders of magnitude (brew:ollama at 2k vs pypi:openai at 10M). */
  scale?: "linear" | "log";
};

export function SparklineMini({
  data,
  width,
  height,
  label,
  stroke,
  strokeWidth = 1.5,
  padding = 1.5,
  scale = "linear",
}: SparklineMiniProps): React.ReactElement {
  const transform = (v: number): number =>
    scale === "log" ? Math.log10(Math.max(0, v) + 1) : v;
  const transformed = data.map((v) => (v === null ? null : transform(v)));
  const nonNull = transformed.filter((v): v is number => v !== null);
  const empty = nonNull.length === 0;

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);

  let min = 0;
  let max = 1;
  if (!empty) {
    min = Math.min(...nonNull);
    max = Math.max(...nonNull);
    if (min === max) {
      // Flat line — draw at vertical centre.
      const half = innerH / 2;
      min = min - half;
      max = max + half;
    }
  }

  const xFor = (i: number): number => {
    if (data.length <= 1) return padding + innerW / 2;
    return padding + (i / (data.length - 1)) * innerW;
  };
  const yFor = (v: number): number => {
    const pct = (v - min) / (max - min);
    // Inverted: high values at the top.
    return padding + (1 - pct) * innerH;
  };

  // Single non-null point → render a circle rather than a degenerate path.
  const singlePoint =
    nonNull.length === 1
      ? (() => {
          const i = transformed.findIndex((v) => v !== null);
          return { cx: xFor(i), cy: yFor(transformed[i] as number) };
        })()
      : null;

  // Multi-point: build a path with M starting each contiguous run.
  let d = "";
  if (!singlePoint && !empty) {
    const segments: string[] = [];
    let inRun = false;
    for (let i = 0; i < transformed.length; i++) {
      const v = transformed[i];
      if (v === null) {
        inRun = false;
        continue;
      }
      const cmd = inRun ? "L" : "M";
      segments.push(`${cmd}${fmt(xFor(i))} ${fmt(yFor(v))}`);
      inRun = true;
    }
    d = segments.join(" ");
  }

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      style={{ display: "block", overflow: "visible" }}
    >
      {singlePoint ? (
        <circle
          cx={singlePoint.cx}
          cy={singlePoint.cy}
          r={Math.max(strokeWidth, 1.5)}
          fill={stroke ?? "currentColor"}
        />
      ) : null}
      {d ? (
        <path
          d={d}
          fill="none"
          stroke={stroke ?? "currentColor"}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

export default SparklineMini;
