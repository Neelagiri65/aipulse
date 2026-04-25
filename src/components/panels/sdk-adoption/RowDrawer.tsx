"use client";

/**
 * RowDrawer — drill-through panel for one SDK Adoption row.
 *
 * Opens on row click in the matrix. Surfaces the data the matrix cell
 * can't fit: latest count + ISO timestamp, 7d / 30d % delta, the
 * 30-day sparkline (absolute native units, labelled), the
 * first-party-vs-aggregator badge, the inline pypistats caveat for
 * PyPI rows, and a per-row share button that deep-links back to
 * `?focus={pkgId}`.
 *
 * Behaviour:
 *   - open=false → renders nothing (parent controls mount/unmount).
 *   - ESC closes (handled in client, no-op on server-render).
 *   - Outside click closes (delegated to a backdrop).
 *   - Empty history → "Baseline begins collecting today" copy.
 *   - role=dialog + aria-modal=true.
 */

import * as React from "react";
import { useCallback, useEffect } from "react";
import type { SdkAdoptionPackage } from "@/lib/data/sdk-adoption";
import { SparklineMini } from "@/components/charts/SparklineMini";
import { SectionShareButton } from "@/components/digest/SectionShareButton";

export type RowDrawerProps = {
  pkg: SdkAdoptionPackage;
  open: boolean;
  onClose: () => void;
  /** Origin used to compose the share permalink. e.g. "https://aipulse.dev". */
  originUrl: string;
};

export function composeShareHeadline(pkg: SdkAdoptionPackage): string {
  const last = pkg.days[pkg.days.length - 1];
  if (!last || last.delta === null) {
    return `${pkg.label} on ${pkg.registry} — baseline collecting, first ${pkg.counterUnits} delta lights up tomorrow`;
  }
  const pct = Math.round(last.delta * 100);
  const sign = pct > 0 ? "+" : "";
  return `${pkg.label} on ${pkg.registry}: ${sign}${pct}% ${pkg.counterUnits} vs 30d baseline`;
}

export function formatLatestStamp(fetchedAt: string | null): string {
  if (!fetchedAt) return "never";
  // Surface ISO date + UTC time for citation; consumers parse this
  // server-side too so locale-specific formatting is avoided.
  return fetchedAt.replace("T", " ").replace(/\..*/, "Z");
}

export function RowDrawer({
  pkg,
  open,
  onClose,
  originUrl,
}: RowDrawerProps): React.ReactElement | null {
  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open, handleEsc]);

  if (!open) return null;

  const last = pkg.days[pkg.days.length - 1];
  const sevenDay = computeWindowDelta(pkg, 7);
  const thirtyDay = computeWindowDelta(pkg, 30);
  const counts = pkg.days.map((d) => d.count);
  const hasHistory = counts.some((c) => c !== null);

  const permalink = `${originUrl}/panels/sdk-adoption?focus=${encodeURIComponent(pkg.id)}`;
  const sectionTitle = `${pkg.label} (${pkg.registry})`;
  const headline = composeShareHeadline(pkg);

  return (
    <div className="row-drawer-backdrop" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={`drawer-title-${pkg.id}`}
        className="row-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-header">
          <div className="drawer-title-row">
            <span className={`registry-chip registry-chip-${pkg.registry}`}>
              {pkg.registry}
            </span>
            <h2 id={`drawer-title-${pkg.id}`} className="drawer-title">
              {pkg.label}
            </h2>
            <button
              type="button"
              className="drawer-close"
              aria-label="Close drawer"
              onClick={onClose}
            >
              ×
            </button>
          </div>
          <div className="drawer-counter-meta">
            <span>{pkg.counterName}</span>
            <span aria-hidden="true"> · </span>
            <span>{pkg.counterUnits}</span>
            {pkg.firstParty ? (
              <span className="badge badge-first-party">first-party</span>
            ) : (
              <span className="badge badge-aggregator">aggregator</span>
            )}
          </div>
        </header>

        <section className="drawer-stats">
          <div className="stat">
            <span className="stat-label">Latest</span>
            <span className="stat-value">
              {pkg.latest.count !== null
                ? pkg.latest.count.toLocaleString()
                : last?.count !== null && last?.count !== undefined
                  ? last.count.toLocaleString()
                  : "—"}
            </span>
            <span className="stat-stamp">
              as of {formatLatestStamp(pkg.latest.fetchedAt)}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">7d Δ</span>
            <span className="stat-value">{formatPercent(sevenDay)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">30d Δ</span>
            <span className="stat-value">{formatPercent(thirtyDay)}</span>
          </div>
        </section>

        <section className="drawer-spark" aria-label="30-day trend">
          {hasHistory ? (
            <SparklineMini
              data={counts}
              width={320}
              height={56}
              label={`${pkg.label} ${pkg.counterUnits}, last 30 days`}
            />
          ) : (
            <p className="drawer-empty-history">
              Baseline begins collecting today — first cells light up tomorrow.
            </p>
          )}
        </section>

        {pkg.caveat ? (
          <section className="drawer-caveat" aria-label="Source caveat">
            <p>{pkg.caveat}</p>
          </section>
        ) : null}

        <footer className="drawer-share">
          <SectionShareButton
            sectionId={`sdk-adoption-${pkg.id}`}
            sectionTitle={sectionTitle}
            headline={headline}
            permalink={permalink}
          />
        </footer>
      </aside>
    </div>
  );
}

function computeWindowDelta(
  pkg: SdkAdoptionPackage,
  windowDays: number,
): number | null {
  const days = pkg.days;
  if (days.length === 0) return null;
  const last = days[days.length - 1];
  if (last.count === null) return null;
  const startIdx = Math.max(0, days.length - 1 - windowDays);
  // Mean of counts in [startIdx .. last.length - 2] excluding nulls.
  let sum = 0;
  let n = 0;
  for (let i = startIdx; i < days.length - 1; i++) {
    const c = days[i].count;
    if (c === null) continue;
    sum += c;
    n += 1;
  }
  if (n === 0) return null;
  const baseline = sum / n;
  if (baseline === 0) return null;
  return (last.count - baseline) / baseline;
}

function formatPercent(v: number | null): string {
  if (v === null) return "—";
  const pct = Math.round(v * 100);
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
}

export default RowDrawer;
