/**
 * /admin/digest/preview — operator-only preview of the next send.
 *
 * Server component. Gated by HTTP Basic Auth (ADMIN_PREVIEW_USER +
 * ADMIN_PREVIEW_PASS in env). On 401 the page returns a 401 Response
 * with a WWW-Authenticate challenge so the browser prompts for creds.
 *
 * For the date param (`?date=YYYY-MM-DD`, defaults to the current UTC
 * day) the page composes the DigestBody from today's snapshot, the
 * previous day's snapshot, HN wire, and 24h incidents — identical to
 * the Issue 9 send pipeline — then renders:
 *
 *   1. A metadata block (mode, subject, generatedAt, sections count).
 *   2. The page view (same component that renders /digest/{date}).
 *   3. The rendered email HTML inside a sandboxed iframe so the
 *      operator can sanity-check what the inbox version looks like.
 *
 * No data writes happen here — this is a read-only preview. Opening
 * this page does not create an archive entry, does not send anything,
 * and does not consume rate-limit budget.
 */

import { headers } from "next/headers";
import { requireAdminBasicAuth } from "@/lib/digest/admin-auth";
import { buildDigestForDate, previousUtcDate } from "@/lib/digest/build";
import { readSnapshot, ymdUtc } from "@/lib/data/snapshot";
import { readWire } from "@/lib/data/hn-store";
import { DigestPageView } from "@/components/digest/DigestPageView";
import { renderDigestHtml } from "@/lib/email/templates/digest";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const dynamic = "force-dynamic";

export default async function AdminDigestPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const h = await headers();
  const authResp = requireAdminBasicAuth(h.get("authorization"));
  if (authResp) {
    // Next App Router can't return a Response from a page, so throw
    // to the nearest error boundary with a 401-flavoured payload.
    return <UnauthorizedView />;
  }

  const { date: rawDate } = await searchParams;
  const now = new Date();
  const date = rawDate && DATE_RE.test(rawDate) ? rawDate : ymdUtc(now);
  const previousDate = previousUtcDate(date);

  const build = await buildDigestForDate({
    date,
    previousDate,
    now,
    loadSnapshot: (d) => readSnapshot(d),
    loadHn: () => readWire(),
    // Incidents-24h wiring lands with Issue 9's send pipeline; for the
    // preview we pass an empty list so the operator can at least see
    // the snapshot-driven sections. Tool Health still renders from
    // the snapshot's `tools[]` state.
    loadIncidents24h: async () => [],
  });

  if (!build.ok) {
    return (
      <BuildFailureView
        date={date}
        reason={build.reason}
        message={build.message}
      />
    );
  }

  const baseUrl = inferBaseUrl(h);
  const unsubPreviewUrl = `${baseUrl}/api/subscribe/unsubscribe?token=preview-token`;
  const emailHtml = await renderDigestHtml({
    digest: build.body,
    baseUrl,
    unsubUrl: unsubPreviewUrl,
    countryCode: "GB",
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 text-foreground">
      <header className="mb-8 border-b border-border/60 pb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
          Admin · Digest Preview
        </p>
        <h1 className="mt-1 font-mono text-xl tracking-tight">
          {build.body.subject}
        </h1>
        <dl className="mt-4 grid grid-cols-2 gap-y-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground md:grid-cols-4">
          <dt>Date</dt>
          <dd className="text-foreground normal-case">{build.body.date}</dd>
          <dt>Mode</dt>
          <dd className="text-foreground normal-case">{build.body.mode}</dd>
          <dt>Sections</dt>
          <dd className="text-foreground normal-case">
            {build.body.sections.length}
          </dd>
          <dt>Generated</dt>
          <dd className="text-foreground normal-case">
            {build.body.generatedAt}
          </dd>
        </dl>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Page view (/digest/{build.body.date})
        </h2>
        <div className="rounded border border-border/60">
          <DigestPageView digest={build.body} baseUrl={baseUrl} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Email preview (rendered HTML)
        </h2>
        <iframe
          title="Email preview"
          sandbox=""
          srcDoc={emailHtml}
          className="h-[900px] w-full rounded border border-border/60 bg-white"
        />
      </section>
    </main>
  );
}

function UnauthorizedView(): React.JSX.Element {
  return (
    <main className="mx-auto max-w-md px-6 py-24 text-center text-foreground">
      <h1 className="mb-3 font-mono text-2xl tracking-tight">
        Authentication required
      </h1>
      <p className="text-sm text-muted-foreground">
        This page is restricted. The browser should prompt you for an
        operator username and password. If it did not, reload the page.
      </p>
    </main>
  );
}

function BuildFailureView({
  date,
  reason,
  message,
}: {
  date: string;
  reason: string;
  message: string;
}): React.JSX.Element {
  return (
    <main className="mx-auto max-w-md px-6 py-24 text-foreground">
      <h1 className="mb-3 font-mono text-xl tracking-tight">
        Digest unavailable for {date}
      </h1>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {reason}
      </p>
      <p className="text-sm text-muted-foreground">{message}</p>
    </main>
  );
}

function inferBaseUrl(h: Headers): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_ORIGIN;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "https://aipulse.dev";
}
