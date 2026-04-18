/**
 * Minimal geocoder for mapping GitHub profile location strings to
 * lat/lng coordinates. Deliberately naïve: substring match against a
 * curated dictionary of ~60 tech hubs.
 *
 * Why not a real geocoder (Nominatim, Mapbox)?
 *  - Free-tier rate limits would be the bottleneck, not the app.
 *  - GitHub profile locations are noisy free-text; fancy geocoding is
 *    wasted on "somewhere over the rainbow" or "🌍".
 *  - Coverage honesty: we show the coverage % in the UI — a city that
 *    isn't in this table is skipped, not fabricated.
 *
 * Expect ~30-50% of events to have a matchable location. That is the
 * honest baseline; increasing coverage means expanding this table, not
 * hand-waving coordinates.
 */

type Coords = [lat: number, lng: number];

const CITY_COORDS: Array<[string, Coords]> = [
  // North America
  ["san francisco", [37.7749, -122.4194]],
  ["sf bay area", [37.7749, -122.4194]],
  ["bay area", [37.7749, -122.4194]],
  ["palo alto", [37.4419, -122.143]],
  ["mountain view", [37.3861, -122.0839]],
  ["oakland", [37.8044, -122.2712]],
  ["berkeley", [37.8715, -122.273]],
  ["los angeles", [34.0522, -118.2437]],
  ["seattle", [47.6062, -122.3321]],
  ["new york", [40.7128, -74.006]],
  ["brooklyn", [40.6782, -73.9442]],
  ["boston", [42.3601, -71.0589]],
  ["cambridge, ma", [42.3736, -71.1097]],
  ["chicago", [41.8781, -87.6298]],
  ["austin", [30.2672, -97.7431]],
  ["denver", [39.7392, -104.9903]],
  ["portland", [45.5152, -122.6784]],
  ["washington", [38.9072, -77.0369]],
  ["dc", [38.9072, -77.0369]],
  ["atlanta", [33.749, -84.388]],
  ["dallas", [32.7767, -96.797]],
  ["toronto", [43.6532, -79.3832]],
  ["vancouver", [49.2827, -123.1207]],
  ["montreal", [45.5017, -73.5673]],
  ["mexico city", [19.4326, -99.1332]],

  // UK & Ireland
  ["london", [51.5074, -0.1278]],
  ["manchester", [53.4808, -2.2426]],
  ["edinburgh", [55.9533, -3.1883]],
  ["cambridge", [52.2053, 0.1218]],
  ["oxford", [51.752, -1.2577]],
  ["bristol", [51.4545, -2.5879]],
  ["dublin", [53.3498, -6.2603]],

  // EU
  ["berlin", [52.52, 13.405]],
  ["munich", [48.1351, 11.582]],
  ["paris", [48.8566, 2.3522]],
  ["amsterdam", [52.3676, 4.9041]],
  ["rotterdam", [51.9244, 4.4777]],
  ["stockholm", [59.3293, 18.0686]],
  ["copenhagen", [55.6761, 12.5683]],
  ["oslo", [59.9139, 10.7522]],
  ["helsinki", [60.1699, 24.9384]],
  ["zurich", [47.3769, 8.5417]],
  ["madrid", [40.4168, -3.7038]],
  ["barcelona", [41.3851, 2.1734]],
  ["lisbon", [38.7223, -9.1393]],
  ["vienna", [48.2082, 16.3738]],
  ["prague", [50.0755, 14.4378]],
  ["warsaw", [52.2297, 21.0122]],
  ["budapest", [47.4979, 19.0402]],
  ["athens", [37.9838, 23.7275]],

  // MEA
  ["tel aviv", [32.0853, 34.7818]],
  ["dubai", [25.2048, 55.2708]],
  ["istanbul", [41.0082, 28.9784]],
  ["cape town", [-33.9249, 18.4241]],
  ["nairobi", [-1.2921, 36.8219]],
  ["lagos", [6.5244, 3.3792]],
  ["cairo", [30.0444, 31.2357]],

  // Asia
  ["bangalore", [12.9716, 77.5946]],
  ["bengaluru", [12.9716, 77.5946]],
  ["mumbai", [19.076, 72.8777]],
  ["delhi", [28.6139, 77.209]],
  ["new delhi", [28.6139, 77.209]],
  ["hyderabad", [17.385, 78.4867]],
  ["chennai", [13.0827, 80.2707]],
  ["pune", [18.5204, 73.8567]],
  ["gurgaon", [28.4595, 77.0266]],
  ["gurugram", [28.4595, 77.0266]],
  ["beijing", [39.9042, 116.4074]],
  ["shanghai", [31.2304, 121.4737]],
  ["shenzhen", [22.5429, 114.0596]],
  ["hangzhou", [30.2741, 120.1551]],
  ["tokyo", [35.6762, 139.6503]],
  ["osaka", [34.6937, 135.5023]],
  ["kyoto", [35.0116, 135.7681]],
  ["seoul", [37.5665, 126.978]],
  ["taipei", [25.033, 121.5654]],
  ["singapore", [1.3521, 103.8198]],
  ["ho chi minh", [10.8231, 106.6297]],
  ["hanoi", [21.0285, 105.8542]],
  ["jakarta", [-6.2088, 106.8456]],
  ["bangkok", [13.7563, 100.5018]],
  ["manila", [14.5995, 120.9842]],
  ["kuala lumpur", [3.139, 101.6869]],

  // Oceania
  ["sydney", [-33.8688, 151.2093]],
  ["melbourne", [-37.8136, 144.9631]],
  ["brisbane", [-27.4698, 153.0251]],
  ["auckland", [-36.8485, 174.7633]],

  // South America
  ["são paulo", [-23.5505, -46.6333]],
  ["sao paulo", [-23.5505, -46.6333]],
  ["rio de janeiro", [-22.9068, -43.1729]],
  ["buenos aires", [-34.6037, -58.3816]],
  ["santiago", [-33.4489, -70.6693]],
  ["bogota", [4.711, -74.0721]],
  ["bogotá", [4.711, -74.0721]],
  ["lima", [-12.0464, -77.0428]],
];

// Longest keys first so "cambridge, ma" wins over "cambridge".
CITY_COORDS.sort((a, b) => b[0].length - a[0].length);

export function geocode(locationString: string | null | undefined): Coords | null {
  if (!locationString) return null;
  const haystack = locationString.toLowerCase().trim();
  for (const [needle, coords] of CITY_COORDS) {
    if (haystack.includes(needle)) return coords;
  }
  return null;
}

export const DICTIONARY_SIZE = CITY_COORDS.length;
