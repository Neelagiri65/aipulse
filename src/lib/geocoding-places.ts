/**
 * Place-resolution layer over the geocoder's bare lat/lng output.
 *
 * The base `geocoding.ts` dictionary returns `[lat, lng]` only — that
 * was sufficient when events were just dots on a globe. The map
 * insights work (TopMoversLine, regional deltas) needs to aggregate
 * by COUNTRY, so we need a coord → country/region label.
 *
 * Strategy: bounding boxes, sorted smallest-first. ~30 countries cover
 * the populated world; US gets state-level sub-bboxes inside its own
 * national bbox. The smallest box that contains a coord wins —
 * California's bbox sits inside US's, so an SF coord resolves to
 * (United States, California) not just (United States).
 *
 * Imperfect at borders (Geneva sits in the France-Switzerland strip;
 * a coord 0.05° from a Singapore/Malaysia line could flip). For the
 * agentic-traffic distribution this is good enough — top tech hubs
 * are well-inside their bboxes. Tracked-gap: if a city's events start
 * showing up under the wrong country, tighten the bbox or add an
 * explicit override entry to OVERRIDES below.
 *
 * No external API calls. No third-party data. Same trust contract as
 * the base geocoder — every label cites its bounding box, every miss
 * surfaces as null.
 */

export type Place = {
  /** Full country display name ("India", "United States"). */
  country: string;
  /** Sub-national region (US state name, etc.). Undefined when not
   *  applicable or when the coord falls outside any sub-bbox. */
  region?: string;
};

type Bbox = {
  country: string;
  region?: string;
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
};

/**
 * US state bboxes — kept tight enough to disambiguate the major coastal
 * tech hubs without false-positive on neighbouring states. Inserted
 * BEFORE the United-States national bbox so the inner box wins.
 */
const US_STATES: Bbox[] = [
  { country: "United States", region: "California", latMin: 32.5, latMax: 42.0, lngMin: -124.5, lngMax: -114.1 },
  { country: "United States", region: "Oregon", latMin: 42.0, latMax: 46.3, lngMin: -124.6, lngMax: -116.5 },
  { country: "United States", region: "Washington", latMin: 45.5, latMax: 49.0, lngMin: -124.8, lngMax: -116.9 },
  { country: "United States", region: "Nevada", latMin: 35.0, latMax: 42.0, lngMin: -120.0, lngMax: -114.0 },
  { country: "United States", region: "Arizona", latMin: 31.3, latMax: 37.0, lngMin: -114.8, lngMax: -109.0 },
  { country: "United States", region: "Utah", latMin: 37.0, latMax: 42.0, lngMin: -114.05, lngMax: -109.04 },
  { country: "United States", region: "Colorado", latMin: 36.99, latMax: 41.0, lngMin: -109.06, lngMax: -102.04 },
  { country: "United States", region: "New Mexico", latMin: 31.3, latMax: 37.0, lngMin: -109.06, lngMax: -103.0 },
  { country: "United States", region: "Texas", latMin: 25.8, latMax: 36.5, lngMin: -106.65, lngMax: -93.5 },
  { country: "United States", region: "Oklahoma", latMin: 33.6, latMax: 37.0, lngMin: -103.0, lngMax: -94.4 },
  { country: "United States", region: "Kansas", latMin: 36.99, latMax: 40.0, lngMin: -102.05, lngMax: -94.6 },
  { country: "United States", region: "Nebraska", latMin: 40.0, latMax: 43.0, lngMin: -104.05, lngMax: -95.3 },
  { country: "United States", region: "Iowa", latMin: 40.4, latMax: 43.5, lngMin: -96.6, lngMax: -90.1 },
  { country: "United States", region: "Minnesota", latMin: 43.5, latMax: 49.4, lngMin: -97.2, lngMax: -89.5 },
  { country: "United States", region: "Wisconsin", latMin: 42.5, latMax: 47.1, lngMin: -92.9, lngMax: -86.7 },
  { country: "United States", region: "Illinois", latMin: 36.97, latMax: 42.5, lngMin: -91.5, lngMax: -87.0 },
  { country: "United States", region: "Missouri", latMin: 36.0, latMax: 40.6, lngMin: -95.8, lngMax: -89.1 },
  { country: "United States", region: "Arkansas", latMin: 33.0, latMax: 36.5, lngMin: -94.6, lngMax: -89.6 },
  { country: "United States", region: "Louisiana", latMin: 28.9, latMax: 33.0, lngMin: -94.0, lngMax: -88.8 },
  { country: "United States", region: "Mississippi", latMin: 30.2, latMax: 35.0, lngMin: -91.7, lngMax: -88.1 },
  { country: "United States", region: "Alabama", latMin: 30.2, latMax: 35.0, lngMin: -88.5, lngMax: -84.9 },
  { country: "United States", region: "Tennessee", latMin: 35.0, latMax: 36.7, lngMin: -90.3, lngMax: -81.6 },
  { country: "United States", region: "Kentucky", latMin: 36.5, latMax: 39.2, lngMin: -89.6, lngMax: -81.9 },
  { country: "United States", region: "Indiana", latMin: 37.7, latMax: 41.8, lngMin: -88.1, lngMax: -84.8 },
  { country: "United States", region: "Ohio", latMin: 38.4, latMax: 42.0, lngMin: -84.8, lngMax: -80.5 },
  { country: "United States", region: "Michigan", latMin: 41.7, latMax: 48.3, lngMin: -90.4, lngMax: -82.4 },
  { country: "United States", region: "Pennsylvania", latMin: 39.7, latMax: 42.3, lngMin: -80.5, lngMax: -74.7 },
  { country: "United States", region: "New York", latMin: 40.4, latMax: 45.0, lngMin: -79.8, lngMax: -71.8 },
  { country: "United States", region: "New Jersey", latMin: 38.9, latMax: 41.4, lngMin: -75.6, lngMax: -73.9 },
  { country: "United States", region: "Connecticut", latMin: 40.95, latMax: 42.05, lngMin: -73.7, lngMax: -71.8 },
  { country: "United States", region: "Massachusetts", latMin: 41.2, latMax: 42.9, lngMin: -73.5, lngMax: -69.9 },
  { country: "United States", region: "Rhode Island", latMin: 41.1, latMax: 42.02, lngMin: -71.9, lngMax: -71.1 },
  { country: "United States", region: "Vermont", latMin: 42.7, latMax: 45.02, lngMin: -73.5, lngMax: -71.5 },
  { country: "United States", region: "New Hampshire", latMin: 42.7, latMax: 45.3, lngMin: -72.6, lngMax: -70.6 },
  { country: "United States", region: "Maine", latMin: 43.0, latMax: 47.5, lngMin: -71.1, lngMax: -66.9 },
  { country: "United States", region: "Maryland", latMin: 37.9, latMax: 39.7, lngMin: -79.5, lngMax: -75.0 },
  { country: "United States", region: "Delaware", latMin: 38.4, latMax: 39.85, lngMin: -75.8, lngMax: -75.0 },
  { country: "United States", region: "Virginia", latMin: 36.5, latMax: 39.5, lngMin: -83.7, lngMax: -75.2 },
  { country: "United States", region: "West Virginia", latMin: 37.2, latMax: 40.6, lngMin: -82.7, lngMax: -77.7 },
  { country: "United States", region: "North Carolina", latMin: 33.8, latMax: 36.6, lngMin: -84.4, lngMax: -75.4 },
  { country: "United States", region: "South Carolina", latMin: 32.0, latMax: 35.2, lngMin: -83.4, lngMax: -78.5 },
  { country: "United States", region: "Georgia", latMin: 30.3, latMax: 35.0, lngMin: -85.6, lngMax: -80.8 },
  { country: "United States", region: "Florida", latMin: 24.5, latMax: 31.0, lngMin: -87.6, lngMax: -80.0 },
  { country: "United States", region: "Hawaii", latMin: 18.9, latMax: 22.3, lngMin: -160.3, lngMax: -154.8 },
  { country: "United States", region: "Alaska", latMin: 51.0, latMax: 71.5, lngMin: -180.0, lngMax: -130.0 },
  { country: "United States", region: "District of Columbia", latMin: 38.79, latMax: 38.995, lngMin: -77.12, lngMax: -76.91 },
  { country: "United States", region: "Idaho", latMin: 41.99, latMax: 49.0, lngMin: -117.25, lngMax: -111.04 },
  { country: "United States", region: "Montana", latMin: 44.36, latMax: 49.0, lngMin: -116.05, lngMax: -104.04 },
  { country: "United States", region: "Wyoming", latMin: 40.99, latMax: 45.01, lngMin: -111.06, lngMax: -104.05 },
  { country: "United States", region: "South Dakota", latMin: 42.48, latMax: 45.94, lngMin: -104.06, lngMax: -96.4 },
  { country: "United States", region: "North Dakota", latMin: 45.94, latMax: 49.0, lngMin: -104.05, lngMax: -96.55 },
];

/**
 * Country bboxes (loose). Sorted small → large by area at module load
 * so smaller countries' boxes get checked first when they nest inside
 * a larger neighbour's bbox (the European peninsula is one giant
 * Russia-touching mess).
 */
const COUNTRY_BBOXES: Bbox[] = [
  // Asia-Pacific
  { country: "Singapore", latMin: 1.16, latMax: 1.48, lngMin: 103.59, lngMax: 104.05 },
  // HK bbox tightened to urban core (Hong Kong Island + Kowloon + airport)
  // to avoid swallowing Shenzhen at 22.5429N. Lo Wu / Sha Tau Kok in NT-North
  // attribute to China — sparse, low-traffic areas.
  { country: "Hong Kong", latMin: 22.13, latMax: 22.45, lngMin: 113.83, lngMax: 114.4 },
  { country: "Macau", latMin: 22.10, latMax: 22.22, lngMin: 113.52, lngMax: 113.6 },
  { country: "Taiwan", latMin: 21.9, latMax: 25.4, lngMin: 119.5, lngMax: 122.05 },
  { country: "South Korea", latMin: 33.0, latMax: 38.7, lngMin: 124.5, lngMax: 131.0 },
  { country: "Japan", latMin: 24.0, latMax: 45.7, lngMin: 122.5, lngMax: 146.0 },
  { country: "Philippines", latMin: 4.6, latMax: 21.2, lngMin: 116.9, lngMax: 126.6 },
  { country: "Vietnam", latMin: 8.4, latMax: 23.4, lngMin: 102.1, lngMax: 109.5 },
  { country: "Thailand", latMin: 5.6, latMax: 20.5, lngMin: 97.3, lngMax: 105.7 },
  { country: "Malaysia", latMin: 0.85, latMax: 7.4, lngMin: 99.6, lngMax: 119.3 },
  { country: "Indonesia", latMin: -11.0, latMax: 6.1, lngMin: 95.0, lngMax: 141.0 },
  { country: "Sri Lanka", latMin: 5.9, latMax: 9.85, lngMin: 79.5, lngMax: 81.9 },
  { country: "Bangladesh", latMin: 20.6, latMax: 26.6, lngMin: 88.0, lngMax: 92.7 },
  { country: "Nepal", latMin: 26.3, latMax: 30.5, lngMin: 80.0, lngMax: 88.3 },
  { country: "Pakistan", latMin: 23.7, latMax: 37.1, lngMin: 60.9, lngMax: 77.0 },
  { country: "India", latMin: 6.5, latMax: 35.7, lngMin: 68.1, lngMax: 97.4 },
  { country: "China", latMin: 18.1, latMax: 53.6, lngMin: 73.5, lngMax: 134.8 },
  { country: "Australia", latMin: -43.7, latMax: -10.7, lngMin: 113.1, lngMax: 153.7 },
  { country: "New Zealand", latMin: -47.3, latMax: -34.4, lngMin: 166.0, lngMax: 178.6 },
  // Middle East & North Africa
  { country: "Israel", latMin: 29.5, latMax: 33.4, lngMin: 34.2, lngMax: 35.9 },
  { country: "Lebanon", latMin: 33.0, latMax: 34.7, lngMin: 35.0, lngMax: 36.65 },
  { country: "Jordan", latMin: 29.1, latMax: 33.4, lngMin: 34.9, lngMax: 39.3 },
  { country: "United Arab Emirates", latMin: 22.5, latMax: 26.1, lngMin: 51.5, lngMax: 56.4 },
  { country: "Qatar", latMin: 24.4, latMax: 26.2, lngMin: 50.7, lngMax: 51.7 },
  { country: "Saudi Arabia", latMin: 16.0, latMax: 32.2, lngMin: 34.5, lngMax: 55.7 },
  { country: "Türkiye", latMin: 35.8, latMax: 42.1, lngMin: 25.7, lngMax: 44.8 },
  { country: "Egypt", latMin: 22.0, latMax: 31.7, lngMin: 24.7, lngMax: 36.9 },
  { country: "Morocco", latMin: 21.0, latMax: 35.95, lngMin: -17.1, lngMax: -1.0 },
  { country: "Tunisia", latMin: 30.2, latMax: 37.55, lngMin: 7.5, lngMax: 11.6 },
  { country: "Algeria", latMin: 18.9, latMax: 37.1, lngMin: -8.7, lngMax: 12.0 },
  // Sub-Saharan Africa
  { country: "Nigeria", latMin: 4.2, latMax: 13.9, lngMin: 2.7, lngMax: 14.7 },
  { country: "Ghana", latMin: 4.7, latMax: 11.2, lngMin: -3.3, lngMax: 1.2 },
  { country: "Kenya", latMin: -4.7, latMax: 5.0, lngMin: 33.9, lngMax: 41.9 },
  { country: "Rwanda", latMin: -2.85, latMax: -1.05, lngMin: 28.85, lngMax: 30.9 },
  { country: "Ethiopia", latMin: 3.4, latMax: 14.9, lngMin: 33.0, lngMax: 48.0 },
  { country: "South Africa", latMin: -34.85, latMax: -22.1, lngMin: 16.4, lngMax: 32.9 },
  // Europe — small first
  { country: "Iceland", latMin: 63.3, latMax: 66.6, lngMin: -24.6, lngMax: -13.5 },
  { country: "Ireland", latMin: 51.4, latMax: 55.4, lngMin: -10.6, lngMax: -5.4 },
  { country: "Belgium", latMin: 49.5, latMax: 51.6, lngMin: 2.5, lngMax: 6.4 },
  { country: "Netherlands", latMin: 50.7, latMax: 53.6, lngMin: 3.3, lngMax: 7.3 },
  { country: "Switzerland", latMin: 45.8, latMax: 47.85, lngMin: 5.95, lngMax: 10.5 },
  { country: "Austria", latMin: 46.3, latMax: 49.05, lngMin: 9.5, lngMax: 17.2 },
  { country: "Czechia", latMin: 48.5, latMax: 51.1, lngMin: 12.0, lngMax: 18.9 },
  { country: "Hungary", latMin: 45.7, latMax: 48.6, lngMin: 16.1, lngMax: 22.95 },
  { country: "Slovakia", latMin: 47.7, latMax: 49.6, lngMin: 16.8, lngMax: 22.6 },
  { country: "Croatia", latMin: 42.4, latMax: 46.6, lngMin: 13.3, lngMax: 19.5 },
  { country: "Denmark", latMin: 54.5, latMax: 57.8, lngMin: 8.0, lngMax: 15.2 },
  { country: "Estonia", latMin: 57.5, latMax: 59.7, lngMin: 21.7, lngMax: 28.2 },
  { country: "Latvia", latMin: 55.6, latMax: 58.1, lngMin: 20.95, lngMax: 28.25 },
  { country: "Lithuania", latMin: 53.9, latMax: 56.45, lngMin: 20.95, lngMax: 26.85 },
  { country: "Portugal", latMin: 36.9, latMax: 42.2, lngMin: -9.6, lngMax: -6.1 },
  { country: "Greece", latMin: 34.8, latMax: 41.8, lngMin: 19.3, lngMax: 28.3 },
  { country: "Bulgaria", latMin: 41.2, latMax: 44.2, lngMin: 22.4, lngMax: 28.6 },
  { country: "Romania", latMin: 43.6, latMax: 48.3, lngMin: 20.2, lngMax: 29.7 },
  { country: "Italy", latMin: 36.6, latMax: 47.1, lngMin: 6.6, lngMax: 18.5 },
  { country: "Spain", latMin: 35.9, latMax: 43.8, lngMin: -9.4, lngMax: 4.4 },
  { country: "Germany", latMin: 47.3, latMax: 55.1, lngMin: 5.9, lngMax: 15.05 },
  { country: "Poland", latMin: 49.0, latMax: 54.85, lngMin: 14.1, lngMax: 24.2 },
  { country: "United Kingdom", latMin: 49.85, latMax: 60.85, lngMin: -8.65, lngMax: 1.8 },
  { country: "France", latMin: 41.3, latMax: 51.1, lngMin: -5.15, lngMax: 9.6 },
  { country: "Norway", latMin: 57.95, latMax: 71.2, lngMin: 4.6, lngMax: 31.1 },
  { country: "Sweden", latMin: 55.3, latMax: 69.1, lngMin: 11.1, lngMax: 24.2 },
  { country: "Finland", latMin: 59.8, latMax: 70.1, lngMin: 20.5, lngMax: 31.6 },
  { country: "Ukraine", latMin: 44.4, latMax: 52.4, lngMin: 22.1, lngMax: 40.2 },
  { country: "Russia", latMin: 41.2, latMax: 81.9, lngMin: 19.6, lngMax: 180.0 },
  // Americas
  { country: "Mexico", latMin: 14.5, latMax: 32.7, lngMin: -118.5, lngMax: -86.7 },
  { country: "Canada", latMin: 41.7, latMax: 83.1, lngMin: -141.0, lngMax: -52.6 },
  { country: "Brazil", latMin: -33.8, latMax: 5.3, lngMin: -74.0, lngMax: -34.8 },
  { country: "Argentina", latMin: -55.1, latMax: -21.8, lngMin: -73.6, lngMax: -53.6 },
  { country: "Chile", latMin: -55.9, latMax: -17.5, lngMin: -75.7, lngMax: -66.4 },
  { country: "Peru", latMin: -18.4, latMax: -0.04, lngMin: -81.4, lngMax: -68.7 },
  { country: "Colombia", latMin: -4.2, latMax: 12.5, lngMin: -79.0, lngMax: -66.9 },
  { country: "Venezuela", latMin: 0.6, latMax: 12.2, lngMin: -73.4, lngMax: -59.8 },
  { country: "Bolivia", latMin: -22.9, latMax: -9.7, lngMin: -69.6, lngMax: -57.5 },
  { country: "Ecuador", latMin: -5.0, latMax: 1.4, lngMin: -81.0, lngMax: -75.2 },
  { country: "Uruguay", latMin: -35.0, latMax: -30.0, lngMin: -58.4, lngMax: -53.1 },
  // United States — checked AFTER all 51 state sub-bboxes via array order
  { country: "United States", latMin: 24.5, latMax: 49.4, lngMin: -125.0, lngMax: -66.9 },
];

/**
 * Combined bbox list: US states first (smallest area, most specific),
 * then country bboxes. The first matching bbox wins — that's how
 * California (a US state sub-bbox) beats United States (the
 * national-level bbox at the bottom).
 */
const ALL_BBOXES: readonly Bbox[] = [...US_STATES, ...COUNTRY_BBOXES];

/**
 * Resolve a coord to its country (and US state, when applicable).
 * Returns null when the coord falls outside every tracked bbox —
 * honest gap, no fabrication. The "Fastest growing" line skips
 * unattributed events rather than bucketing them under "Unknown",
 * which would inflate a fake aggregate.
 */
export function placeFromCoords(lat: number, lng: number): Place | null {
  for (const b of ALL_BBOXES) {
    if (lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax) {
      return b.region ? { country: b.country, region: b.region } : { country: b.country };
    }
  }
  return null;
}
