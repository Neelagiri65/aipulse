/**
 * The brand, as the OG cards draw it.
 *
 * The three `opengraph-image.tsx` files each carried their own copy of a palette
 * written to the S40 PRD — dark `#06080a`, teal `#2dd4bf`, a wordmark reading
 * `GAWK` — and none of them caught up when the product became gawk.dev on warm
 * paper. Three independent copies of a palette is how that happens, so there is
 * one copy now and it lives here.
 *
 * The mark is drawn from the same fractions as the app icon and the favicons
 * (`GaugeMark` in gawk-ios, `design/icon/render.py`): margin, bar and the four
 * marks are all derived from φ, and a mark's tone is its contrast against the bar
 * stepped by φ. They are written out rather than imported because this repo cannot
 * see that one, and `markGeometryIsUnchanged` in the tests pins them.
 */

export const og = {
  paper: "#FAFAF6",
  surface: "#FFFFFF",
  ink: "#16160F",
  ink2: "#3A3A30",
  muted: "#6B6B5E",
  hair: "#E7E6DE",
  accent: "#C8401F",
  accentDeep: "#A8341A",
  barStart: "#FFFFFF",
  barEnd: "#EFEDE4",
} as const;

/** Fractions of the tile's edge. Every one of these is derived from φ. */
export const mark = {
  margin: 0.145898,
  barWidth: 0.708204,
  barHeight: 0.27051,
  diameters: [0.063859, 0.103326, 0.167184, 0.063859],
  centres: [0.285811, 0.40887, 0.583592, 0.73858],
  /** Solved so contrast against the bar steps by φ; the quiet ones sit on the ground. */
  colours: ["#A33219", "#672615", "#16160F", "#A33219"],
} as const;

/**
 * The app's icon at whatever size it is given, drawn with boxes because Satori has
 * no SVG of its own. Subtle by intent: it sits at the scale of a favicon beside
 * the wordmark, not as a hero.
 */
export function BrandTile({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.225,
        background: `linear-gradient(90deg, ${og.accent}, ${og.accentDeep})`,
        display: "flex",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: mark.margin * size,
          top: (0.5 - mark.barHeight / 2) * size,
          width: mark.barWidth * size,
          height: mark.barHeight * size,
          borderRadius: (mark.barHeight / 2) * size,
          background: `linear-gradient(90deg, ${og.barStart}, ${og.barEnd})`,
          display: "flex",
        }}
      />
      {mark.diameters.map((d, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: (mark.centres[i] - d / 2) * size,
            top: (0.5 - d / 2) * size,
            width: d * size,
            height: d * size,
            borderRadius: (d / 2) * size,
            background: mark.colours[i],
            display: "flex",
          }}
        />
      ))}
    </div>
  );
}

/** Tile plus wordmark. The name is gawk.dev, never GAWK. */
export function BrandLockup({ tile = 52, type = 30 }: { tile?: number; type?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: tile * 0.34 }}>
      <BrandTile size={tile} />
      <div style={{ fontSize: type, fontWeight: 600, color: og.ink, letterSpacing: "-0.02em" }}>
        gawk.dev
      </div>
    </div>
  );
}

export const ogFont =
  'ui-sans-serif, -apple-system, "Helvetica Neue", "Segoe UI", Roboto, sans-serif';
