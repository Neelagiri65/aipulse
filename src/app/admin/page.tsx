/**
 * /admin — operator dashboard index.
 *
 * Server-rendered. Gated by middleware basic-auth (ADMIN_PREVIEW_USER +
 * ADMIN_PREVIEW_PASS). Surfaces operational state at a glance:
 *
 *   1. Platform health — Vercel, Supabase, Cloudflare, Upstash status pages.
 *      The 4 services Gawk itself runs on. Public Tool Health stays AI-only.
 *   2. Cron health — count of healthy / stale workflows, link to detail.
 *   3. Email pipeline — Resend domain configured, last digest send timestamp.
 *   4. Outbound channels — Discord webhook configured y/n.
 *   5. Subscriber count.
 *
 * Failure mode: every section reports its own degradation independently.
 * If Redis is unavailable, cron-health and subscriber sections show "unknown"
 * but platform-health (HTTP-only) still renders.
 */

import Link from "next/link";
import { fetchAllPlatformStatus } from "@/lib/data/fetch-platform-status";
import { readAllCronHealth, isCronStale } from "@/lib/data/cron-health";
import { countSubscribers } from "@/lib/data/subscribers";
import { readDigestBody } from "@/lib/digest/archive";
import { ymdUtc } from "@/lib/data/snapshot";
import type { ToolHealthStatus } from "@/components/health/tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminIndexPage() {
  const now = new Date();
  const today = ymdUtc(now);
  const yesterday = ymdUtc(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  const [platform, cron, subscriberCount, todayDigest, yesterdayDigest] =
    await Promise.all([
      fetchAllPlatformStatus().catch(
        () => null as Awaited<ReturnType<typeof fetchAllPlatformStatus>> | null,
      ),
      readAllCronHealth().catch(() => null),
      countSubscribers().catch(() => 0),
      readDigestBody(today).catch(() => null),
      readDigestBody(yesterday).catch(() => null),
    ]);

  const lastDigest = todayDigest ?? yesterdayDigest;
  const lastDigestDate = todayDigest ? today : yesterdayDigest ? yesterday : null;

  const cronTotal = cron?.length ?? 0;
  const cronStale = cron?.filter((r) => isCronStale(r, now.getTime())).length ?? 0;
  const cronHealthy = cronTotal - cronStale;

  const resendDomainConfigured = Boolean(process.env.RESEND_DOMAIN_ID);
  const resendApiConfigured = Boolean(process.env.RESEND_API_KEY);
  const discordWebhookConfigured = Boolean(
    process.env.DISCORD_TOOL_ALERTS_WEBHOOK_URL,
  );
  const fromAddress = process.env.EMAIL_FROM_ADDRESS ?? "(unset)";

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 text-foreground">
      <header className="mb-8 border-b border-border/60 pb-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
          Admin · Operator Dashboard
        </p>
        <h1 className="mt-1 font-mono text-xl tracking-tight">
          Gawk operations
        </h1>
        <p className="mt-2 text-xs text-muted-foreground">
          Operator-facing state. Public Tool Health card grid stays
          AI-focused — platform infra appears here only.
        </p>
      </header>

      <PlatformSection result={platform} />
      <CronSection total={cronTotal} healthy={cronHealthy} stale={cronStale} hasData={cron !== null} />
      <PipelineSection
        resendApiConfigured={resendApiConfigured}
        resendDomainConfigured={resendDomainConfigured}
        discordWebhookConfigured={discordWebhookConfigured}
        fromAddress={fromAddress}
        lastDigestDate={lastDigestDate}
        lastDigestSubject={lastDigest?.subject ?? null}
        subscriberCount={subscriberCount}
      />
    </main>
  );
}

function statusLabel(status: ToolHealthStatus): string {
  switch (status) {
    case "operational":
      return "operational";
    case "degraded":
      return "degraded";
    case "partial_outage":
      return "partial outage";
    case "major_outage":
      return "major outage";
    default:
      return "unknown";
  }
}

function statusToClasses(status: ToolHealthStatus): string {
  switch (status) {
    case "operational":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    case "degraded":
      return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
    case "partial_outage":
    case "major_outage":
      return "bg-red-500/10 text-red-400 border-red-500/30";
    default:
      return "bg-muted/40 text-muted-foreground border-border/60";
  }
}

function PlatformSection({
  result,
}: {
  result: Awaited<ReturnType<typeof fetchAllPlatformStatus>> | null;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
        Platform health · gawk.dev infra
      </h2>
      {!result ? (
        <p className="rounded border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground">
          Could not reach upstream status pages. Check the deploy region and
          retry.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(["vercel", "supabase", "cloudflare", "upstash"] as const).map(
            (id) => {
              const entry = result.data[id];
              const failure = result.failures.find((f) => f.id === id);
              if (!entry) {
                return (
                  <div
                    key={id}
                    className="rounded border border-border/60 bg-muted/10 p-4"
                  >
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-mono text-sm capitalize">{id}</h3>
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        no data
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {failure?.message ?? "Source unreachable on this poll."}
                    </p>
                  </div>
                );
              }
              return (
                <div
                  key={id}
                  className="rounded border border-border/60 p-4"
                >
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-mono text-sm capitalize">{id}</h3>
                    <span
                      className={`rounded border px-2 py-[2px] font-mono text-[10px] uppercase tracking-[0.12em] ${statusToClasses(entry.status)}`}
                    >
                      {statusLabel(entry.status)}
                    </span>
                  </div>
                  <a
                    href={entry.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                  >
                    {entry.sourceName}
                  </a>
                  {entry.activeIncidents.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {entry.activeIncidents.map((inc) => (
                        <li
                          key={inc.id}
                          className="text-[11px] text-foreground"
                        >
                          <span className="font-mono uppercase text-[10px] tracking-[0.08em] text-muted-foreground">
                            {inc.status}
                          </span>{" "}
                          · {inc.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            },
          )}
        </div>
      )}
    </section>
  );
}

function CronSection({
  total,
  healthy,
  stale,
  hasData,
}: {
  total: number;
  healthy: number;
  stale: number;
  hasData: boolean;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
        Cron health
      </h2>
      <div className="rounded border border-border/60 p-4">
        {!hasData ? (
          <p className="text-xs text-muted-foreground">
            Redis unavailable — cron-health records cannot be read on this
            poll.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 font-mono text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Total
                </p>
                <p className="text-foreground">{total}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Healthy
                </p>
                <p className="text-emerald-400">{healthy}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Stale
                </p>
                <p className={stale > 0 ? "text-red-400" : "text-foreground"}>
                  {stale}
                </p>
              </div>
            </div>
            <Link
              href="/admin/cron-health"
              className="mt-3 inline-block text-[11px] text-primary underline-offset-2 hover:underline"
            >
              View per-workflow detail →
            </Link>
          </>
        )}
      </div>
    </section>
  );
}

function PipelineSection({
  resendApiConfigured,
  resendDomainConfigured,
  discordWebhookConfigured,
  fromAddress,
  lastDigestDate,
  lastDigestSubject,
  subscriberCount,
}: {
  resendApiConfigured: boolean;
  resendDomainConfigured: boolean;
  discordWebhookConfigured: boolean;
  fromAddress: string;
  lastDigestDate: string | null;
  lastDigestSubject: string | null;
  subscriberCount: number;
}) {
  return (
    <section>
      <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
        Outbound pipelines
      </h2>
      <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ConfigCell
          label="Resend API key"
          value={resendApiConfigured ? "configured" : "not set"}
          ok={resendApiConfigured}
        />
        <ConfigCell
          label="Resend domain"
          value={resendDomainConfigured ? "configured" : "not set"}
          ok={resendDomainConfigured}
        />
        <ConfigCell label="From address" value={fromAddress} ok={true} mono />
        <ConfigCell
          label="Discord tool-alert webhook"
          value={discordWebhookConfigured ? "configured" : "operator-pending"}
          ok={discordWebhookConfigured}
        />
        <ConfigCell
          label="Subscribers"
          value={String(subscriberCount)}
          ok={true}
        />
        <ConfigCell
          label="Last digest archive"
          value={
            lastDigestDate
              ? `${lastDigestDate} — ${lastDigestSubject ?? ""}`
              : "no archive in last 48h"
          }
          ok={lastDigestDate !== null}
        />
      </dl>
      <p className="mt-3 text-[11px] text-muted-foreground">
        These are configuration flags read from the running deploy. They do
        not test reachability — a green Resend cell means the env vars are
        set, not that an actual send would succeed.
      </p>
    </section>
  );
}

function ConfigCell({
  label,
  value,
  ok,
  mono = false,
}: {
  label: string;
  value: string;
  ok: boolean;
  mono?: boolean;
}) {
  return (
    <div className="rounded border border-border/60 p-3">
      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-1 ${mono ? "font-mono text-[12px]" : "text-sm"} ${ok ? "text-foreground" : "text-yellow-400"}`}
      >
        {value}
      </dd>
    </div>
  );
}
