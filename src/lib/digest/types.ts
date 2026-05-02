/**
 * Shared types for the S34 daily digest composer.
 *
 * The composer is deliberately pure: every input comes in as an argument,
 * every output is a plain JSON-serialisable structure. No fetch, no Redis,
 * no env reads. The same `DigestBody` that ships to a subscriber's inbox
 * is also what `/digest/{date}` renders and what `/admin/digest/preview`
 * displays — one shape, three surfaces.
 */

export type DigestMode = "bootstrap" | "diff" | "quiet";

export type DigestSectionId =
  | "tool-health"
  | "hn"
  | "benchmarks"
  | "sdk-adoption"
  | "labs"
  | "model-usage";

/** One bullet inside a digest section. Items render with an optional
 *  per-item source link; any section-level source(s) live on the
 *  containing `DigestSection.sourceUrls`. */
export type DigestSectionItem = {
  /** One-line summary. Required. */
  headline: string;
  /** Optional second-line detail (delta figures, context). */
  detail?: string;
  /** Human-readable source label ("LMArena", "pypistats.org", etc.). */
  sourceLabel?: string;
  /** Source URL that backs this specific item's numbers. */
  sourceUrl?: string;
  /** Optional in-product deep-link path. Relative — renderers prepend
   *  the active baseUrl. SDK adoption rows use this to point at
   *  /panels/sdk-adoption?focus={pkgId}; other sections may add their
   *  own deep destinations later. */
  panelHref?: string;
  /** Verbatim caveat text (e.g. pypistats aggregator caveat). Renders
   *  in small text under the item. */
  caveat?: string;
};

export type DigestSection = {
  id: DigestSectionId;
  title: string;
  /** Fragment identifier for deep links into /digest/{date}#slug. */
  anchorSlug: string;
  /** Per-section mode. HN is always "diff" (current top stories). Other
   *  sections use bootstrap/diff/quiet per the PRD. */
  mode: DigestMode;
  /** One-line summary rendered directly under the section title. */
  headline: string;
  items: DigestSectionItem[];
  /** Section-wide source URLs (distinct from per-item sources). Rendered
   *  as "Source: X" under the items. */
  sourceUrls: string[];
};

export type DigestBody = {
  /** YYYY-MM-DD in UTC. The "for" date of the digest — i.e. the day whose
   *  snapshot was used as "today". */
  date: string;
  subject: string;
  /** Body-level mode:
   *    - "bootstrap" — no yesterday snapshot; sections render current state.
   *    - "diff"      — ≥1 diff-bearing section has deltas to show.
   *    - "quiet"     — yesterday exists but nothing moved; sections render
   *                    current-state tiles under an "All quiet" headline. */
  mode: DigestMode;
  /** Template string for the per-subscriber geo greeting. Contains the
   *  literal placeholder `{geoCountry}` when it should be replaced with
   *  the subscriber's country at render time. When no geo is known the
   *  renderer drops the "in {geoCountry}" clause.
   *
   *  In diff mode this is unused — the template renders `tldr` instead.
   *  Kept populated so bootstrap/quiet modes still have a greeting and
   *  archived bodies can be re-rendered identically. */
  greetingTemplate: string;
  /** Diff-mode summary line: "1 tool incident · 5 HN stories · 4
   *  benchmark movers". Replaces the greeting when set. Optional so
   *  archived bodies (pre-this-field) and bootstrap/quiet modes
   *  (where the metric counts wouldn't make sense) still render. */
  tldr?: string;
  sections: DigestSection[];
  /** ISO of composition (not send). Useful for admin-preview timestamps
   *  and for the public `/digest/{date}` page. */
  generatedAt: string;
};
