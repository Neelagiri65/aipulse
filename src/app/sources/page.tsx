/**
 * Gawk — /sources transparency page.
 *
 * Server component. Lists every data source feeding the dashboard,
 * grouped into 8 user-facing categories. For each source we surface:
 * name, what it tracks, declared cadence, last successful poll
 * timestamp, and a live/stale/on-demand/unknown badge.
 *
 * Data flow:
 *   - Inventory (categorisation + descriptions) is static — built from
 *     `data-sources.ts` plus the OpenRouter virtual entry.
 *   - Freshness is resolved per-request from the cron-health record
 *     set + the `feed:lk:{key}` last-known cache write timestamps.
 *
 * Trust contract: every row links to a verifiable public URL. A row
 * with no recent poll renders "Stale" honestly rather than dropping
 * out of the list — per the trust contract on `/methodology`.
 */

import Link from "next/link";
import { Redis } from "@upstash/redis";

import { PrivacyFooter } from "@/components/consent/PrivacyFooter";
import {
  CATEGORIES,
  buildInventory,
  formatFrequency,
  groupByCategory,
  type CategoryDescriptor,
  type InventoryEntry,
} from "@/lib/sources/inventory";
import {
  formatRelative,
  indexCronRecords,
  resolveFreshness,
  type FreshnessTone,
  type ResolvedFreshness,
} from "@/lib/sources/freshness";
import { readAllCronHealth } from "@/lib/data/cron-health";

import labsData from "../../../data/ai-labs.json";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sources · Gawk",
  description:
    "Every data source feeding the Gawk dashboard. Grouped by category with the last successful poll timestamp and a live / stale badge per source.",
};

const LAST_KNOWN_KEYS = ["status", "research", "labs"] as const;

export default async function SourcesPage() {
  const nowMs = Date.now();
  const inventory = buildInventory();

  const [cronRecords, lastKnownMap] = await Promise.all([
    safeReadCronHealth(),
    safeReadLastKnown(LAST_KNOWN_KEYS),
  ]);

  const cronByWorkflow = indexCronRecords(cronRecords);
  const lastKnownLookup = (key: string) => lastKnownMap.get(key) ?? null;

  const grouped = groupByCategory(inventory);

  // Resolve freshness once per entry so the headline "Live now" tally
  // and the per-row badges agree. Single derivation, two consumers.
  const resolvedById = new Map<string, ResolvedFreshness>();
  for (const entry of inventory) {
    resolvedById.set(
      entry.id,
      resolveFreshness(entry, {
        cronByWorkflow,
        lastKnown: lastKnownLookup,
        nowMs,
      }),
    );
  }

  const totals = summariseTotals(inventory, resolvedById);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 space-y-10">
      <header className="space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Transparency
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          Every number on Gawk traces to a public source. This page lists
          all {totals.sourceCount} data sources currently feeding the
          dashboard, plus {totals.labCount} curated AI labs that compose
          the AI Labs layer. Each row shows what the source tracks, how
          often it&rsquo;s polled, and when it was last seen live.
        </p>
        <p className="text-xs text-muted-foreground/80 leading-relaxed max-w-2xl">
          The rules behind the feed&rsquo;s severity ranking live on{" "}
          <Link href="/methodology" className="underline">
            /methodology
          </Link>
          . The full typed registry — sanity ranges, caveats, verifiedAt
          dates — is the public summary at{" "}
          <a
            href="/data-sources.md"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            /data-sources.md
          </a>
          .
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tally label="Sources" value={totals.sourceCount} />
        <Tally label="Categories" value={CATEGORIES.length} />
        <Tally label="Curated labs" value={totals.labCount} />
        <Tally label="Live now" value={totals.liveCount} accent="op" />
      </section>

      {CATEGORIES.map((cat) => {
        const entries = grouped.get(cat.id) ?? [];
        if (entries.length === 0) return null;
        return (
          <CategorySection
            key={cat.id}
            category={cat}
            entries={entries}
            resolvedById={resolvedById}
            nowMs={nowMs}
          />
        );
      })}

      <p>
        <Link
          href="/"
          className="text-[var(--ap-accent,#2dd4bf)] underline text-sm"
        >
          ← back to Gawk
        </Link>
      </p>

      <PrivacyFooter />
    </main>
  );
}

type CategorySectionProps = {
  category: CategoryDescriptor;
  entries: InventoryEntry[];
  resolvedById: Map<string, ResolvedFreshness>;
  nowMs: number;
};

function CategorySection({
  category,
  entries,
  resolvedById,
  nowMs,
}: CategorySectionProps) {
  return (
    <section className="space-y-3" id={`cat-${category.id}`}>
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">
          {category.label}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({entries.length})
          </span>
        </h2>
        <p className="text-xs text-muted-foreground/80 leading-relaxed">
          {category.blurb}
        </p>
      </header>
      <ul className="divide-y divide-border/40 rounded-md border border-border/40">
        {entries.map((e) => {
          const freshness = resolvedById.get(e.id) ?? {
            tone: "unknown" as const,
            lastSeenAt: null,
          };
          return <SourceRow key={e.id} entry={e} freshness={freshness} now={nowMs} />;
        })}
      </ul>
    </section>
  );
}

function SourceRow({
  entry,
  freshness,
  now,
}: {
  entry: InventoryEntry;
  freshness: ResolvedFreshness;
  now: number;
}) {
  const lastSeenLabel = freshness.lastSeenAt
    ? formatRelative(freshness.lastSeenAt, now)
    : freshness.note ?? "—";
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground/95 hover:underline"
        >
          {entry.name}
        </a>
        <FreshnessBadge tone={freshness.tone} />
        {entry.auditorPending && (
          <span
            className="font-mono text-[9px] uppercase tracking-[0.16em] text-amber-300/80"
            title="Ships in production but not yet in the typed registry"
          >
            auditor-pending
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
        {entry.tracks}
      </p>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-3">
        <div className="flex gap-2">
          <dt className="text-muted-foreground/60">Cadence</dt>
          <dd className="text-foreground/85">
            {formatFrequency(entry.updateFrequency)}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground/60">Last seen</dt>
          <dd className="text-foreground/85" title={freshness.lastSeenAt ?? ""}>
            {lastSeenLabel}
          </dd>
        </div>
        {entry.poweredFeature && (
          <div className="flex gap-2">
            <dt className="text-muted-foreground/60">Surfaces in</dt>
            <dd className="text-foreground/85">{entry.poweredFeature}</dd>
          </div>
        )}
      </dl>
    </li>
  );
}

function FreshnessBadge({ tone }: { tone: FreshnessTone }) {
  const map: Record<FreshnessTone, { label: string; className: string }> = {
    live: {
      label: "Live",
      className:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    },
    stale: {
      label: "Stale",
      className: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    },
    "on-demand": {
      label: "On demand",
      className: "border-sky-400/30 bg-sky-400/10 text-sky-300",
    },
    static: {
      label: "Static",
      className:
        "border-violet-400/30 bg-violet-400/10 text-violet-300",
    },
    unknown: {
      label: "Unknown",
      className:
        "border-muted-foreground/20 bg-muted-foreground/10 text-muted-foreground",
    },
  };
  const { label, className } = map[tone];
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${className}`}
    >
      {label}
    </span>
  );
}

function Tally({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "op";
}) {
  return (
    <div className="rounded-md border border-border/40 px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 text-xl font-semibold tabular-nums ${
          accent === "op" ? "text-emerald-300" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

type Totals = {
  sourceCount: number;
  labCount: number;
  liveCount: number;
};

function summariseTotals(
  inventory: InventoryEntry[],
  resolvedById: Map<string, ResolvedFreshness>,
): Totals {
  const labCount = Array.isArray(labsData) ? labsData.length : 0;
  let liveCount = 0;
  for (const entry of inventory) {
    const tone = resolvedById.get(entry.id)?.tone;
    if (tone === "live" || tone === "on-demand") liveCount += 1;
  }
  return {
    sourceCount: inventory.length,
    labCount,
    liveCount,
  };
}

async function safeReadCronHealth() {
  try {
    return await readAllCronHealth();
  } catch (err) {
    console.error("[/sources] readAllCronHealth failed", err);
    return [];
  }
}

/**
 * Read the `feed:lk:{key}.savedAt` for each requested key. We do this
 * directly rather than via the existing `withLastKnown` helper because
 * we only need the timestamp, not the cached payload. Failures are
 * swallowed (page must never throw) — a missing timestamp degrades to
 * a "Unknown" badge, which is honest about the gap.
 */
async function safeReadLastKnown(
  keys: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return out;
  try {
    const r = new Redis({ url, token });
    const values = (await r.mget(
      ...keys.map((k) => `feed:lk:${k}`),
    )) as unknown[];
    keys.forEach((key, i) => {
      const v = values[i];
      if (v && typeof v === "object" && "savedAt" in v) {
        const savedAt = (v as { savedAt?: unknown }).savedAt;
        if (typeof savedAt === "string") out.set(key, savedAt);
      } else if (typeof v === "string") {
        try {
          const parsed = JSON.parse(v) as { savedAt?: unknown };
          if (typeof parsed.savedAt === "string")
            out.set(key, parsed.savedAt);
        } catch {
          // ignore — corrupt envelope reads as unknown
        }
      }
    });
  } catch (err) {
    console.error("[/sources] last-known mget failed", err);
  }
  return out;
}
