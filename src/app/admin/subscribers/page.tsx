/**
 * /admin/subscribers — operator view of the email-capture ledger.
 *
 * Server-rendered. Gated by middleware basic-auth (ADMIN_PREVIEW_USER +
 * ADMIN_PREVIEW_PASS). Displays:
 *
 *   1. Header counters: total, confirmed, pending, unsubscribed.
 *   2. Country breakdown for confirmed subscribers (up to top 10).
 *   3. Recent-signups table (newest first, soft-capped at 500 rows):
 *      email · status · created · confirmed · geo · last delivery error.
 *
 * No analytics. No cookies. No external network calls. Reads exclusively
 * from Upstash via `readAllSubscribers`. Failure modes:
 *   - Redis absent → "Redis unavailable" banner, no rows.
 *   - Decrypt fails on a row → email cell shows "—" (record still renders;
 *     operator can spot the record by hash if needed).
 *
 * Privacy posture: plaintext email is rendered ONLY behind basic-auth.
 * The admin page is `dynamic = "force-dynamic"` and `cache: "no-store"`
 * by default (no caching of PII at the edge).
 */

import Link from "next/link";
import { readAllSubscribers, type AdminSubscriberView } from "@/lib/data/subscribers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminSubscribersPage() {
  const subscribers = await readAllSubscribers().catch(
    () => null as AdminSubscriberView[] | null,
  );

  if (subscribers === null) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10 text-foreground">
        <Header />
        <p className="rounded border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground">
          Redis unavailable — cannot read the subscriber ledger on this poll.
        </p>
      </main>
    );
  }

  const counts = countByStatus(subscribers);
  const countries = topCountries(subscribers);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 text-foreground">
      <Header />
      <SummaryStrip counts={counts} />
      <CountrySection countries={countries} />
      <RecentTable rows={subscribers} />
    </main>
  );
}

function Header() {
  return (
    <header className="mb-6 border-b border-border/60 pb-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
        Admin · Subscribers
      </p>
      <div className="mt-1 flex items-baseline justify-between gap-4">
        <h1 className="font-mono text-xl tracking-tight">Subscriber ledger</h1>
        <Link
          href="/admin"
          className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
        >
          ← back to /admin
        </Link>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Plaintext emails are decrypted server-side from the encrypted
        ledger. Page is no-cache and only renders behind basic-auth.
      </p>
    </header>
  );
}

type StatusCounts = {
  total: number;
  confirmed: number;
  pending: number;
  unsubscribed: number;
};

function countByStatus(rows: AdminSubscriberView[]): StatusCounts {
  let confirmed = 0;
  let pending = 0;
  let unsubscribed = 0;
  for (const r of rows) {
    if (r.status === "confirmed") confirmed += 1;
    else if (r.status === "pending") pending += 1;
    else if (r.status === "unsubscribed") unsubscribed += 1;
  }
  return { total: rows.length, confirmed, pending, unsubscribed };
}

function SummaryStrip({ counts }: { counts: StatusCounts }) {
  return (
    <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label="Total" value={counts.total} tone="default" />
      <Stat label="Confirmed" value={counts.confirmed} tone="ok" />
      <Stat label="Pending" value={counts.pending} tone="warn" />
      <Stat label="Unsubscribed" value={counts.unsubscribed} tone="muted" />
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "ok" | "warn" | "muted";
}) {
  const colour =
    tone === "ok"
      ? "text-emerald-400"
      : tone === "warn"
        ? "text-yellow-400"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="rounded border border-border/60 p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-xl tabular-nums ${colour}`}
        data-testid={`subscriber-count-${label.toLowerCase()}`}
      >
        {value}
      </p>
    </div>
  );
}

function topCountries(
  rows: AdminSubscriberView[],
  limit = 10,
): Array<{ country: string; count: number }> {
  const tally: Record<string, number> = {};
  for (const r of rows) {
    if (r.status !== "confirmed") continue;
    const c = r.geo?.country ?? "—";
    tally[c] = (tally[c] ?? 0) + 1;
  }
  return Object.entries(tally)
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function CountrySection({
  countries,
}: {
  countries: Array<{ country: string; count: number }>;
}) {
  if (countries.length === 0) {
    return (
      <section className="mb-8">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Confirmed by country
        </h2>
        <p className="rounded border border-border/60 p-3 text-xs text-muted-foreground">
          No confirmed subscribers yet.
        </p>
      </section>
    );
  }
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
        Confirmed by country
      </h2>
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {countries.map((c) => (
          <li
            key={c.country}
            className="flex items-baseline justify-between rounded border border-border/60 px-3 py-2"
          >
            <span className="font-mono text-[11px] text-foreground">
              {c.country}
            </span>
            <span className="font-mono text-sm tabular-nums text-foreground">
              {c.count}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecentTable({ rows }: { rows: AdminSubscriberView[] }) {
  if (rows.length === 0) {
    return (
      <section>
        <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Recent signups
        </h2>
        <p className="rounded border border-border/60 p-3 text-xs text-muted-foreground">
          No subscriber records yet. The first row will appear after someone
          completes the subscribe form.
        </p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
        Recent signups · newest first · {rows.length} rendered
      </h2>
      <div className="overflow-x-auto rounded border border-border/60">
        <table
          className="w-full font-mono text-[11px]"
          data-testid="subscribers-table"
        >
          <thead>
            <tr className="bg-muted/20 text-left text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Confirmed</th>
              <th className="px-3 py-2">Geo</th>
              <th className="px-3 py-2">Last delivery error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={r.emailHash} r={r} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({ r }: { r: AdminSubscriberView }) {
  return (
    <tr className="border-t border-border/30 align-top hover:bg-muted/10">
      <td className="px-3 py-2 text-foreground">
        {r.email ? (
          <span title={r.emailHash}>{r.email}</span>
        ) : (
          <span
            className="text-muted-foreground/70"
            title={`hash: ${r.emailHash}`}
          >
            —
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <StatusBadge status={r.status} />
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {fmtIsoToShort(r.createdAt)}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {r.confirmedAt ? fmtIsoToShort(r.confirmedAt) : "—"}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {r.geo?.country ?? "—"}
        {r.geo?.region ? ` · ${r.geo.region}` : ""}
      </td>
      <td className="px-3 py-2">
        {r.lastDeliveryError ? (
          <span className="text-red-400" title={r.lastDeliveryError}>
            {truncate(r.lastDeliveryError, 40)}
          </span>
        ) : (
          <span className="text-muted-foreground/60">—</span>
        )}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: AdminSubscriberView["status"] }) {
  const cls =
    status === "confirmed"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : status === "pending"
        ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
        : "border-border/60 bg-muted/30 text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.1em] ${cls}`}
    >
      {status}
    </span>
  );
}

function fmtIsoToShort(iso: string): string {
  // YYYY-MM-DDTHH:MM:SS.sssZ → YYYY-MM-DD HH:MM (UTC).
  // Avoid Date constructor here so the rendered string is stable in
  // server-side render and doesn't drift with locale formatting.
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : iso;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
