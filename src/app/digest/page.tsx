/**
 * /digest — the archive index. Every archived daily digest, newest first,
 * grouped by month.
 *
 * Why this page exists: the sitemap lists every /digest/<date> page, but until
 * this index nothing on the site linked to them. Sitemap-only orphans are the
 * pages Google discovers and declines to index. This is the hub that gives each
 * issue an internal link, and it is linked from the site footer, /newsletter
 * and every issue's own footer.
 *
 * ISR (1h): the list only grows once a day, and listDigestDates is a Redis
 * SCAN we should not repeat per crawler hit. No headers() call, so the page
 * stays cacheable. Fail-soft: an empty list renders an honest empty state,
 * never a fabricated issue.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { PrivacyFooter } from "@/components/consent/PrivacyFooter";
import { listDigestDates } from "@/lib/digest/archive";
import { groupDigestDatesByMonth } from "@/lib/digest/neighbours";

export const revalidate = 3600;

const DESCRIPTION =
  "Every issue of the daily gawk.dev digest: what moved in the AI ecosystem each day, with every number traced to a public source.";

export const metadata: Metadata = {
  title: "Digest archive · gawk.dev",
  description: DESCRIPTION,
  alternates: { canonical: "https://gawk.dev/digest" },
  openGraph: {
    title: "Digest archive · gawk.dev",
    description: DESCRIPTION,
    url: "https://gawk.dev/digest",
    type: "website",
  },
};

const MONTH_FMT = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY_FMT = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function labelMonth(month: string): string {
  return MONTH_FMT.format(new Date(`${month}-01T00:00:00Z`));
}
function labelDay(date: string): string {
  return DAY_FMT.format(new Date(`${date}T00:00:00Z`));
}

export default async function DigestArchiveIndexPage() {
  const dates = await listDigestDates();
  const groups = groupDigestDatesByMonth(dates);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-foreground">
      <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Archive
      </p>
      <h1 className="mb-3 font-mono text-3xl tracking-tight">The Daily gawk.dev, every issue</h1>
      <p className="mb-8 font-mono text-sm text-teal-300">
        {dates.length} {dates.length === 1 ? "issue" : "issues"} · newest first
      </p>
      <p className="mb-10 text-[15px] leading-relaxed text-muted-foreground">
        The web version of each morning&apos;s email, exactly as subscribers received it. Quiet days
        say so. Every number links to the public source it was read from.{" "}
        <Link href="/newsletter" className="text-teal-300 underline underline-offset-2 hover:text-teal-200">
          Get it by email
        </Link>
        .
      </p>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="digest-archive-empty">
          No archived issues are readable right now. The archive is served from the same store as the
          live dashboard; if it is unavailable this list is empty rather than invented.
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.month} className="mb-10" aria-labelledby={`m-${g.month}`}>
            <h2
              id={`m-${g.month}`}
              className="mb-3 font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground"
            >
              {labelMonth(g.month)}
            </h2>
            <ul className="divide-y divide-border rounded-lg border border-border bg-background/70">
              {g.dates.map((d) => (
                <li key={d}>
                  <Link
                    href={`/digest/${d}`}
                    className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm hover:bg-muted/40"
                  >
                    <span>{labelDay(d)}</span>
                    <span className="font-mono text-xs text-muted-foreground">{d}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <PrivacyFooter />
    </main>
  );
}
