/**
 * Basemap layer — the canvas both maps draw their dots on.
 *
 * Why OpenFreeMap and not a hosted raster service:
 *
 * On 2026-08-27 CARTO began stamping "API KEY REQUIRED" diagonally across
 * every `basemaps.cartocdn.com` tile. The tiles still returned HTTP 200
 * with valid PNG bytes, so nothing threw, no request failed, and no
 * degraded-state check fired — the map simply served a defaced basemap to
 * everyone until a human looked at it. A rented tile endpoint can change
 * its terms under you silently, and "the request succeeded" is not
 * evidence that what came back is usable.
 *
 * OpenFreeMap is OpenStreetMap data on the open-source OpenMapTiles
 * schema: no API key, no rate limits, and — the part that matters here —
 * self-hostable. If it ever disappears or starts asking for a key, the
 * fix is to point `OFM_HOST` at our own bucket rather than to go shopping
 * for another landlord.
 *
 * The layer is vector (MapLibre GL, WebGL) rather than raster tiles. It
 * is mounted *inside* the existing Leaflet map via maplibre-gl-leaflet,
 * so every dot, cluster, popup and EventCard interaction above it is
 * untouched — only the canvas underneath changed.
 *
 * `maplibre-gl` is pinned to 5.x on purpose. maplibre-gl-leaflet 0.1.4
 * advertises `^6.0.0` in its peer range, but on 6.6.0 the basemap silently
 * renders nothing: the style, sprites and glyphs all load and no error is
 * raised, while zero data tiles are ever requested. The plugin reaches
 * into MapLibre's private transform internals (`latRange`,
 * `maxValidLatitude`, `_helper._latRange`) to unlock Leaflet's wider
 * latitude range, and those moved in 6.x. Verified in a headless browser:
 * 5.24.0 requests tiles and paints, 6.6.0 requests none. Do not widen this
 * range without re-checking that a real map still draws.
 */

import type * as L from "leaflet";

// Positions the MapLibre GL canvas. Imported at module scope because
// Next.js only handles CSS imports statically.
import "maplibre-gl/dist/maplibre-gl.css";

/** Single point of change if the basemap ever has to be self-hosted. */
const OFM_HOST = "https://tiles.openfreemap.org";

export type BasemapVariant = "dark" | "light";

/**
 * OpenFreeMap publishes several styles; `dark` matches the dashboard's
 * canvas and `positron` is the muted light counterpart used by the labs
 * map. Both are OpenMapTiles styles, so their layer names agree.
 */
const STYLE_URL: Record<BasemapVariant, string> = {
  dark: `${OFM_HOST}/styles/dark`,
  light: `${OFM_HOST}/styles/positron`,
};

/**
 * Attribution is not decoration — OpenStreetMap's licence requires it,
 * and the project's own rule is that anything displayed says where it
 * came from. Leaflet's attribution control keeps it visible at the
 * corner of the map.
 */
export const BASEMAP_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · ' +
  '© <a href="https://openfreemap.org/">OpenFreeMap</a>';

/**
 * Add the basemap to an existing Leaflet map.
 *
 * Returns the layer on success and `null` if the basemap could not be
 * mounted — a browser without WebGL, or a blocked tile host. That case is
 * deliberately non-fatal: the dots, clusters and interactions are the
 * product, and a map that draws them on an empty background is degraded
 * but honest. Throwing here would take the whole dashboard panel down to
 * lose decoration.
 */
export async function addBasemap(
  leaflet: typeof L,
  map: L.Map,
  variant: BasemapVariant,
): Promise<L.Layer | null> {
  try {
    // Imported for its side effect: registers `L.maplibreGL`. Deferred
    // so the WebGL bundle is not pulled into the initial page payload.
    await import("@maplibre/maplibre-gl-leaflet");

    const layer = leaflet.maplibreGL({
      style: STYLE_URL[variant],
      // Leaflet owns the attribution control; letting MapLibre draw its
      // own would stack a second credit line on top of it.
      attributionControl: false,
      interactive: false,
    });
    layer.addTo(map);
    map.attributionControl?.addAttribution(BASEMAP_ATTRIBUTION);
    return layer;
  } catch (e) {
    // Loudly. A basemap that fails to mount is exactly the 2026-08-27
    // failure mode repeating in a new costume: the dots still draw, the
    // page looks alive, and nothing tells anyone the canvas underneath
    // is missing. Swallowing this silently is not graceful degradation,
    // it is an invisible outage.
    console.error(
      "[basemap] failed to mount — map will render without a basemap",
      e,
    );
    // Attribution still goes up: the dots are placed on OSM-derived
    // coordinates whether or not the basemap itself rendered.
    map.attributionControl?.addAttribution(BASEMAP_ATTRIBUTION);
    return null;
  }
}
