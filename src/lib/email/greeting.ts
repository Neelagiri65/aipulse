/**
 * Per-recipient greeting rendering for the digest email.
 *
 * The composer produces a `greetingTemplate` string with a literal
 * `{geoCountry}` placeholder. At send time we expand it with the
 * subscriber's geo country (if known) or strip the geo clause entirely
 * (when the subscriber is outside a covered jurisdiction or we never
 * captured a country).
 *
 * Pure, deterministic, and isolated so the strip rules stay testable.
 */

export type RenderGreetingInput = {
  template: string;
  countryCode?: string | null;
  /** Locale for Intl.DisplayNames. Defaults to "en". */
  locale?: string;
};

const STRIP_PATTERNS: RegExp[] = [
  / in \{geoCountry\} and beyond/g,
  /, as seen from \{geoCountry\}/g,
  / from \{geoCountry\}/g,
  / in \{geoCountry\}/g,
  /\{geoCountry\}/g,
];

export function renderGreeting(input: RenderGreetingInput): string {
  const { template, countryCode, locale = "en" } = input;
  if (countryCode) {
    const name = resolveCountryName(countryCode, locale);
    return template.replace(/\{geoCountry\}/g, name);
  }
  let out = template;
  for (const pattern of STRIP_PATTERNS) out = out.replace(pattern, "");
  return out;
}

function resolveCountryName(code: string, locale: string): string {
  try {
    const dn = new Intl.DisplayNames([locale], { type: "region" });
    return dn.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
