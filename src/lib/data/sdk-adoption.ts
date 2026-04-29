/**
 * SDK Adoption matrix DTO assembler.
 *
 * Stitches:
 *   - pkg:{source}:latest blobs (current count, fetchedAt)
 *   - last N snapshot:{YYYY-MM-DD}.packages blobs (history)
 * into one row per (registry, package) with `windowDays` columns of
 * daily counts + within-package % deltas.
 *
 * Per-registry primary daily counter (matches PRD §3 — never synthesise
 * a window the source doesn't natively expose):
 *   - pypi  → lastDay (direct)
 *   - npm   → lastDay (direct)
 *   - crates → allTime[d] − allTime[d−1] (derived diff)
 *   - docker → allTime[d] − allTime[d−1] (derived diff)
 *   - brew  → lastMonth[d] − lastMonth[d−1] (derived diff; noisier, surfaced as caveat)
 *
 * Pure: same input → same output. Pass `now` to make `generatedAt`
 * deterministic in tests.
 */

import type { DailySnapshot, SnapshotPackageEntry } from "@/lib/data/snapshot";
import type { PackageLatest } from "@/lib/data/pkg-store";
import { deltasFromCounts } from "@/lib/data/sdk-adoption-deltas";

export type SdkAdoptionRegistry =
  | "pypi"
  | "npm"
  | "crates"
  | "docker"
  | "brew"
  | "vscode";

export type SdkAdoptionDay = {
  date: string;
  count: number | null;
  delta: number | null;
};

export type SdkAdoptionPackage = {
  /** Stable id, "{registry}:{name}". Used for ?focus= deep-links. */
  id: string;
  /** Human-friendly label = the package name within its registry. */
  label: string;
  registry: SdkAdoptionRegistry;
  latest: { count: number | null; fetchedAt: string | null };
  days: SdkAdoptionDay[];
  firstParty: boolean;
  caveat: string | null;
  counterName: string;
  counterUnits: string;
};

export type SdkAdoptionDto = {
  packages: SdkAdoptionPackage[];
  generatedAt: string;
};

export type AssembleSdkAdoptionInput = {
  pkgLatest: Record<SdkAdoptionRegistry, PackageLatest | null>;
  snapshots: DailySnapshot[];
  today: string;
  windowDays?: number;
  baselineWindow?: number;
  now?: () => Date;
};

type RegistryConfig = {
  counterField: keyof Pick<
    SnapshotPackageEntry,
    "lastDay" | "allTime" | "lastMonth"
  >;
  counterName: string;
  counterUnits: string;
  derivedDaily: boolean;
  firstParty: boolean;
  caveat: string | null;
};

const REGISTRY_CONFIG: Record<SdkAdoptionRegistry, RegistryConfig> = {
  pypi: {
    counterField: "lastDay",
    counterName: "lastDay",
    counterUnits: "downloads/day",
    derivedDaily: false,
    firstParty: false,
    caveat:
      "Counts via pypistats — third-party aggregator over the public PyPI BigQuery downloads dataset; values can lag the underlying day by 24-48h.",
  },
  npm: {
    counterField: "lastDay",
    counterName: "lastDay",
    counterUnits: "downloads/day",
    derivedDaily: false,
    firstParty: true,
    caveat: null,
  },
  crates: {
    counterField: "allTime",
    counterName: "allTime diff",
    counterUnits: "downloads/day",
    derivedDaily: true,
    firstParty: true,
    caveat: null,
  },
  docker: {
    counterField: "allTime",
    counterName: "allTime diff",
    counterUnits: "pulls/day",
    derivedDaily: true,
    firstParty: true,
    caveat: null,
  },
  brew: {
    counterField: "lastMonth",
    counterName: "lastMonth diff",
    counterUnits: "30d-cumulative installs Δ",
    derivedDaily: true,
    firstParty: true,
    caveat:
      "Daily values are derived as day-over-day diffs of a 30-day cumulative counter — noisier than a direct daily counter but the most honest signal Homebrew exposes.",
  },
  vscode: {
    counterField: "allTime",
    counterName: "install diff",
    counterUnits: "installs/day",
    derivedDaily: true,
    firstParty: true,
    caveat:
      "Daily values are derived from day-over-day diffs of the cumulative install counter exposed by Microsoft's marketplace catalogue. install ≠ active use — auto-installed bundle extensions, CI runners, and codespace pre-warms inflate the absolute number, but the WoW Δ signal is consistent.",
  },
};

const REGISTRIES = Object.keys(REGISTRY_CONFIG) as SdkAdoptionRegistry[];

export function assembleSdkAdoption(
  input: AssembleSdkAdoptionInput,
): SdkAdoptionDto {
  const windowDays = input.windowDays ?? 30;
  const baselineWindow = input.baselineWindow ?? 30;
  const columnDates = buildColumnDates(input.today, windowDays);
  const snapshotsByDate = indexSnapshotsByDate(input.snapshots);

  const packages: SdkAdoptionPackage[] = [];
  for (const registry of REGISTRIES) {
    const config = REGISTRY_CONFIG[registry];
    const latest = input.pkgLatest[registry];
    const names = collectPackageNames(registry, latest, snapshotsByDate);
    for (const name of names) {
      const counts = buildCounts(
        registry,
        name,
        config,
        columnDates,
        snapshotsByDate,
      );
      const days = deltasFromCounts(counts, baselineWindow);
      const latestEntry = latest?.counters?.[name];
      const latestCount =
        latestEntry !== undefined
          ? readCounter(latestEntry, config.counterField)
          : null;
      packages.push({
        id: `${registry}:${name}`,
        label: name,
        registry,
        latest: {
          count: latestCount,
          fetchedAt: latest?.fetchedAt ?? null,
        },
        days,
        firstParty: config.firstParty,
        caveat: config.caveat,
        counterName: config.counterName,
        counterUnits: config.counterUnits,
      });
    }
  }

  const generatedAt = (input.now?.() ?? new Date()).toISOString();
  return { packages, generatedAt };
}

function buildColumnDates(today: string, windowDays: number): string[] {
  const dates: string[] = [];
  const base = new Date(`${today}T00:00:00Z`);
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function indexSnapshotsByDate(
  snapshots: DailySnapshot[],
): Map<string, DailySnapshot> {
  const m = new Map<string, DailySnapshot>();
  for (const s of snapshots) m.set(s.date, s);
  return m;
}

function collectPackageNames(
  registry: SdkAdoptionRegistry,
  latest: PackageLatest | null,
  snapshotsByDate: Map<string, DailySnapshot>,
): string[] {
  const names = new Set<string>();
  if (latest && latest.counters) {
    for (const k of Object.keys(latest.counters)) names.add(k);
  }
  for (const snap of snapshotsByDate.values()) {
    const entries = snap.packages?.[registry];
    if (!entries) continue;
    for (const e of entries) names.add(e.name);
  }
  return [...names].sort();
}

function buildCounts(
  registry: SdkAdoptionRegistry,
  name: string,
  config: RegistryConfig,
  columnDates: string[],
  snapshotsByDate: Map<string, DailySnapshot>,
): { date: string; count: number | null }[] {
  if (!config.derivedDaily) {
    return columnDates.map((date) => ({
      date,
      count: readSnapshotCounter(
        snapshotsByDate.get(date),
        registry,
        name,
        config.counterField,
      ),
    }));
  }
  // Derived daily: today - yesterday.
  return columnDates.map((date) => {
    const todayVal = readSnapshotCounter(
      snapshotsByDate.get(date),
      registry,
      name,
      config.counterField,
    );
    const prev = previousDate(date);
    const prevVal = readSnapshotCounter(
      snapshotsByDate.get(prev),
      registry,
      name,
      config.counterField,
    );
    if (todayVal === null || prevVal === null) {
      return { date, count: null };
    }
    return { date, count: todayVal - prevVal };
  });
}

function readSnapshotCounter(
  snap: DailySnapshot | undefined,
  registry: SdkAdoptionRegistry,
  name: string,
  field: RegistryConfig["counterField"],
): number | null {
  if (!snap || !snap.packages) return null;
  const entries = snap.packages[registry];
  if (!entries) return null;
  const e = entries.find((x) => x.name === name);
  if (!e) return null;
  return readCounter(e, field);
}

function readCounter(
  entry: { lastDay?: number; allTime?: number; lastMonth?: number },
  field: RegistryConfig["counterField"],
): number | null {
  const v = entry[field];
  return typeof v === "number" ? v : null;
}

function previousDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
