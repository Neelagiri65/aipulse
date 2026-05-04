/**
 * /lab/[slug] — entity-page for an AI Lab in the curated registry.
 *
 * Server-rendered. Reads from `fetchLabActivity()` — the same payload
 * the AI Labs panel and the labs cron consume. The 6h Next.js Data
 * Cache means a page-view rarely hits GitHub directly; the cron
 * refreshes the cache on schedule.
 *
 * Routing rule: only labs ranked in the current top-N by 7-day activity
 * resolve. Lower-ranked labs return 404 to keep the surface tight (and
 * avoid spinning up SEO routes for inactive entities). Top-N is read
 * fresh each request — the ranking can change as activity moves.
 *
 * Trust contract:
 *   - Every number is read from the existing LabActivity payload.
 *     No invented metrics, no per-event LLM inference, no scoring.
 *   - "Last 10 events" is intentionally NOT shown — the existing
 *     fetcher aggregates the GH Events API into per-type counts, and
 *     materialising raw events would require a fresh per-page upstream
 *     call. The per-event-type + per-repo breakdown serves as the
 *     activity timeline; "Source ↗" links jump readers to GitHub for
 *     individual event detail when needed.
 *   - HQ coordinate provenance is surfaced via the same hqSourceUrl
 *     link the LabCard uses — the user can verify the city claim.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  fetchLabActivity,
  type LabActivity,
} from "@/lib/data/fetch-labs";
import {
  LAB_PAGE_TOP_N_DEFAULT,
  pickTopLabsBy7dActivity,
} from "@/lib/data/labs-top";
import { shortEventType } from "@/components/globe/event-types";
import { formatProvenanceTooltip } from "@/lib/provenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageParams = { slug: string };

async function loadTopLab(slug: string): Promise<LabActivity | null> {
  let payload;
  try {
    payload = await fetchLabActivity();
  } catch {
    return null;
  }
  const top = pickTopLabsBy7dActivity(payload, LAB_PAGE_TOP_N_DEFAULT);
  return top.find((l) => l.id === slug) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const lab = await loadTopLab(slug);
  if (!lab) return { title: "Lab not found · Gawk" };
  const title = `${lab.displayName} · AI Lab profile · Gawk`;
  const description = `${lab.displayName} — ${lab.city}, ${lab.country}. ${lab.total} GitHub events across ${lab.repos.length} tracked repos in the last 7 days. Aggregated from public GitHub Events API; verified HQ coordinate.`;
  return {
    title,
    description,
    openGraph: { title, description },
  };
}

export default async function LabEntityPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { slug } = await params;
  const lab = await loadTopLab(slug);
  if (!lab) notFound();

  const payload = await fetchLabActivity();
  const generatedAt = payload.generatedAt;
  const typeEntries = Object.entries(lab.byType)
    .filter(([, n]) => n > 0)
    .sort((a, z) => z[1] - a[1]);
  const sortedRepos = [...lab.repos].sort((a, b) => b.total - a.total);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 text-foreground">
      <nav className="mb-6 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <Link
          href="/"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          Gawk
        </Link>
        <span aria-hidden="true"> / </span>
        <Link
          href="/sources"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          AI Labs
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-foreground/80">{lab.displayName}</span>
      </nav>

      <header className="mb-7 border-b border-border/40 pb-5">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span
            className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white"
            style={{ backgroundColor: "#a855f7" }}
          >
            AI LAB
          </span>
          <KindPill kind={lab.kind} />
          {lab.stale && (
            <span className="ap-sev-pill ap-sev-pill--pending">STALE</span>
          )}
          {!lab.stale && lab.total === 0 && (
            <span className="ap-sev-pill ap-sev-pill--pending">QUIET 7D</span>
          )}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          <a
            href={lab.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#a855f7] hover:underline"
          >
            {lab.displayName}
          </a>
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
          <span>
            HQ: {lab.city}, {lab.country}
          </span>
          <a
            href={lab.hqSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            HQ source ↗
          </a>
        </div>
      </header>

      <section className="mb-6">
        <h2 className="ap-label-sm mb-2">7-day activity</h2>
        <p className="font-mono text-[28px] tabular-nums text-foreground">
          {lab.total.toLocaleString()}
          <span className="ml-2 text-[12px] uppercase tracking-wider text-muted-foreground">
            events
          </span>
        </p>
        {typeEntries.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {typeEntries.map(([t, n]) => (
              <span
                key={t}
                className="ap-sev-pill ap-sev-pill--info tabular-nums"
                title={t}
              >
                {shortEventType(t)} · {n}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            No GitHub events in the rolling 7-day window. Lab is tracked
            but quiet.
          </p>
        )}
      </section>

      {lab.orgs.length > 0 && (
        <section className="mb-6">
          <h2 className="ap-label-sm mb-2">GitHub orgs</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px]">
            {lab.orgs.map((org) => (
              <li key={org}>
                <a
                  href={`https://github.com/${org}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground/90 hover:text-[#a855f7] hover:underline"
                >
                  {org} ↗
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-6">
        <h2 className="ap-label-sm mb-2">
          Tracked repos · {lab.repos.length}
        </h2>
        <ul className="divide-y divide-border/30 border-y border-border/30">
          {sortedRepos.map((r) => (
            <li
              key={`${r.owner}/${r.repo}`}
              className="flex items-center justify-between gap-3 py-2"
            >
              <a
                href={r.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate font-mono text-[12px] text-foreground/90 hover:text-[#a855f7] hover:underline"
              >
                {r.owner}/{r.repo} ↗
              </a>
              <span className="flex shrink-0 items-center gap-2">
                {r.stale && (
                  <span className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-wider text-amber-400">
                    stale
                  </span>
                )}
                <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                  {r.total.toLocaleString()}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">
          Per-repo activity · 7d total · click any repo to inspect events on GitHub.
        </p>
      </section>

      {lab.notes && (
        <section className="mb-6 rounded-md border border-border/40 bg-muted/10 p-3 text-[12px] leading-relaxed text-muted-foreground">
          <span className="ap-label-sm mr-2">Note</span>
          {lab.notes}
        </section>
      )}

      <footer
        className="mt-10 border-t border-border/40 pt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
        title={formatProvenanceTooltip(generatedAt, "https://gawk.dev/sources")}
      >
        Aggregated from public GitHub Events API. Top-{LAB_PAGE_TOP_N_DEFAULT} by 7d activity only.{" "}
        <Link
          href="/sources"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          Methodology ↗
        </Link>
      </footer>
    </main>
  );
}

function KindPill({ kind }: { kind: LabActivity["kind"] }) {
  const label =
    kind === "industry"
      ? "INDUSTRY"
      : kind === "academic"
        ? "ACADEMIC"
        : "NON-PROFIT";
  const cls =
    kind === "industry"
      ? "ap-sev-pill ap-sev-pill--info"
      : "ap-sev-pill ap-sev-pill--pending";
  return <span className={cls}>{label}</span>;
}
