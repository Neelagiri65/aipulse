/**
 * geocoding-places — bbox-based place resolution.
 *
 * Asserts the contract the regional-deltas / TopMoversLine code depend on:
 *   1. Major tech-hub coords resolve to the right country (round-trip
 *      from the geocoder's known cities).
 *   2. US coords additionally carry the right state.
 *   3. Innermost bbox wins (California beats United States).
 *   4. Unknown coords return null — no fake "Unknown" bucket.
 */

import { describe, it, expect } from "vitest";
import { placeFromCoords } from "@/lib/geocoding-places";
import { geocode, geocodeRich } from "@/lib/geocoding";

describe("placeFromCoords", () => {
  it("returns null for ocean / outside any tracked bbox", () => {
    expect(placeFromCoords(0, 0)).toBeNull();
    expect(placeFromCoords(-50, -120)).toBeNull(); // South Pacific
  });

  it("US tech hubs carry country + state", () => {
    expect(placeFromCoords(37.7749, -122.4194)).toEqual({
      country: "United States",
      region: "California",
    });
    expect(placeFromCoords(40.7128, -74.006)).toEqual({
      country: "United States",
      region: "New York",
    });
    expect(placeFromCoords(47.6062, -122.3321)).toEqual({
      country: "United States",
      region: "Washington",
    });
    expect(placeFromCoords(42.3601, -71.0589)).toEqual({
      country: "United States",
      region: "Massachusetts",
    });
  });

  it("non-US capitals carry country (no region)", () => {
    expect(placeFromCoords(51.5074, -0.1278)).toEqual({
      country: "United Kingdom",
    });
    expect(placeFromCoords(48.8566, 2.3522)).toEqual({
      country: "France",
    });
    expect(placeFromCoords(35.6762, 139.6503)).toEqual({
      country: "Japan",
    });
  });

  it("major Indian cities resolve to India", () => {
    expect(placeFromCoords(12.9716, 77.5946)?.country).toBe("India"); // Bangalore
    expect(placeFromCoords(19.076, 72.8777)?.country).toBe("India"); // Mumbai
    expect(placeFromCoords(28.6139, 77.209)?.country).toBe("India"); // Delhi
  });

  it("major Chinese cities resolve to China", () => {
    expect(placeFromCoords(39.9042, 116.4074)?.country).toBe("China");
    expect(placeFromCoords(31.2304, 121.4737)?.country).toBe("China");
    expect(placeFromCoords(22.5429, 114.0596)?.country).toBe("China");
  });

  it("Hong Kong resolves to Hong Kong (not China — innermost bbox wins)", () => {
    expect(placeFromCoords(22.3193, 114.1694)).toEqual({
      country: "Hong Kong",
    });
  });

  it("Singapore resolves to Singapore (not Malaysia)", () => {
    expect(placeFromCoords(1.3521, 103.8198)).toEqual({
      country: "Singapore",
    });
  });

  it("Taiwan resolves to Taiwan (not China)", () => {
    expect(placeFromCoords(25.033, 121.5654)).toEqual({
      country: "Taiwan",
    });
  });
});

describe("geocodeRich", () => {
  it("round-trips a city string to lat/lng + country", () => {
    expect(geocodeRich("Bangalore")).toEqual({
      lat: 12.9716,
      lng: 77.5946,
      country: "India",
      region: undefined,
    });
  });

  it("returns null for an unknown location string", () => {
    expect(geocodeRich("nowhere in particular")).toBeNull();
  });

  it("US cities include the state region", () => {
    const r = geocodeRich("Palo Alto");
    expect(r?.country).toBe("United States");
    expect(r?.region).toBe("California");
  });

  it("forward geocode + reverse place resolution agree", () => {
    const cities = ["London", "Tokyo", "Berlin", "São Paulo", "Sydney"];
    for (const c of cities) {
      const coords = geocode(c);
      expect(coords).not.toBeNull();
      const rich = geocodeRich(c);
      expect(rich).not.toBeNull();
      expect(rich?.lat).toBe(coords?.[0]);
      expect(rich?.lng).toBe(coords?.[1]);
    }
  });
});
