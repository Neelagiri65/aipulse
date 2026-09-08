/**
 * Kind-pill colours, per theme.
 *
 * `CATEGORY_META[kind].color` in `lib/data/labs-registry.ts` is the *map* hue: a 400/500-level
 * value picked to glow on the dark basemap, and it stays that on the map. As pill text on a
 * reading surface those same values sit at 2.1–4.0:1 on paper — the AI Labs board printed CLD,
 * SIL and TLG at barely-there.
 *
 * So the board reads its own table: 700-level on light (each ≥4.5:1 on --surface), the map hue on
 * dark. One table, both themes, next to each other — the same reason the map's marker palette
 * lives in `map/event-palette.ts` rather than being hand-copied into each consumer.
 */

import type { Theme } from "@/lib/hooks/use-theme";
import { CATEGORY_META, type LabKind } from "@/lib/data/labs-registry";

const LIGHT: Record<LabKind, string> = {
  labs: "#7E22CE",
  infra: "#1D4ED8",
  cloud: "#0E7490",
  silicon: "#B45309",
  tooling: "#15803D",
};

/** Pill text colour for a kind in the theme actually in force. */
/**
 * Two of the map hues are also short of 4.5:1 as text on the dark surface (#1F2226): purple-500
 * reads 4.04, blue-500 reads 4.34. The dark column steps those two to their 400-level.
 */
const DARK: Partial<Record<LabKind, string>> = {
  labs: "#C084FC",
  infra: "#60A5FA",
};

export function kindPillColor(kind: LabKind, theme: Theme): string {
  return theme === "dark" ? (DARK[kind] ?? CATEGORY_META[kind].color) : LIGHT[kind];
}

/** The tint and hairline that go with it — hue at low alpha, so the pill follows the paper. */
export function kindPillStyle(kind: LabKind, theme: Theme): React.CSSProperties {
  const c = kindPillColor(kind, theme);
  return { color: c, backgroundColor: `${c}1A`, borderColor: `${c}44` };
}
