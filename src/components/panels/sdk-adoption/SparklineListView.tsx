/**
 * SparklineListView — the default view for the SDK Adoption panel.
 *
 * Replaces the matrix as the landing surface because the matrix
 * doesn't read well during the 30-day baseline-fill window: with most
 * cells null, the grid looks broken rather than informative. The
 * list is dense and scannable: one row per package, grouped under
 * registry section headers, sorted within each group by latest count
 * descending.
 *
 * Each row carries enough context to make a decision without opening
 * the drawer:
 *   - Registry chip + label
 *   - Formatted latest count (M/k suffixes for the 4-decade magnitude
 *     range across registries)
 *   - 7d delta % with green/red/grey colour cues
 *   - Compact 30-day SparklineMini (log scale by default so brew:ollama
 *     at 2k is visible alongside pypi:openai at 10M)
 *   - Coverage indicator: "N/30 days" + dot row
 *
 * Click anywhere on the row → onRowClick(pkgId) routes to the same
 * RowDrawer the matrix uses.
 */

import * as React from "react";
import type {
  SdkAdoptionDto,
  SdkAdoptionRegistry,
} from "@/lib/data/sdk-adoption";
import {
  stripLeadingNullDates,
  firstDataDate,
  groupByRegistry,
  coverageOf,
  computeWindowDelta,
} from "@/lib/data/sdk-adoption-view";
import { SparklineMini } from "@/components/charts/SparklineMini";

const REGISTRY_LABEL: Record<SdkAdoptionRegistry, string> = {
  pypi: "PyPI",
  npm: "npm",
  crates: "crates.io",
  docker: "Docker Hub",
  brew: "Homebrew",
  vscode: "VS Code Marketplace",
};

const STALE_MS = 25 * 60 * 60 * 1000;

export type SparklineListViewProps = {
  data: SdkAdoptionDto;
  originUrl: string;
  focusedRowId?: string | null;
  onRowClick?: (pkgId: string) => void;
  /** Override "now" for stale tests. Defaults to Date.now(). */
  nowMs?: number;
};

export function formatCount(n: number | null): string {
  if (n === null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toString();
}

export function deltaClass(d: number | null): string {
  if (d === null) return "delta-null";
  if (Math.abs(d) < 0.02) return "delta-flat";
  return d > 0 ? "delta-pos" : "delta-neg";
}

function formatDelta(d: number | null): string {
  if (d === null) return "—";
  if (Math.abs(d) < 0.005) return "0%";
  const pct = Math.round(d * 100);
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
}

function isStale(fetchedAt: string | null, nowMs: number): boolean {
  if (!fetchedAt) return true;
  const t = Date.parse(fetchedAt);
  if (Number.isNaN(t)) return true;
  return nowMs - t > STALE_MS;
}

export function SparklineListView({
  data,
  focusedRowId,
  onRowClick,
  nowMs,
}: SparklineListViewProps): React.ReactElement {
  const trimmed = stripLeadingNullDates(data);
  const since = firstDataDate(trimmed);
  if (since === null) {
    return (
      <div className="sdk-list sdk-list-empty" role="status">
        Collecting baseline. The list fills out as daily snapshots
        accumulate over the next 30 days.
      </div>
    );
  }

  const groups = groupByRegistry(trimmed.packages);
  const now = nowMs ?? Date.now();

  return (
    <div className="sdk-list">
      <p className="sdk-list-since" aria-live="polite">
        Tracking since {since}
      </p>
      {groups.map((g) => (
        <section key={g.registry} className="sdk-list-group">
          <header className="sdk-list-group-head">
            <h3 className="sdk-list-group-title">
              {REGISTRY_LABEL[g.registry]}
            </h3>
            <span className="sdk-list-group-count">
              {g.packages.length}{" "}
              {g.packages.length === 1 ? "package" : "packages"}
            </span>
          </header>
          <ul className="sdk-list-rows" role="list">
            {g.packages.map((p) => {
              const cov = coverageOf(p.days);
              const sevenDay = computeWindowDelta(p.days, 7);
              const stale = isStale(p.latest.fetchedAt, now);
              const focused = focusedRowId === p.id;
              const counts = p.days.map((d) => d.count);
              const classes = [
                "sdk-list-row",
                focused ? "row-focused" : "",
                stale ? "row-stale" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <li
                  key={p.id}
                  className={classes}
                  data-pkg-id={p.id}
                  onClick={onRowClick ? () => onRowClick(p.id) : undefined}
                >
                  <span className="sdk-list-row-label">
                    <span
                      className={`registry-chip registry-chip-${p.registry}`}
                    >
                      {p.registry}
                    </span>
                    <span className="sdk-list-row-name">{p.label}</span>
                    {!p.firstParty ? (
                      <span
                        className="badge badge-aggregator"
                        title="Aggregated counts — includes CI/CD, mirrors, and automated installs. Not unique developers."
                      >
                        agg
                      </span>
                    ) : null}
                    {stale ? (
                      <span className="row-stale-pill">stale</span>
                    ) : null}
                  </span>
                  <span className="sdk-list-row-latest">
                    {formatCount(p.latest.count)}
                  </span>
                  <span
                    className={`sdk-list-row-delta ${deltaClass(sevenDay)}`}
                    aria-label={`7-day delta ${formatDelta(sevenDay)}`}
                  >
                    {formatDelta(sevenDay)}
                  </span>
                  <span className="sdk-list-row-trend">
                    <SparklineMini
                      data={counts}
                      width={120}
                      height={24}
                      label={`${p.label} ${p.counterUnits}, ${cov.filled} of ${cov.total} days`}
                      scale="log"
                    />
                  </span>
                  <span className="sdk-list-row-coverage">
                    <span className="coverage-text">
                      {cov.filled}/{cov.total}
                    </span>
                    <span className="coverage-dots" aria-hidden="true">
                      {p.days.map((d, i) => (
                        <span
                          key={i}
                          className={
                            d.count != null ? "coverage-dot-on" : "coverage-dot-off"
                          }
                        />
                      ))}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default SparklineListView;
