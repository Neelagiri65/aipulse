/**
 * AI Labs registry — types, schema validator, and constants.
 *
 * Companion to `data/ai-labs.json`. The validator is the gate that keeps
 * the curated JSON honest: every entry must have a verifiable HQ coord,
 * an ISO country code, a valid https source URL for its HQ claim, and
 * at least one tracked repo. The tests at
 * `src/lib/data/__tests__/labs-registry.test.ts` pin the contract.
 *
 * The actual curation criteria are documented in `data/ai-labs.json`'s
 * header comment-field (`_curationCriteria`) so the file is self-
 * describing to reviewers of any PR that edits it.
 */

export type LabKind = "industry" | "academic" | "non-profit";

export type LabRepo = {
  /** GitHub org/user slug, exactly as it appears in the URL path. */
  owner: string;
  /** Repo name. */
  repo: string;
  /** Full https://github.com/{owner}/{repo} URL, for UI link-outs. */
  sourceUrl: string;
};

export type LabEntry = {
  /** Stable kebab-case id, used as a map key and in URLs. */
  id: string;
  /** Display name shown in UI. */
  displayName: string;
  kind: LabKind;
  /** City name as users would recognise it (e.g. "San Francisco", not "SF Bay Area"). */
  city: string;
  /** ISO 3166-1 alpha-2 country code, uppercase. */
  country: string;
  /** HQ latitude in decimal degrees. */
  lat: number;
  /** HQ longitude in decimal degrees. */
  lng: number;
  /** Public URL that substantiates the HQ city/coordinates claim. */
  hqSourceUrl: string;
  /**
   * Lab's primary website (or GH org page when the lab has no stable
   * standalone site — e.g. Tsinghua THUDM). Distinct from `hqSourceUrl`:
   * this is the click target users see when they tap the lab name; that
   * is the provenance citation for the HQ coord. Must be https.
   */
  url: string;
  /** GitHub org slug(s) associated with this lab (may be empty for aggregator-style labs). */
  orgs: string[];
  /** Flagship AI repos to track for activity signal. Must be ≥1. */
  repos: LabRepo[];
  /** Optional note — e.g. "Stanford AI Lab represented by stanford-crfm only". */
  notes?: string;
};

export type ValidationResult =
  | { ok: true; entries: LabEntry[] }
  | { ok: false; error: string };

const KIND_SET: ReadonlySet<LabKind> = new Set([
  "industry",
  "academic",
  "non-profit",
]);

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isCountryCode(v: unknown): v is string {
  return isString(v) && /^[A-Z]{2}$/.test(v);
}

function isHttpsUrl(v: unknown): v is string {
  return isString(v) && v.startsWith("https://");
}

function isGithubUrl(v: unknown): v is string {
  return isString(v) && v.startsWith("https://github.com/");
}

function validateRepo(r: unknown): r is LabRepo {
  if (!r || typeof r !== "object") return false;
  const x = r as Record<string, unknown>;
  return (
    isString(x.owner) &&
    x.owner.length > 0 &&
    isString(x.repo) &&
    x.repo.length > 0 &&
    isGithubUrl(x.sourceUrl)
  );
}

function validateEntry(e: unknown, index: number): LabEntry | string {
  if (!e || typeof e !== "object") {
    return `entry[${index}] is not an object`;
  }
  const x = e as Record<string, unknown>;
  if (!isString(x.id) || x.id.length === 0) {
    return `entry[${index}] missing or empty id`;
  }
  if (!isString(x.displayName) || x.displayName.length === 0) {
    return `entry[${index}] (${x.id}) missing displayName`;
  }
  if (!isString(x.kind) || !KIND_SET.has(x.kind as LabKind)) {
    return `entry[${index}] (${x.id}) invalid kind: ${String(x.kind)}`;
  }
  if (!isString(x.city) || x.city.length === 0) {
    return `entry[${index}] (${x.id}) missing city`;
  }
  if (!isCountryCode(x.country)) {
    return `entry[${index}] (${x.id}) invalid country code: ${String(x.country)}`;
  }
  if (!isNumber(x.lat) || x.lat < -90 || x.lat > 90) {
    return `entry[${index}] (${x.id}) lat out of range: ${String(x.lat)}`;
  }
  if (!isNumber(x.lng) || x.lng < -180 || x.lng > 180) {
    return `entry[${index}] (${x.id}) lng out of range: ${String(x.lng)}`;
  }
  if (!isHttpsUrl(x.hqSourceUrl)) {
    return `entry[${index}] (${x.id}) hqSourceUrl must be https://`;
  }
  if (!isHttpsUrl(x.url)) {
    return `entry[${index}] (${x.id}) url must be https://`;
  }
  if (!Array.isArray(x.orgs) || !x.orgs.every(isString)) {
    return `entry[${index}] (${x.id}) orgs must be string[]`;
  }
  if (!Array.isArray(x.repos) || x.repos.length === 0) {
    return `entry[${index}] (${x.id}) repos must be non-empty array`;
  }
  for (let i = 0; i < x.repos.length; i++) {
    if (!validateRepo(x.repos[i])) {
      return `entry[${index}] (${x.id}) repos[${i}] invalid`;
    }
  }
  if (x.notes !== undefined && !isString(x.notes)) {
    return `entry[${index}] (${x.id}) notes must be string when present`;
  }
  return {
    id: x.id,
    displayName: x.displayName,
    kind: x.kind as LabKind,
    city: x.city,
    country: x.country,
    lat: x.lat,
    lng: x.lng,
    hqSourceUrl: x.hqSourceUrl,
    url: x.url,
    orgs: x.orgs as string[],
    repos: x.repos as LabRepo[],
    notes: x.notes as string | undefined,
  };
}

export function validateLabsRegistry(input: unknown): ValidationResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: "registry must be a top-level array" };
  }
  const ids = new Set<string>();
  const entries: LabEntry[] = [];
  for (let i = 0; i < input.length; i++) {
    const res = validateEntry(input[i], i);
    if (typeof res === "string") {
      return { ok: false, error: res };
    }
    if (ids.has(res.id)) {
      return { ok: false, error: `duplicate id: ${res.id}` };
    }
    ids.add(res.id);
    entries.push(res);
  }
  return { ok: true, entries };
}
