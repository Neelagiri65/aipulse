/**
 * /reports/[slug] — Genesis Report public page.
 *
 * Server-rendered. Reads the report config from the registry; on
 * unknown slug, `notFound()`. Renders:
 *
 *   - Hero (operator-written stat caption + thesis paragraph) with
 *     deterministic provenance footer ("Source: {label} ↗").
 *   - 5-7 sections, each with a header + framing prose + data block.
 *     Data blocks land in G3+; G2 renders a `<BlockPlaceholder>`
 *     surfacing the block id so the layout is verifiable end-to-end.
 *   - Subscribe CTA (single block, links to existing /subscribe flow).
 *   - Methodology footer linking to /sources + /methodology.
 *
 * Editorial separation (PRD #9): if any operator-editable field
 * equals EDITORIAL_PLACEHOLDER, the render layer surfaces an inline
 * "[editorial section pending]" tag so unfinished reports are
 * obvious at a glance — no engine-generated fallback prose, ever.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getReportConfig } from "@/lib/reports/registry";
import { loadBlock } from "@/lib/reports/load-block";
import {
  EDITORIAL_PLACEHOLDER,
  isEditorialPlaceholder,
  reportEditorialFilled,
  type GenesisBlockResult,
  type GenesisReportConfig,
  type GenesisSection,
} from "@/lib/reports/types";
import { formatProvenanceTooltip } from "@/lib/provenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageParams = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const config = getReportConfig(slug);
  if (!config) return { title: "Report not found · Gawk" };
  const titleText = isEditorialPlaceholder(config.title)
    ? `Gawk AI Genesis Report · ${config.window}`
    : `${config.title} · Gawk`;
  const subtitleText = isEditorialPlaceholder(config.subtitle)
    ? `Gawk AI Genesis Report covering ${config.window}. Every number cites its public source.`
    : config.subtitle;
  // S62g.3: meta description must be ≥100 chars per LinkedIn's
  // unfurl-quality bar. The visible page subtitle stays operator-
  // written and short; the META description appends the report
  // window + the Gawk-Report kicker so it lands well over 100 chars
  // without touching operator copy. Falls back to subtitle alone if
  // the operator copy is already long enough.
  const descriptionText =
    subtitleText.length >= 100
      ? subtitleText
      : `${subtitleText} Gawk AI Genesis Report — ${config.window}. Source-cited AI tooling intelligence.`;
  // S62g.4: pin og:image to a STATIC pre-baked PNG in /public/og/.
  // Why: the dynamic /reports/[slug]/opengraph-image route built
  // via next/og + ImageResponse is throwing on prod for this route
  // (returns Next.js error-page HTML with image/png header — caught
  // by LinkedIn Post Inspector reporting "No image found"). The
  // site-wide /opengraph-image works fine; the per-report variant
  // breaks somewhere in the registry-import chain. For this one-shot
  // launch the editorial copy is locked, so a hand-rendered static
  // PNG is more reliable than debugging the Satori render. Future
  // dynamic OGs are TBD; this ships the launch.
  const ogImageUrl = `https://gawk.dev/og/${slug}.png`;
  // S62g.5: article-type metadata for LinkedIn unfurl. The Post
  // Inspector flagged "No author found" + "No publication date
  // found" — both come from `og:article:author` + `og:article:
  // published_time` which Next emits when openGraph.type='article'
  // + openGraph.authors + openGraph.publishedTime are set.
  //
  // Author is the operator (Neelagiri) — the LinkedIn launch post
  // is from his personal account, the editorial framing is his.
  // Engine generates numbers; operator owns the byline.
  //
  // publishedTime: ISO 8601 from `config.publishedAt`. Falls back
  // to today's UTC midnight when the config is still "DRAFT" so
  // the meta tag is never empty even on pre-launch URLs.
  const publishedIso =
    config.publishedAt === "DRAFT"
      ? new Date().toISOString()
      : `${config.publishedAt}T00:00:00.000Z`;
  return {
    title: titleText,
    description: descriptionText,
    // metadata.authors → emits BOTH `<meta name="author">` (the
    // HTML5 author tag — name string) AND `<link rel="author">`
    // (the URL form). Next's API takes name+url as one object.
    authors: [{ name: REPORT_AUTHOR, url: REPORT_AUTHOR_URL }],
    openGraph: {
      type: "article",
      title: titleText,
      description: descriptionText,
      publishedTime: publishedIso,
      // openGraph.authors → emits `<meta property="article:author">`
      // which per the OG spec is a "profile array" — a URL pointing
      // to a profile, NOT a name. LinkedIn enforces this strictly:
      // string-name values get reported as "No author found". Pin
      // the canonical LinkedIn profile URL here so the unfurl
      // resolves the author through their own graph.
      authors: [REPORT_AUTHOR_URL],
      url: `https://gawk.dev/reports/${slug}`,
      siteName: "Gawk",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `Gawk AI Genesis Report — ${config.window}`,
          type: "image/png",
        },
      ],
    },
  };
}

/** Author byline used on every Gawk AI Genesis Report. The operator
 *  owns the editorial framing; the engine generates the numbers.
 *  Surfaces in the HTML5 `<meta name="author">` tag + the JSON-LD
 *  `Person.name`. Updating this single constant updates every report. */
const REPORT_AUTHOR = "Neelagiri";

/** Operator's canonical LinkedIn profile URL. Surfaces as the URL
 *  form in `<meta property="article:author">` (LinkedIn's unfurl
 *  scraper requires a URL, not a string), `<link rel="author">`,
 *  AND the JSON-LD `Person.url`. Pinning the profile URL means
 *  LinkedIn can resolve the author through its own member graph
 *  rather than reporting "No author found". */
const REPORT_AUTHOR_URL =
  "https://www.linkedin.com/in/srinathprasanna-n-b7889622/";

/**
 * JSON-LD Article schema. LinkedIn's unfurl scraper prefers JSON-LD
 * over og:article:* meta tags when both are present (Google Search
 * does too). Without this, LinkedIn was reporting "No author found"
 * + "No publication date found" even with the meta tags emitting
 * correctly — likely because their cache was stuck on the pre-
 * metadata version of the page and the meta tags alone aren't
 * authoritative enough for LinkedIn to override its cache.
 *
 * Schema.org NewsArticle is the right type for a date-bound editorial
 * artifact like the Gawk AI Genesis Report.
 */
function ArticleJsonLd({
  config,
  slug,
  publishedIso,
}: {
  config: GenesisReportConfig;
  slug: string;
  publishedIso: string;
}) {
  const headline = isEditorialPlaceholder(config.title)
    ? `Gawk AI Genesis Report · ${config.window}`
    : config.title;
  const description = isEditorialPlaceholder(config.subtitle)
    ? `Gawk AI Genesis Report covering ${config.window}. Every number cites its public source.`
    : config.subtitle;
  const ld = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline,
    description,
    datePublished: publishedIso,
    dateModified: publishedIso,
    author: [
      {
        "@type": "Person",
        name: REPORT_AUTHOR,
        url: REPORT_AUTHOR_URL,
      },
    ],
    publisher: {
      "@type": "Organization",
      name: "Gawk",
      url: "https://gawk.dev",
    },
    image: [`https://gawk.dev/og/${slug}.png`],
    url: `https://gawk.dev/reports/${slug}`,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://gawk.dev/reports/${slug}`,
    },
  };
  return (
    <script
      type="application/ld+json"
      // JSON.stringify is safe here — the shape is operator-controlled
      // strings, not user input. dangerouslySetInnerHTML is the
      // standard React pattern for inline JSON-LD per Next.js docs.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
    />
  );
}

export default async function ReportPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { slug } = await params;
  const config = getReportConfig(slug);
  if (!config) notFound();

  const editorialFilled = reportEditorialFilled(config);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 text-foreground">
      {/* Single breadcrumb-with-publication line — no separate kicker
       *  above the H1. Reader sees: where they are + when this was
       *  published, in one line. */}
      <p className="mb-6 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <Link
          href="/"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          Gawk
        </Link>
        <span aria-hidden="true"> · </span>
        <span>Gawk AI Genesis Report · {config.window}</span>
        {config.publishedAt !== "DRAFT" && (
          <>
            <span aria-hidden="true"> · </span>
            <span>Published {config.publishedAt}</span>
          </>
        )}
      </p>

      {!editorialFilled && (
        <div
          className="mb-6 rounded border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-amber-300"
          data-testid="report-editorial-pending"
        >
          DRAFT · editorial copy not yet filled · NOT launch-ready
        </div>
      )}

      <ArticleJsonLd
        config={config}
        slug={slug}
        publishedIso={
          config.publishedAt === "DRAFT"
            ? new Date().toISOString()
            : `${config.publishedAt}T00:00:00.000Z`
        }
      />

      <ReportHeader config={config} />

      {await Promise.all(
        config.sections.map(async (section, i) => {
          const block = await loadBlock(section.blockId);
          return (
            <ReportSectionView
              key={`${section.blockId}-${i}`}
              section={section}
              block={block}
            />
          );
        }),
      )}

      <SubscribeCta />
      <MethodologyFooter config={config} />
    </main>
  );
}

function ReportHeader({ config }: { config: GenesisReportConfig }) {
  const titleText = isEditorialPlaceholder(config.title)
    ? `Gawk AI Genesis Report · ${config.window}`
    : config.title;
  const subtitleText = isEditorialPlaceholder(config.subtitle)
    ? `[subtitle pending — operator-editable]`
    : config.subtitle;
  const heroStat = isEditorialPlaceholder(config.hero.stat)
    ? "[hero stat pending]"
    : config.hero.stat;
  const heroCaption = isEditorialPlaceholder(config.hero.caption)
    ? "[hero caption pending]"
    : config.hero.caption;
  const thesis = isEditorialPlaceholder(config.thesis)
    ? "[thesis paragraph pending — operator-editable]"
    : config.thesis;

  // The hero card was carrying a redundant "Hero stat" kicker label
  // and an outsized stat-as-number visual that didn't match operator-
  // written full-sentence statements. New shape: the stat IS the
  // visual lead — large readable text — with the caption directly
  // under and one source citation, no label noise.
  return (
    <header className="mb-8 border-b border-border/40 pb-6">
      <h1 className="text-3xl font-semibold tracking-tight">{titleText}</h1>
      <p className="mt-1.5 text-[14px] text-muted-foreground">{subtitleText}</p>

      <div
        className="mt-5 rounded border border-primary/30 bg-primary/[0.04] px-4 py-4"
        data-testid="report-hero"
      >
        <p className="text-[18px] font-semibold leading-snug text-foreground">
          {heroStat}
        </p>
        {heroCaption && (
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            {heroCaption}
          </p>
        )}
        <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">
          Verify:{" "}
          <a
            href={config.hero.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            {config.hero.sourceLabel} ↗
          </a>
        </p>
      </div>

      <div
        className="mt-5 text-[14px] leading-relaxed text-foreground/90"
        data-testid="report-thesis"
      >
        {thesis}
      </div>
    </header>
  );
}

function ReportSectionView({
  section,
  block,
}: {
  section: GenesisSection;
  block: GenesisBlockResult;
}) {
  const headerText = isEditorialPlaceholder(section.header)
    ? `[section header pending · ${section.blockId}]`
    : section.header;
  const framingText = isEditorialPlaceholder(section.framing)
    ? `[section framing pending — operator-editable]`
    : section.framing;
  return (
    <section
      className="mb-10"
      data-testid={`report-section-${section.blockId}`}
    >
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        {headerText}
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
        {framingText}
      </p>
      <BlockView blockId={section.blockId} block={block} />
    </section>
  );
}

/**
 * Block render. Two-channel disclosure (S62g):
 *   - `block.sanityWarnings` is OPS-ONLY — never rendered on the
 *     public page. The launch-readiness gate (G8, future) surfaces
 *     them in an admin view.
 *   - `block.caveats` is READER-FACING — rendered as plain italic
 *     notes under the section header, no "DATA NEEDS REVIEW" framing
 *     (the reader doesn't need internal-review language).
 *   - Per-row caveat with render-time dedup: when every row in a
 *     block shares the SAME caveat string (the common case for
 *     OpenRouter / SDK adoption blocks where the caveat is
 *     registry-wide, not row-specific), hoist it to a single
 *     section-level note. When caveats DIFFER per row, each row
 *     keeps its own.
 */
function BlockView({
  blockId,
  block,
}: {
  blockId: string;
  block: GenesisBlockResult;
}) {
  const hasRows = block.rows.length > 0;
  const sharedCaveat = pickSharedCaveat(block.rows);
  const blockCaveats = block.caveats ?? [];
  return (
    <div
      className="mt-4"
      data-testid={`report-block-${blockId}`}
    >
      {blockCaveats.length > 0 && (
        <ul
          className="mb-2 space-y-1 text-[12px] italic leading-snug text-muted-foreground"
          data-testid={`report-block-note-${blockId}`}
        >
          {blockCaveats.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}

      {hasRows && sharedCaveat && (
        <p
          className="mb-2 font-mono text-[10px] italic leading-snug text-muted-foreground/80"
          data-testid={`report-block-caveat-${blockId}`}
        >
          {sharedCaveat}
        </p>
      )}

      {hasRows ? (
        <ul
          className="divide-y divide-border/30 rounded border border-border/40"
          title={formatProvenanceTooltip(
            block.generatedAt,
            "https://gawk.dev/sources",
          )}
        >
          {block.rows.map((r, i) => (
            <li
              key={`${r.label}-${i}`}
              className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-baseline sm:justify-between"
            >
              <div className="flex flex-1 flex-col">
                <span className="text-[14px] text-foreground">{r.label}</span>
                {/* Per-row caveat: only render when it differs from the
                 *  shared (hoisted) one. Avoids the every-row repetition
                 *  the operator called out. */}
                {r.caveat && r.caveat !== sharedCaveat && (
                  <span className="mt-0.5 font-mono text-[10px] italic text-muted-foreground/80">
                    {r.caveat}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-baseline gap-3 font-mono text-[12px] tabular-nums">
                <span className="text-foreground">{r.value}</span>
                {r.delta && <span className="text-primary">{r.delta}</span>}
                <a
                  href={r.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] uppercase tracking-wider text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                >
                  {r.sourceLabel} ↗
                </a>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div
          className="rounded border border-dashed border-border/40 bg-muted/[0.04] px-4 py-6 font-mono text-[11px] uppercase tracking-wider text-muted-foreground"
          data-testid={`report-block-empty-${blockId}`}
        >
          [no qualifying rows for this window · honest empty]
        </div>
      )}
    </div>
  );
}

/**
 * Returns the caveat string that's identical across ALL rows in
 * the block (or null when caveats vary or are absent). Pure helper
 * exported for tests.
 */
export function pickSharedCaveat(
  rows: readonly GenesisBlockResult["rows"][number][],
): string | null {
  if (rows.length === 0) return null;
  const first = rows[0].caveat;
  if (!first) return null;
  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i].caveat !== first) return null;
  }
  return first;
}

function SubscribeCta() {
  return (
    <section
      className="mt-12 rounded border border-primary/40 bg-primary/[0.06] px-5 py-5"
      data-testid="report-subscribe-cta"
    >
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        Subscribe to the daily digest
      </h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        The same lens — every number cites its source, no scoring, no
        editorialised takes — applied every UTC day. We don&rsquo;t
        promise more reports like this one; the daily is the cadence.
      </p>
      <Link
        href="/subscribe"
        className="mt-3 inline-block rounded border border-primary/60 bg-primary/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-primary hover:bg-primary/20"
      >
        Subscribe →
      </Link>
    </section>
  );
}

function MethodologyFooter({ config: _config }: { config: GenesisReportConfig }) {
  // Keep this footer to ONE line. The publication date + window
  // already render in the breadcrumb at the top. Repeating them here
  // is digest-bloat. The methodology + sources links are the only
  // genuinely-new info this footer carries.
  return (
    <footer className="mt-10 border-t border-border/40 pt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      Every number traces to a public source ·{" "}
      <Link
        href="/sources"
        className="underline decoration-dotted underline-offset-2 hover:text-foreground"
      >
        Sources ↗
      </Link>{" "}
      ·{" "}
      <Link
        href="/methodology"
        className="underline decoration-dotted underline-offset-2 hover:text-foreground"
      >
        Methodology ↗
      </Link>
      {/* Sentinel for tests, not visible. */}
      <span
        className="sr-only"
        data-testid="report-editorial-placeholder-sentinel"
      >
        {EDITORIAL_PLACEHOLDER}
      </span>
    </footer>
  );
}
