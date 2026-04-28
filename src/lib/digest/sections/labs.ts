/**
 * Notable AI Lab activity digest section composer.
 *
 * Diffs `snapshot.labs24h` day-over-day. A lab "moved" if its total
 * activity count changed by ≥ threshold OR it entered/exited the top-N.
 * Labs whose `stale` flag is true carry a small caveat — the number is
 * a partial view because one or more of the lab's tracked repos failed
 * to fetch in the 24h window.
 *
 * Bootstrap: today's labs24h as tiles.
 * Quiet: no movement → show today's top 3 labs as tiles under a quiet
 * headline (empty section reads as broken).
 */

import type { SnapshotLabEntry } from "@/lib/data/snapshot";
import type { DigestSection, DigestSectionItem } from "@/lib/digest/types";

const LABS_SOURCE_URL = "https://gawk.dev/#labs";

/** Minimum delta in total events to count as "movement". Prevents a lab
 *  that went from 42 → 45 events from dominating the digest. */
const MOVEMENT_THRESHOLD = 5;

export type ComposeLabsInput = {
  today: SnapshotLabEntry[] | null;
  yesterday: SnapshotLabEntry[] | null;
};

export function composeLabsSection(input: ComposeLabsInput): DigestSection {
  const { today, yesterday } = input;

  if (!today || today.length === 0) {
    return {
      id: "labs",
      title: "Notable AI Lab activity",
      anchorSlug: "labs",
      mode: "quiet",
      headline: "No tracked lab activity in the last 24h",
      items: [],
      sourceUrls: [LABS_SOURCE_URL],
    };
  }

  const isDiff = yesterday !== null;

  if (!isDiff) {
    // Bootstrap: top-5 today.
    return {
      id: "labs",
      title: "Notable AI Lab activity",
      anchorSlug: "labs",
      mode: "bootstrap",
      headline: `Top ${Math.min(5, today.length)} labs by 24h activity`,
      items: today.slice(0, 5).map(asItem),
      sourceUrls: [LABS_SOURCE_URL],
    };
  }

  // Diff mode.
  const yestByName = new Map(yesterday!.map((l) => [l.id, l]));
  const movers: DigestSectionItem[] = [];

  for (const t of today) {
    const y = yestByName.get(t.id);
    if (!y) {
      movers.push({
        headline: `New mover: ${t.displayName}`,
        detail: `${t.total} events · ${t.city}, ${t.country}${
          t.stale ? " · partial view" : ""
        }`,
        sourceLabel: "Gawk · Labs",
        sourceUrl: LABS_SOURCE_URL,
      });
      continue;
    }
    const delta = t.total - y.total;
    if (Math.abs(delta) >= MOVEMENT_THRESHOLD) {
      const sign = delta > 0 ? "+" : "−";
      movers.push({
        headline: t.displayName,
        detail: `${sign}${Math.abs(delta)} events (now ${t.total}) · ${t.city}, ${t.country}${
          t.stale ? " · partial view" : ""
        }`,
        sourceLabel: "Gawk · Labs",
        sourceUrl: LABS_SOURCE_URL,
      });
    }
  }

  // Dropouts: present in yesterday's top-N, absent today.
  const todayIds = new Set(today.map((l) => l.id));
  for (const y of yesterday!) {
    if (!todayIds.has(y.id)) {
      movers.push({
        headline: `Dropped off: ${y.displayName}`,
        detail: `was ${y.total} events · ${y.city}, ${y.country}`,
        sourceLabel: "Gawk · Labs",
        sourceUrl: LABS_SOURCE_URL,
      });
    }
  }

  if (movers.length === 0) {
    return {
      id: "labs",
      title: "Notable AI Lab activity",
      anchorSlug: "labs",
      mode: "quiet",
      headline: "No notable movement among tracked labs",
      items: today.slice(0, 3).map(asItem),
      sourceUrls: [LABS_SOURCE_URL],
    };
  }

  return {
    id: "labs",
    title: "Notable AI Lab activity",
    anchorSlug: "labs",
    mode: "diff",
    headline: `${movers.length} lab${movers.length === 1 ? "" : "s"} moved in the last 24h`,
    items: movers,
    sourceUrls: [LABS_SOURCE_URL],
  };
}

function asItem(lab: SnapshotLabEntry): DigestSectionItem {
  return {
    headline: lab.displayName,
    detail: `${lab.total} events · ${lab.city}, ${lab.country}${
      lab.stale ? " · partial view" : ""
    }`,
    sourceLabel: "Gawk · Labs",
    sourceUrl: LABS_SOURCE_URL,
  };
}
