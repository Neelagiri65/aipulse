/**
 * Pure view-layer helpers for the SDK Adoption panel.
 *
 * The panel's first prod render had two problems the data model can't
 * fix on its own:
 *   1. Most rows had ~25 leading null cells (the matrix started at
 *      "today − 30" rather than "first snapshot date"), making the
 *      grid look broken.
 *   2. There was no scannable order — registries were interleaved and
 *      packages were in insertion order, not by adoption magnitude.
 *
 * These helpers transform the raw DTO into the shape the new
 * sparkline-list view expects: leading-null columns trimmed, packages
 * grouped by registry, and within each group sorted by latest count
 * descending.
 */

import type {
  SdkAdoptionDto,
  SdkAdoptionPackage,
  SdkAdoptionRegistry,
  SdkAdoptionDay,
} from "@/lib/data/sdk-adoption";

/** Stable registry display order. Determined editorially: PyPI is the
 *  largest ecosystem, npm second, then niche-but-tracked. */
const REGISTRY_ORDER: SdkAdoptionRegistry[] = [
  "pypi",
  "npm",
  "crates",
  "docker",
  "brew",
];

/**
 * Strip leading column dates that are null across every row. The
 * matrix-and-list view both render with this transform applied so the
 * leftmost columns always have at least one row with data.
 *
 * If every column is null (no data anywhere), keep the last column
 * only — the panel still needs to render ≥1 column for layout.
 */
export function stripLeadingNullDates(dto: SdkAdoptionDto): SdkAdoptionDto {
  if (dto.packages.length === 0) return dto;
  const colCount = dto.packages.reduce(
    (m, p) => Math.max(m, p.days.length),
    0,
  );
  if (colCount === 0) return dto;
  let firstDataIdx = colCount;
  for (let i = 0; i < colCount; i++) {
    const anyData = dto.packages.some((p) => {
      const c = p.days[i]?.count;
      return c !== null && c !== undefined;
    });
    if (anyData) {
      firstDataIdx = i;
      break;
    }
  }
  if (firstDataIdx === 0) return dto;
  // Every column is null → keep last column for layout.
  if (firstDataIdx >= colCount) firstDataIdx = colCount - 1;
  return {
    ...dto,
    packages: dto.packages.map((p) => ({
      ...p,
      days: p.days.slice(firstDataIdx),
    })),
  };
}

/** Earliest date across all packages with a non-null count. Null when
 *  the entire DTO has no data yet. Renders as "Tracking since X" on
 *  the panel header. */
export function firstDataDate(dto: SdkAdoptionDto): string | null {
  let earliest: string | null = null;
  for (const p of dto.packages) {
    for (const d of p.days) {
      if (d.count == null) continue;
      if (earliest === null || d.date < earliest) earliest = d.date;
    }
  }
  return earliest;
}

/** Count non-null vs total for the per-row "N/30" coverage indicator. */
export function coverageOf(days: SdkAdoptionDay[]): {
  filled: number;
  total: number;
} {
  let filled = 0;
  for (const d of days) if (d.count != null) filled += 1;
  return { filled, total: days.length };
}

export type RegistryGroup = {
  registry: SdkAdoptionRegistry;
  packages: SdkAdoptionPackage[];
};

/**
 * Group packages by registry in stable order, sort within each group
 * by latest count descending (nulls last so they don't anchor the
 * top). Empty registries are omitted.
 */
export function groupByRegistry(
  packages: SdkAdoptionPackage[],
): RegistryGroup[] {
  const byReg = new Map<SdkAdoptionRegistry, SdkAdoptionPackage[]>();
  for (const p of packages) {
    if (!byReg.has(p.registry)) byReg.set(p.registry, []);
    byReg.get(p.registry)!.push(p);
  }
  const out: RegistryGroup[] = [];
  for (const reg of REGISTRY_ORDER) {
    const list = byReg.get(reg);
    if (!list || list.length === 0) continue;
    const sorted = [...list].sort((a, b) => {
      const ac = a.latest.count;
      const bc = b.latest.count;
      if (ac == null && bc == null) return a.label.localeCompare(b.label);
      if (ac == null) return 1;
      if (bc == null) return -1;
      return bc - ac;
    });
    out.push({ registry: reg, packages: sorted });
  }
  return out;
}

/**
 * Per-row delta % over a sliding window. Excludes the last day from
 * the baseline so "today vs the prior N-1 days" is the comparison.
 * Returns null when there isn't enough non-null history or the last
 * day is null or the baseline mean is zero.
 */
export function computeWindowDelta(
  days: SdkAdoptionDay[],
  windowDays: number,
): number | null {
  if (days.length < 2) return null;
  const last = days[days.length - 1];
  if (last.count == null) return null;
  const startIdx = Math.max(0, days.length - 1 - windowDays);
  let sum = 0;
  let n = 0;
  for (let i = startIdx; i < days.length - 1; i++) {
    const c = days[i].count;
    if (c == null) continue;
    sum += c;
    n += 1;
  }
  if (n === 0) return null;
  const baseline = sum / n;
  if (baseline === 0) return null;
  return (last.count - baseline) / baseline;
}
