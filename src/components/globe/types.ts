/**
 * The shape of one point on the map.
 *
 * This lived in `Globe.tsx`, the 3D react-globe.gl component that the 2D
 * `FlatMap` replaced. Twenty-nine modules import this type and none of them ever
 * imported the component, so the file survived purely as a declaration site: 637
 * lines of unreachable render code held in the tree by one `type`. It is a type
 * now, and the component is gone.
 */
export type GlobePoint = {
  lat: number;
  lng: number;
  /**
   * Marker colour.
   *
   * Vestigial on every current renderer: FlatMap recolours through
   * `colorForTypeIn` (event-palette.ts) and the iOS map draws its own accent, so
   * whatever is set here is overwritten before anything is painted. Kept because
   * it is part of the `/api/globe-events` payload shape.
   */
  color: string;
  /** size multiplier */
  size?: number;
  /** original event reference, for hover/click detail panels */
  meta?: Record<string, unknown>;
};
