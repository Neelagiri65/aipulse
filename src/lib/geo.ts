/**
 * geo — Vercel request-header → jurisdiction classifier for the
 * cookie-consent banner + email-capture gate.
 *
 * `covered=true` means the visitor is in a jurisdiction where we must
 * show a consent banner before firing analytics or prompting for
 * email capture. Scope locked for session 33 (per user grill):
 *
 *   - EU27 (Art. 3 GDPR scope)
 *   - UK (UK GDPR + DPA 2018)
 *   - EEA non-EU: Iceland, Liechtenstein, Norway
 *   - California (CCPA / CPRA) — country=US, region=CA
 *
 * Brazil / Canada / Australia etc. expand later on user growth —
 * don't over-engineer compliance for zero users.
 *
 * No IP-geolocation fallback. Vercel's x-vercel-ip-* headers are the
 * single source of truth; absent headers → covered=false (non-covered
 * default, analytics-on per §13 of the PRD).
 */

export const EU_27 = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
] as const;

export const EEA_NON_EU = ["IS", "LI", "NO"] as const;

export type GeoInfo = {
  country: string | null;
  region: string | null;
  covered: boolean;
};

type HeaderLike = {
  get(name: string): string | null;
};

function norm(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.toUpperCase();
}

/**
 * Parse Vercel geo headers from a Request (or anything with .headers.get).
 * Accepts both Headers and plain objects with a get method so the helper
 * is unit-testable without synthesising a real Request.
 */
export function parseGeo(headers: HeaderLike): GeoInfo {
  const country = norm(headers.get("x-vercel-ip-country"));
  const region = norm(headers.get("x-vercel-ip-country-region"));
  return {
    country,
    region,
    covered: isCoveredJurisdiction(country, region),
  };
}

export function isCoveredJurisdiction(
  country: string | null,
  region: string | null,
): boolean {
  if (country === null) return false;
  if ((EU_27 as readonly string[]).includes(country)) return true;
  if ((EEA_NON_EU as readonly string[]).includes(country)) return true;
  if (country === "GB") return true;
  if (country === "US" && region === "CA") return true;
  return false;
}
