/**
 * /api/panels/sdk-adoption — read endpoint for the SDK Adoption matrix.
 *
 * Reads the 5 pkg:{source}:latest blobs and the most recent 30 daily
 * snapshots in parallel, runs the pure DTO assembler, and returns
 * {packages[], generatedAt}. Public, no auth (the data already appears
 * on the live dashboard via tool-health and registry counters).
 *
 * Cache: public s-maxage=300 / SWR=60. The data only refreshes when the
 * snapshot cron writes (04:00 UTC) and when each pkg cron writes hourly,
 * so 5 minutes is generous; SWR keeps the panel responsive while a
 * fresh assembly resolves.
 *
 * Defaults match PRD §2: windowDays=30, baselineWindow=30. Query params
 * are accepted (`window=14`, `baseline=7`) for ad-hoc views — the panel
 * doesn't pass them, but the endpoint stays self-serve.
 */

import { NextResponse } from "next/server";
import {
  ymdUtc,
  readRecentSnapshots,
  type DailySnapshot,
} from "@/lib/data/snapshot";
import { readLatest, type PackageLatest } from "@/lib/data/pkg-store";
import {
  assembleSdkAdoption,
  type SdkAdoptionDto,
  type SdkAdoptionRegistry,
} from "@/lib/data/sdk-adoption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REGISTRIES: SdkAdoptionRegistry[] = [
  "pypi",
  "npm",
  "crates",
  "docker",
  "brew",
  "vscode",
];

export type SdkAdoptionDeps = {
  readLatest: (source: string) => Promise<PackageLatest | null>;
  readRecentSnapshots: (limit: number) => Promise<DailySnapshot[]>;
  ymdUtc: () => string;
  now: () => Date;
};

const DEFAULT_DEPS: SdkAdoptionDeps = {
  readLatest,
  readRecentSnapshots,
  ymdUtc: () => ymdUtc(),
  now: () => new Date(),
};

export async function handleGetSdkAdoption(
  request: Request,
  deps: SdkAdoptionDeps = DEFAULT_DEPS,
): Promise<{ dto: SdkAdoptionDto; cacheHeader: string }> {
  const url = new URL(request.url);
  const windowDays = clampInt(url.searchParams.get("window"), 30, 1, 60);
  const baselineWindow = clampInt(
    url.searchParams.get("baseline"),
    30,
    1,
    60,
  );
  const today = deps.ymdUtc();
  // Need windowDays + 1 historic to compute the derived-daily diff at
  // the leading edge of the column window (today - windowDays-1 needs
  // the day before that as its prior).
  const snapshotLimit = windowDays + 1;
  const [snapshots, ...latests] = await Promise.all([
    deps.readRecentSnapshots(snapshotLimit),
    ...REGISTRIES.map((r) => deps.readLatest(r)),
  ]);
  const pkgLatest: Record<SdkAdoptionRegistry, PackageLatest | null> = {
    pypi: latests[0] ?? null,
    npm: latests[1] ?? null,
    crates: latests[2] ?? null,
    docker: latests[3] ?? null,
    brew: latests[4] ?? null,
    vscode: latests[5] ?? null,
  };
  const dto = assembleSdkAdoption({
    pkgLatest,
    snapshots,
    today,
    windowDays,
    baselineWindow,
    now: deps.now,
  });
  return {
    dto,
    cacheHeader: "public, s-maxage=300, stale-while-revalidate=60",
  };
}

export async function GET(request: Request) {
  const { dto, cacheHeader } = await handleGetSdkAdoption(request);
  return NextResponse.json(dto, {
    headers: { "Cache-Control": cacheHeader },
  });
}

function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
