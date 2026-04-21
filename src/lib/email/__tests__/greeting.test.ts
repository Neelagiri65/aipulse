import { describe, expect, it } from "vitest";
import { renderGreeting } from "@/lib/email/greeting";

describe("renderGreeting — with country", () => {
  it("substitutes ISO code with the country's English display name", () => {
    const out = renderGreeting({
      template:
        "Good morning from AI Pulse — here's what moved in {geoCountry} and beyond in the last 24h.",
      countryCode: "GB",
    });
    expect(out).toContain("United Kingdom");
    expect(out).not.toContain("{geoCountry}");
  });

  it("handles lowercase country codes", () => {
    const out = renderGreeting({
      template: "as seen from {geoCountry}",
      countryCode: "us",
    });
    expect(out).toContain("United States");
  });

  it("falls back to the raw code for unknown codes", () => {
    const out = renderGreeting({
      template: "in {geoCountry}",
      countryCode: "XZ",
    });
    expect(out).toContain("XZ");
  });
});

describe("renderGreeting — without country", () => {
  it("strips 'in {geoCountry} and beyond' when no country is known", () => {
    const out = renderGreeting({
      template:
        "Good morning from AI Pulse — here's what moved in {geoCountry} and beyond in the last 24h.",
      countryCode: null,
    });
    expect(out).toBe(
      "Good morning from AI Pulse — here's what moved in the last 24h.",
    );
    expect(out).not.toContain("{geoCountry}");
  });

  it("strips the quiet-mode geo clause cleanly", () => {
    const out = renderGreeting({
      template:
        "Good morning from AI Pulse — all quiet in the AI ecosystem in {geoCountry} and beyond.",
      countryCode: null,
    });
    expect(out).toBe(
      "Good morning from AI Pulse — all quiet in the AI ecosystem.",
    );
  });

  it("strips the bootstrap-mode geo clause cleanly", () => {
    const out = renderGreeting({
      template:
        "Welcome to AI Pulse. Here's where the AI ecosystem stands right now, as seen from {geoCountry}.",
      countryCode: null,
    });
    expect(out).toBe(
      "Welcome to AI Pulse. Here's where the AI ecosystem stands right now.",
    );
  });

  it("strips bare {geoCountry} placeholder as a last resort", () => {
    const out = renderGreeting({
      template: "Hello {geoCountry}!",
      countryCode: undefined,
    });
    expect(out).not.toContain("{geoCountry}");
  });
});
