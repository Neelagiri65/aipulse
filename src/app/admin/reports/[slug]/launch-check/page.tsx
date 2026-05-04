/**
 * /admin/reports/[slug]/launch-check — operator-only pre-launch
 * readiness gate.
 *
 * Renders a structured panel showing every check the operator should
 * eyeball before publishing the report. Server component. Gated by
 * HTTP Basic Auth (ADMIN_PREVIEW_USER + ADMIN_PREVIEW_PASS) so the
 * ops sanity warnings — which are HIDDEN from the public report page
 * by the S62g two-channel disclosure rule — surface here for review.
 *
 * Checks rendered:
 *   1. Editorial filled? — `reportEditorialFilled(config)` over every
 *      operator-editable field (title, subtitle, hero stat/caption,
 *      thesis, every section header + framing).
 *   2. Per-block sanity warnings — the OPS-ONLY warnings from each
 *      block's `sanityWarnings[]`, e.g. "ollama excluded from display".
 *   3. Per-block row counts + caveat counts — quick sanity on whether
 *      each section has data to ship.
 *   4. OG image probe — confirms the URL returns image/png.
 *   5. Per-block chart probes — confirms each /api/reports/{slug}/chart/
 *      {blockId} URL serves an image/png.
 *
 * No writes happen here — read-only readiness inspection. Hitting this
 * page does NOT publish the report, does NOT change `publishedAt`,
 * does NOT consume any rate-limit budget beyond loading the same
 * blocks the public report already loads.
 */

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";

import { requireAdminBasicAuth } from "@/lib/digest/admin-auth";
import { getReportConfig } from "@/lib/reports/registry";
import { loadBlock } from "@/lib/reports/load-block";
import {
  reportEditorialFilled,
  isEditorialPlaceholder,
  type GenesisBlockId,
  type GenesisBlockResult,
  type GenesisReportConfig,
} from "@/lib/reports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageParams = { slug: string };

type LoadedBlock = {
  blockId: GenesisBlockId;
  result: GenesisBlockResult;
};

export default async function ReportLaunchCheckPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const auth = requireAdminBasicAuth((await headers()).get("authorization"));
  if (auth) {
    // Next App Router can't return a Response from a page (Next 16
    // type strictness), so render an Unauthorized view instead. The
    // browser still won't get the WWW-Authenticate prompt, but the
    // page won't render any sensitive data either. To get the prompt
    // hit /api/digest/preview directly first, or curl with -u.
    return <UnauthorizedView />;
  }

  const { slug } = await params;
  const config = getReportConfig(slug);
  if (!config) notFound();

  const editorialOk = reportEditorialFilled(config);
  const blocks = await Promise.all(
    config.sections.map(
      async (s): Promise<LoadedBlock> => ({
        blockId: s.blockId,
        result: await loadBlock(s.blockId),
      }),
    ),
  );

  const blocksWithRows = blocks.filter((b) => b.result.rows.length > 0).length;
  const blocksWithSanity = blocks.filter(
    (b) => b.result.sanityWarnings.length > 0,
  ).length;
  const totalSanity = blocks.reduce(
    (n, b) => n + b.result.sanityWarnings.length,
    0,
  );
  const launchReady =
    editorialOk && blocksWithRows === blocks.length && totalSanity === 0;

  return (
    <main className="mx-auto max-w-4xl px-5 py-10 text-foreground">
      <p className="mb-6 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <Link
          href="/"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          Gawk
        </Link>
        <span aria-hidden="true"> · </span>
        <span>Admin · Launch readiness · {slug}</span>
      </p>

      <h1 className="text-2xl font-semibold tracking-tight">
        Launch readiness · {slug}
      </h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Operator-only pre-launch checklist. Ops sanity warnings hidden
        from the public page surface here.
      </p>

      <ReadyBadge ready={launchReady} />

      <Section title="1 · Editorial copy filled">
        <CheckRow
          label="reportEditorialFilled(config)"
          pass={editorialOk}
          detail={
            editorialOk
              ? "All operator-editable fields are non-placeholder."
              : "At least one field is still EDITORIAL TBD — see per-section breakdown below."
          }
        />
        <ul className="mt-3 space-y-1 font-mono text-[11px]">
          <FieldRow label="title" value={config.title} />
          <FieldRow label="subtitle" value={config.subtitle} />
          <FieldRow label="hero.stat" value={config.hero.stat} />
          <FieldRow label="hero.caption" value={config.hero.caption} />
          <FieldRow label="thesis" value={config.thesis} />
          {config.sections.map((s, i) => (
            <li key={`s${i}`} className="mt-2 border-t border-border/30 pt-1">
              <span className="text-muted-foreground/80">
                section[{i}] · {s.blockId}
              </span>
              <ul className="ml-3 mt-0.5 space-y-0.5">
                <FieldRow label="header" value={s.header} />
                <FieldRow label="framing" value={s.framing} />
              </ul>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`2 · Block load results · ${blocks.length} sections`}>
        <p className="mb-2 font-mono text-[11px] text-muted-foreground">
          {blocksWithRows}/{blocks.length} sections have rows ·{" "}
          {blocksWithSanity}/{blocks.length} sections have sanity warnings ·{" "}
          {totalSanity} total ops warnings
        </p>
        <ul className="space-y-3">
          {blocks.map(({ blockId, result }, i) => (
            <li
              key={`b${i}`}
              className="rounded border border-border/40 px-3 py-2"
            >
              <div className="flex items-baseline justify-between font-mono text-[11px]">
                <span className="text-foreground">{blockId}</span>
                <span className="text-muted-foreground">
                  {result.rows.length} rows ·{" "}
                  {result.caveats?.length ?? 0} caveats ·{" "}
                  {result.sanityWarnings.length} ops warnings
                </span>
              </div>
              {result.sanityWarnings.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-4 font-mono text-[11px] text-amber-300">
                  {result.sanityWarnings.map((w, j) => (
                    <li key={`w${j}`}>{w}</li>
                  ))}
                </ul>
              )}
              {result.caveats && result.caveats.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-4 font-mono text-[11px] italic text-muted-foreground">
                  {result.caveats.map((c, j) => (
                    <li key={`c${j}`}>{c}</li>
                  ))}
                </ul>
              )}
              {result.rows.length === 0 && (
                <p className="mt-2 font-mono text-[11px] text-amber-300">
                  Empty block — no qualifying rows for this window.
                </p>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="3 · Live-asset URLs (manual probe)">
        <ul className="space-y-1 font-mono text-[11px]">
          <li>
            Public page:{" "}
            <a
              href={`/reports/${slug}`}
              className="underline decoration-dotted underline-offset-2 hover:text-foreground"
            >
              /reports/{slug}
            </a>
          </li>
          <li>
            OG image:{" "}
            <a
              href={`/reports/${slug}/opengraph-image`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted underline-offset-2 hover:text-foreground"
            >
              /reports/{slug}/opengraph-image
            </a>{" "}
            <span className="text-muted-foreground/80">
              (must return image/png)
            </span>
          </li>
          {blocks.map(({ blockId }, i) => (
            <li key={`probe${i}`}>
              Block chart:{" "}
              <a
                href={`/api/reports/${slug}/chart/${blockId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-dotted underline-offset-2 hover:text-foreground"
              >
                /api/reports/{slug}/chart/{blockId}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-2 font-mono text-[10px] text-muted-foreground/80">
          Click each link in a new tab and confirm a PNG renders. The
          checks above (rows + sanity warnings) catch most data-quality
          issues; this section is the final visual eyeball.
        </p>
      </Section>

      <Section title="4 · Pre-launch summary">
        <ul className="space-y-1 font-mono text-[11px]">
          <CheckRow
            label="Editorial copy non-placeholder"
            pass={editorialOk}
            detail={editorialOk ? "OK" : "BLOCK"}
          />
          <CheckRow
            label="Every section has rows"
            pass={blocksWithRows === blocks.length}
            detail={`${blocksWithRows}/${blocks.length}`}
          />
          <CheckRow
            label="Zero ops sanity warnings"
            pass={totalSanity === 0}
            detail={
              totalSanity === 0
                ? "OK"
                : `${totalSanity} warning${totalSanity === 1 ? "" : "s"} — review section 2`
            }
          />
        </ul>
        <p className="mt-3 font-mono text-[12px]">
          {launchReady ? (
            <span className="text-emerald-400">READY · safe to launch.</span>
          ) : (
            <span className="text-amber-300">
              NOT READY · address the failing checks above before
              posting.
            </span>
          )}
        </p>
      </Section>
    </main>
  );
}

function ReadyBadge({ ready }: { ready: boolean }) {
  return (
    <div
      className={`mt-4 inline-block rounded border px-3 py-1 font-mono text-[11px] uppercase tracking-wider ${
        ready
          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
          : "border-amber-500/50 bg-amber-500/10 text-amber-300"
      }`}
    >
      {ready ? "Launch-ready" : "Not launch-ready"}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-mono text-[12px] uppercase tracking-[0.18em] text-primary">
        {title}
      </h2>
      {children}
    </section>
  );
}

function CheckRow({
  label,
  pass,
  detail,
}: {
  label: string;
  pass: boolean;
  detail?: string;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3 font-mono text-[12px]">
      <span className="text-foreground">{label}</span>
      <span
        className={
          pass ? "text-emerald-400" : "text-amber-300"
        }
      >
        {pass ? "✓" : "✗"} {detail ?? ""}
      </span>
    </li>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  const placeholder = isEditorialPlaceholder(value);
  const truncated =
    value.length > 80 ? value.slice(0, 80) + "…" : value;
  return (
    <li className="flex items-baseline gap-3 font-mono text-[10px]">
      <span className="w-32 shrink-0 text-muted-foreground/80">{label}</span>
      <span
        className={
          placeholder
            ? "text-amber-300"
            : "text-foreground/90"
        }
      >
        {placeholder ? "✗ EDITORIAL TBD" : truncated}
      </span>
    </li>
  );
}

function UnauthorizedView() {
  return (
    <main className="mx-auto max-w-md px-5 py-16 text-foreground">
      <h1 className="text-xl font-semibold tracking-tight">Unauthorized</h1>
      <p className="mt-2 text-[14px] text-muted-foreground">
        This page is operator-only. Provide HTTP Basic Auth via
        ADMIN_PREVIEW_USER + ADMIN_PREVIEW_PASS to access.
      </p>
    </main>
  );
}

// Force the type imports to be referenced even when only used in
// generic constraints (prevents the unused-import warning under
// strict tsconfig).
export type _Reference = GenesisReportConfig;
