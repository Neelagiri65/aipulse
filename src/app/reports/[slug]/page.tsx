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
    ? `Genesis Report · ${config.window} · Gawk`
    : `${config.title} · Gawk`;
  const subtitleText = isEditorialPlaceholder(config.subtitle)
    ? `Genesis Report covering ${config.window}. Every number cites its public source.`
    : config.subtitle;
  return {
    title: titleText,
    description: subtitleText,
    openGraph: { title: titleText, description: subtitleText },
  };
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
        <span>Genesis Report · {config.window}</span>
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
    ? `Genesis Report · ${config.window}`
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

function BlockView({
  blockId,
  block,
}: {
  blockId: string;
  block: GenesisBlockResult;
}) {
  const hasRows = block.rows.length > 0;
  return (
    <div
      className="mt-4"
      data-testid={`report-block-${blockId}`}
    >
      {block.sanityWarnings.length > 0 && (
        <div
          className="mb-3 rounded border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2 font-mono text-[11px] leading-snug text-amber-300"
          data-testid={`report-block-sanity-${blockId}`}
        >
          <p className="uppercase tracking-wider">data needs review</p>
          <ul className="mt-1 list-disc pl-4 normal-case text-amber-200/90">
            {block.sanityWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
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
                {r.caveat && (
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
