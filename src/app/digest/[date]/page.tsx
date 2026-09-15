/**
 * Public `/digest/{date}` page — read-only archive of a single daily
 * digest. Reached from:
 *   - the "View on gawk.dev" link in an email,
 *   - shared LinkedIn/X posts (share-offsite resolves og: tags here).
 *
 * Server component. Reads the `DigestBody` from Redis via
 * `readDigestBody(date)` and renders through `DigestPageView`. Bad dates
 * and missing archives both return 404 so we don't leak which dates the
 * system has (or doesn't have) processed.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listDigestDates, readDigestBody } from "@/lib/digest/archive";
import { digestNeighbours } from "@/lib/digest/neighbours";
import { DigestTileBoard } from "@/components/digest/DigestTileBoard";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function loadDigest(date: string) {
  if (!DATE_RE.test(date)) return null;
  return readDigestBody(date);
}

/**
 * A past day's digest is immutable, so the page is ISR (1h, on demand). It used
 * to call headers() to infer the origin for absolute links, which made every
 * issue a per-request render with `private, no-store` — 100+ identical pages
 * that neither Vercel's cache nor a crawler could reuse. The origin now comes
 * from the same env + fallback the sitemap uses; preview hosts get canonical /
 * share URLs that point at production, which is what a canonical should do.
 */
export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams(): { date: string }[] {
  return []; // every issue renders on first request, then serves from cache
}

function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_ORIGIN?.trim().replace(/\/$/, "") || "https://gawk.dev";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  const digest = await loadDigest(date);
  if (!digest) {
    return { title: "gawk.dev — archive not found", robots: { index: false } };
  }
  const baseUrl = siteOrigin();
  const url = `${baseUrl}/digest/${digest.date}`;
  const chartUrl = `${baseUrl}/api/digest/chart/tool-health/${digest.date}`;
  const description =
    digest.mode === "quiet"
      ? "A quiet day in the AI ecosystem. Baseline metrics from gawk.dev."
      : "Five verifiable things that moved in the AI ecosystem. Every number traces to a public source.";
  return {
    title: digest.subject,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: digest.subject,
      description,
      url,
      type: "article",
      publishedTime: digest.generatedAt,
      // The day's tool-health chart: a real image of that day's data, not a
      // generic brand card. Every date renders one (720×320 PNG).
      images: [{ url: chartUrl, width: 720, height: 320, alt: `Tool health on ${digest.date}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: digest.subject,
      description,
      images: [chartUrl],
    },
  };
}

export default async function DigestArchivePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const digest = await loadDigest(date);
  if (!digest) notFound();
  const baseUrl = siteOrigin();
  // Prev/next issue links: every archived issue must be reachable from another
  // page, not only from the sitemap. listDigestDates is fail-soft ([] on Redis
  // error), so a store hiccup degrades to "no neighbours", never a 500.
  const neighbours = digestNeighbours(await listDigestDates(), digest.date);
  return (
    <>
      <DigestJsonLd digest={digest} baseUrl={baseUrl} />
      <DigestTileBoard digest={digest} baseUrl={baseUrl} neighbours={neighbours} />
    </>
  );
}

/**
 * Structured data for one archived issue. Until this, 100+ issue pages had
 * og:article and nothing else — no Article entity, no image, no breadcrumb
 * telling a crawler they hang off /digest. Shape mirrors reports/[slug].
 * Author is the publisher: the digest is generated from public feeds, no
 * person writes it, and saying so is the honest claim.
 */
function DigestJsonLd({ digest, baseUrl }: { digest: { date: string; subject: string; generatedAt: string; mode: string }; baseUrl: string }) {
  const url = `${baseUrl}/digest/${digest.date}`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline: digest.subject,
        description:
          digest.mode === "quiet"
            ? "A quiet day in the AI ecosystem. Baseline metrics from gawk.dev."
            : "Five verifiable things that moved in the AI ecosystem. Every number traces to a public source.",
        datePublished: digest.generatedAt,
        dateModified: digest.generatedAt,
        author: { "@id": `${baseUrl}/#org` },
        publisher: { "@id": `${baseUrl}/#org` },
        image: [`${baseUrl}/api/digest/chart/tool-health/${digest.date}`],
        url,
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        isPartOf: { "@type": "CollectionPage", "@id": `${baseUrl}/digest#archive` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "gawk.dev", item: `${baseUrl}/` },
          { "@type": "ListItem", position: 2, name: "Digest archive", item: `${baseUrl}/digest` },
          { "@type": "ListItem", position: 3, name: digest.date, item: url },
        ],
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      data-testid="digest-jsonld"
      // Operator-controlled strings only (date, subject, generatedAt from our own archive).
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
    />
  );
}
