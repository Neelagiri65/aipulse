/**
 * SDK adoption digest section composer.
 *
 * Diffs `snapshot.packages` across days for each of the five registries
 * tracked in Track A (pypi, npm, crates, docker, brew). The metric is
 * registry-reported counters (downloads, pulls, installs) — we never
 * invent a unit, never divide windows, never rank across registries.
 *
 * Counter-window strategy: prefer `lastWeek` deltas (stable across the
 * pypistats rolling-7d window and the npm/crates analogues), fall back to
 * `lastMonth` when `lastWeek` isn't exposed. Skip counters that aren't
 * present on both days — a newly added counter has no "yesterday" to
 * diff against.
 *
 * PyPI carries the verbatim third-party-aggregator caveat on every
 * item, matching the dashboard panel.
 */

import type { SnapshotPackages, SnapshotPackageEntry } from "@/lib/data/snapshot";
import type { DigestSection, DigestSectionItem } from "@/lib/digest/types";

const REGISTRY_LABEL: Record<string, string> = {
  pypi: "PyPI",
  npm: "npm",
  crates: "crates.io",
  docker: "Docker Hub",
  brew: "Homebrew",
};

const REGISTRY_SOURCE: Record<string, string> = {
  pypi: "https://pypistats.org/",
  npm: "https://www.npmjs.com/",
  crates: "https://crates.io/",
  docker: "https://hub.docker.com/",
  brew: "https://formulae.brew.sh/",
};

const PYPI_CAVEAT =
  "pypistats.org is a third-party aggregator — counts include mirror hits, CI builds, and pip install retries.";

/** Preferred counter window per registry. Each registry exposes different
 *  native windows; we pick the narrowest meaningful one that's present on
 *  both days. */
const PREFERRED_WINDOW: Record<
  string,
  Array<keyof Omit<SnapshotPackageEntry, "name">>
> = {
  pypi: ["lastDay", "lastWeek", "lastMonth"],
  npm: ["lastDay", "lastWeek", "lastMonth"],
  crates: ["last90d", "allTime"],
  docker: ["allTime", "stars"],
  brew: ["lastMonth", "last90d", "lastYear"],
};

const WINDOW_LABEL: Record<string, string> = {
  lastDay: "24h downloads",
  lastWeek: "7d downloads",
  lastMonth: "30d downloads",
  last90d: "90d downloads",
  lastYear: "year downloads",
  allTime: "all-time pulls",
  stars: "stars",
};

/** Minimum absolute delta to consider "movement". Numbers are in absolute
 *  count units (downloads/pulls/installs/stars). Different magnitudes per
 *  registry so we don't drown in micro-noise from crates or Docker's big
 *  counters. */
const MOVEMENT_THRESHOLD: Record<string, number> = {
  pypi: 1000,
  npm: 1000,
  crates: 100,
  docker: 10_000,
  brew: 50,
};

export type ComposeSdkAdoptionInput = {
  today: SnapshotPackages | null;
  yesterday: SnapshotPackages | null;
};

const ALL_REGISTRIES = ["pypi", "npm", "crates", "docker", "brew"] as const;

export function composeSdkAdoptionSection(
  input: ComposeSdkAdoptionInput,
): DigestSection {
  const { today, yesterday } = input;

  if (!today) {
    return {
      id: "sdk-adoption",
      title: "SDK adoption",
      anchorSlug: "sdk-adoption",
      mode: "quiet",
      headline: "Package counters are unavailable right now",
      items: [],
      sourceUrls: Object.values(REGISTRY_SOURCE),
    };
  }

  const isDiff = yesterday !== null;

  if (!isDiff) {
    // Bootstrap: one tile per registry with the top package by the
    // narrowest available window.
    const items: DigestSectionItem[] = [];
    for (const reg of ALL_REGISTRIES) {
      const entries = today[reg] ?? [];
      if (entries.length === 0) continue;
      const window = PREFERRED_WINDOW[reg].find((w) =>
        entries.some((e) => typeof e[w] === "number"),
      );
      if (!window) continue;
      const top = [...entries]
        .filter((e) => typeof e[window] === "number")
        .sort((a, b) => (b[window] as number) - (a[window] as number))[0];
      if (!top) continue;
      items.push({
        headline: `${REGISTRY_LABEL[reg]}: ${top.name}`,
        detail: `${formatCount(top[window] as number)} ${WINDOW_LABEL[window]}`,
        sourceLabel: REGISTRY_LABEL[reg],
        sourceUrl: REGISTRY_SOURCE[reg],
        caveat: reg === "pypi" ? PYPI_CAVEAT : undefined,
      });
    }
    return {
      id: "sdk-adoption",
      title: "SDK adoption",
      anchorSlug: "sdk-adoption",
      mode: "bootstrap",
      headline: "Current adoption leaders across five registries",
      items,
      sourceUrls: items.length > 0 ? dedup(items.map((i) => i.sourceUrl!)) : [],
    };
  }

  // Diff mode: largest positive delta per registry.
  const movers: DigestSectionItem[] = [];
  for (const reg of ALL_REGISTRIES) {
    const todayEntries = today[reg] ?? [];
    const yestEntries = yesterday![reg] ?? [];
    if (todayEntries.length === 0 || yestEntries.length === 0) continue;
    const yestByName = new Map(yestEntries.map((e) => [e.name, e]));
    const threshold = MOVEMENT_THRESHOLD[reg];
    const window = PREFERRED_WINDOW[reg].find((w) =>
      todayEntries.some((e) => typeof e[w] === "number"),
    );
    if (!window) continue;

    let best: { entry: SnapshotPackageEntry; delta: number } | null = null;
    for (const t of todayEntries) {
      const y = yestByName.get(t.name);
      if (!y) continue;
      const tv = t[window];
      const yv = y[window];
      if (typeof tv !== "number" || typeof yv !== "number") continue;
      const delta = tv - yv;
      if (Math.abs(delta) < threshold) continue;
      if (!best || Math.abs(delta) > Math.abs(best.delta)) {
        best = { entry: t, delta };
      }
    }
    if (best) {
      const sign = best.delta > 0 ? "+" : "−";
      movers.push({
        headline: `${REGISTRY_LABEL[reg]}: ${best.entry.name}`,
        detail: `${sign}${formatCount(Math.abs(best.delta))} ${WINDOW_LABEL[window]} day-over-day`,
        sourceLabel: REGISTRY_LABEL[reg],
        sourceUrl: REGISTRY_SOURCE[reg],
        caveat: reg === "pypi" ? PYPI_CAVEAT : undefined,
      });
    }
  }

  if (movers.length === 0) {
    return {
      id: "sdk-adoption",
      title: "SDK adoption",
      anchorSlug: "sdk-adoption",
      mode: "quiet",
      headline: "No meaningful adoption changes in the last 24h",
      items: [],
      sourceUrls: Object.values(REGISTRY_SOURCE),
    };
  }

  return {
    id: "sdk-adoption",
    title: "SDK adoption",
    anchorSlug: "sdk-adoption",
    mode: "diff",
    headline: `${movers.length} notable shift${movers.length === 1 ? "" : "s"} across the five registries`,
    items: movers,
    sourceUrls: dedup(movers.map((i) => i.sourceUrl!)),
  };
}

function formatCount(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function dedup<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}
