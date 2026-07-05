import type { Metadata } from "next";
import Link from "next/link";
import { PrivacyFooter } from "@/components/consent/PrivacyFooter";
import { SubscribeForm } from "@/components/subscribe/SubscribeForm";
import { listDigestDates } from "@/lib/digest/archive";
import { VERIFIED_SOURCES } from "@/lib/data-sources";

const NEWSLETTER_DESCRIPTION =
  "The Daily Gawk — one email a day on what actually moved in the AI ecosystem. Tool outages, model ranking moves, SDK adoption shifts. Every number cites its public source.";

export const metadata: Metadata = {
  title: "The Daily Gawk — newsletter",
  description: NEWSLETTER_DESCRIPTION,
  alternates: { canonical: "https://gawk.dev/newsletter" },
  openGraph: {
    title: "The Daily Gawk — newsletter",
    description: NEWSLETTER_DESCRIPTION,
    images: ["/opengraph-image"],
  },
  twitter: {
    title: "The Daily Gawk — newsletter",
    description: NEWSLETTER_DESCRIPTION,
  },
};

// listDigestDates SCANs Redis (no-store) — this page can't prerender.
export const dynamic = "force-dynamic";

/**
 * /newsletter — the marketing landing for the daily digest. /subscribe
 * stays the minimal form-only page (email footers and direct links keep
 * working); this page is the surface the site chrome points at: what
 * the email is, what's inside, a real sample issue, then the same form.
 *
 * Copy discipline (trust contract): the source count is computed from
 * the registry, never hardcoded; the sample link is a real archived
 * issue (hidden when the archive is empty, never a fabricated example);
 * sections listed are the digest's actual sections.
 */
export default async function NewsletterPage() {
  const latestIssue = (await listDigestDates())[0] ?? null;
  const sourceCount = VERIFIED_SOURCES.length;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-foreground">
      <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Free daily email
      </p>
      <h1 className="mb-3 font-mono text-3xl tracking-tight">
        The Daily Gawk
      </h1>
      <p className="mb-8 font-mono text-sm text-teal-300">
        ~2 minutes · {sourceCount} verified sources · zero noise
      </p>

      <p className="mb-10 text-[15px] leading-relaxed text-muted-foreground">
        One email, every morning (UTC): what actually moved in the AI
        ecosystem in the last 24 hours — pulled from the same public feeds
        as the dashboard, nothing inferred or editorialised. Every number
        links to the public source it was read from. Quiet days say so
        instead of manufacturing news. Unsubscribe in one click from any
        email.
      </p>

      <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">
        What&apos;s inside
      </h2>
      <ul className="mb-10 grid gap-3 sm:grid-cols-2">
        {WHATS_INSIDE.map((item) => (
          <li
            key={item.title}
            className="rounded-lg border border-border bg-background/70 p-4"
          >
            <p className="mb-1 text-sm font-medium">{item.title}</p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {item.detail}
            </p>
          </li>
        ))}
      </ul>

      {latestIssue && (
        <p className="mb-10 text-sm text-muted-foreground">
          See for yourself:{" "}
          <Link
            href={`/digest/${latestIssue}`}
            className="text-teal-300 underline underline-offset-2 hover:text-teal-200"
          >
            read the latest issue ({latestIssue})
          </Link>{" "}
          — the web version of exactly what subscribers received.
        </p>
      )}

      <div className="rounded-xl border border-border bg-background/70 p-5">
        <h2 className="mb-3 font-mono text-sm">Get the next issue</h2>
        <SubscribeForm variant="default" />
      </div>
      <p className="mt-4 text-[12px] text-muted-foreground">
        By subscribing you agree to our{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          privacy notice
        </Link>
        . We store a SHA-256 hash of your address plus your country/region
        so we can target the digest regionally. We never share the
        address.
      </p>
      <PrivacyFooter />
    </main>
  );
}

/**
 * The digest's real sections, described in the digest's own terms.
 * Checked against the shipped email template — don't list a section
 * the email doesn't have.
 */
const WHATS_INSIDE = [
  {
    title: "What moved",
    detail:
      "The day's headline changes with ▲/▼ deltas against yesterday's snapshot.",
  },
  {
    title: "Tool Health",
    detail:
      "AI coding tool incidents from first-party status pages, plus a daily snapshot chart.",
  },
  {
    title: "Model Usage & Benchmark movers",
    detail:
      "Rank changes on public usage rankings and benchmark leaderboards — only when a real like-for-like baseline exists.",
  },
  {
    title: "SDKs, agents, labs & the wire",
    detail:
      "Week-over-week SDK download shifts, agent-framework and AI-lab activity, and the top Hacker News stories — each item linked to its source.",
  },
] as const;
