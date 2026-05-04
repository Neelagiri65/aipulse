/**
 * Genesis Report — shared types.
 *
 * The Genesis Report is a one-shot launch artifact that takes the
 * existing data engines (snapshots, sdk-adoption, openrouter-rankings,
 * labs activity, agents view, status pages) and packages the strongest
 * signals from the past N days under an operator-chosen editorial
 * theme. Per the PRD (`prd-genesis-report.md`):
 *
 *   - The OPERATOR provides the framing prose (thesis + section
 *     headers + section framing). These are required strings on the
 *     config; no engine-generated fallback exists by construction.
 *
 *   - The ENGINE provides the numbers (data blocks). Each block is a
 *     pure async loader returning `{rows, generatedAt, sanityWarnings}`.
 *     Rows carry sourceUrl + sourceLabel + optional caveat — the
 *     trust contract holds per row.
 *
 *   - The render layer composes both. If editorial copy is the
 *     placeholder string `EDITORIAL_PLACEHOLDER`, the page surfaces
 *     "[editorial section pending]" so unfinished reports are obvious
 *     at a glance. Sanity warnings on a block surface a "data needs
 *     review" banner — operator must clear them before launch.
 *
 * Editorial separation is enforced at this type level — `thesis` and
 * `framing` are required strings, not optional. There is no shape in
 * which the engine can supply prose. Locked at the type level so a
 * future refactor can't accidentally create one.
 */

/**
 * Sentinel string used in operator-editable text fields when the
 * engineering scaffold has shipped but the operator hasn't filled in
 * the copy yet. The render layer replaces it with a visible
 * placeholder + bumps a launch-readiness flag.
 */
export const EDITORIAL_PLACEHOLDER = "[EDITORIAL TBD]" as const;

/**
 * Stable identifier for a data block. Used in: registry config,
 * chart route URL (`/api/reports/[slug]/chart/[blockId]`), tests.
 */
export type GenesisBlockId =
  | "sdk-adoption-gainers-30d"
  | "sdk-adoption-losers-30d"
  | "openrouter-rank-climbers-30d"
  | "openrouter-rank-fallers-30d"
  | "labs-activity-leaders-30d"
  | "tool-incidents-30d"
  | "agents-velocity-30d";

/**
 * One row of data inside a block. Required: label + value + at least
 * one source identifier. Optional: delta (for "change" framings),
 * caveat (verbatim aggregator-side caveat e.g. pypistats wording).
 */
export type GenesisBlockRow = {
  /** Human-readable label (e.g. package name, model name, lab name). */
  label: string;
  /** The headline number. Pre-formatted (the loader applies the
   *  presentation; the render layer prints verbatim). */
  value: string;
  /** Optional change figure, also pre-formatted ("+ 184% w/w",
   *  "↑ 6 ranks"). Loader chooses the symbol set. */
  delta?: string;
  /** Canonical primary-source URL the row's number was read from.
   *  Mandatory per CLAUDE.md trust contract. */
  sourceUrl: string;
  /** Human-readable source name ("OpenRouter rankings", "PyPI",
   *  "LMArena"). Used as the link text. */
  sourceLabel: string;
  /** Verbatim aggregator caveat — when the upstream API itself
   *  asks us to disclose its limitations (PyPI's pypistats notice,
   *  OpenRouter "API-first developer spend" caveat, etc.). */
  caveat?: string;
};

/**
 * Result returned by every block loader. The render layer treats
 * this as a discriminated structure — when `rows` is empty the
 * section renders an "honest empty" state (data temporarily
 * unavailable), never invents a value.
 *
 * Two-channel disclosure (locked S62g):
 *   - `sanityWarnings` is OPS-ONLY. Records "system-internal" data-
 *     quality decisions the loader made (e.g. "ollama -106% excluded
 *     from display, denominator-near-zero artifact suspected"). These
 *     are NEVER rendered on the public report page; an operator-only
 *     view (G8 launch-readiness gate, future) surfaces them. Their
 *     job is to catch ops issues before launch, not to inform readers.
 *   - `caveats` is READER-FACING. Records "what the data does and
 *     does not mean" notes the reader needs to read the block honestly
 *     (e.g. "Based on N days of captured snapshots — represents a
 *     minimum, not a complete count"). Renders as plain inline italic
 *     text under the section, no "DATA NEEDS REVIEW" framing.
 */
export type GenesisBlockResult = {
  /** Block rows in display order. Empty when the upstream is
   *  unreachable / the window has no qualifying movers. */
  rows: GenesisBlockRow[];
  /** ISO timestamp of the moment the loader finished assembling
   *  this block. Used in the per-block hover provenance tooltip. */
  generatedAt: string;
  /** Ops-only sanity warnings. NEVER rendered to the public page.
   *  See type doc for two-channel disclosure rationale. */
  sanityWarnings: string[];
  /** Reader-facing caveats. Rendered as plain italic notes under
   *  the section header. Optional — many blocks have none. */
  caveats?: string[];
};

export type GenesisBlockLoader = () => Promise<GenesisBlockResult>;

/**
 * One section of a report. The header + framing are operator-written;
 * the block id selects which data block renders below them.
 */
export type GenesisSection = {
  /** Operator-written section header. Use EDITORIAL_PLACEHOLDER as
   *  the engineering-scaffold default; render layer surfaces "section
   *  header pending" until the operator overwrites it. */
  header: string;
  /** Operator-written framing prose, ≤80 words. Sets the editorial
   *  angle for the data block below ("torch downloads dropped for
   *  the third consecutive week — open-weight inference is winning
   *  the adoption race"). */
  framing: string;
  /** Which data block renders inside this section. */
  blockId: GenesisBlockId;
};

/**
 * The hero stat at the top of every report. ONE inarguable number
 * pulled from the data engine, with its source URL — the headline
 * the LinkedIn unfurl will carry.
 */
export type GenesisHero = {
  /** The number itself, pre-formatted ("184% w/w", "12 incidents"). */
  stat: string;
  /** One-line caption framing the number ("torch downloads, week 4
   *  of decline"). Operator-written. */
  caption: string;
  /** Source URL the stat is read from. */
  sourceUrl: string;
  /** Human-readable source name. */
  sourceLabel: string;
};

/**
 * Full report config. Lives in `src/lib/reports/<slug>.ts` and is
 * exported as the module default. The registry maps slug → config.
 */
export type GenesisReportConfig = {
  /** URL slug. Matches the `[slug]` segment in /reports/[slug]. */
  slug: string;
  /** Title rendered as the page H1. Operator-written. */
  title: string;
  /** One-line subtitle under the title. Operator-written. */
  subtitle: string;
  /** Window the report covers, free-form ("April 2026", "Q1 2026"). */
  window: string;
  /** ISO date the report was published. Used in /reports/[slug]'s
   *  "Published DD MMM YYYY" stamp + the OG image. */
  publishedAt: string;
  /** Hero stat at the top of the report. */
  hero: GenesisHero;
  /** Operator-written thesis paragraph (markdown, ≤120 words).
   *  Sets the editorial angle for the entire report. Render layer
   *  surfaces "[thesis pending]" while it equals EDITORIAL_PLACEHOLDER. */
  thesis: string;
  /** 5-7 sections in display order. */
  sections: GenesisSection[];
};

/**
 * Operator-checkable predicates used by the launch-readiness gate
 * (G8). Pure functions, no IO.
 */

export function isEditorialPlaceholder(text: string): boolean {
  return text.trim() === EDITORIAL_PLACEHOLDER;
}

export function reportEditorialFilled(config: GenesisReportConfig): boolean {
  if (isEditorialPlaceholder(config.thesis)) return false;
  for (const s of config.sections) {
    if (isEditorialPlaceholder(s.header)) return false;
    if (isEditorialPlaceholder(s.framing)) return false;
  }
  return true;
}
