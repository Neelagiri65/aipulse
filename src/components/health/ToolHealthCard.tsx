"use client";

/**
 * gawk.dev — Tool health row (web v2 phase 3). The row is the card's collapsed state, not a
 * replacement: mark (state by shape) · name · caption (the state word, the last incident, the
 * source) · 7-day strip · chevron. The chevron opens an inline detail that carries every trust
 * item the card had — active incidents with the declared-vs-incident disclosure (#63), the
 * measured probe row ("reachable", never "up"), open issues, the incidents-API note, the
 * no-public-source reason, the provenance line. Exceptions (any incident, anything not
 * operational, anything unmeasured) open by default so "incidents first" is also "detail first".
 */

import { useNow } from "@/lib/hooks/use-now";
import { useState } from "react";
import { HealthStrip } from "./HealthStrip";
import { deriveRowState, type RowMode, type RowState } from "./row-state";
import { primarySourceUrl, type ToolConfig, type ToolHealthData } from "./tools";
import {
  pickLastIncident,
  formatIncidentDuration,
  formatIncidentImpact,
} from "@/lib/data/last-incident";
import { formatProvenanceTooltip } from "@/lib/provenance";
import { PROBE_LATENCY_CEILING_MS } from "@/lib/data/tool-probe";

export type ToolHealthCardProps = {
  config: ToolConfig;
  data?: ToolHealthData;
  /** Force the detail open or closed; default = open for exceptions, closed for working rows. */
  defaultOpen?: boolean;
};

export function ToolHealthCard({ config, data, defaultOpen }: ToolHealthCardProps) {
  const state = deriveRowState(config, data);
  // Open follows the state (exceptions open, working rows closed) until the reader toggles; a
  // stored boolean would freeze the pre-poll "awaiting" default once data arrives.
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? defaultOpen ?? state.exception;
  const setOpen = (fn: (o: boolean) => boolean) => setOverride(fn(open));
  const sourceUrl = primarySourceUrl(config);
  const sourceLabel = config.sourceIds[0] ?? "n/a";
  const detailId = `tool-detail-${config.id}`;

  return (
    <div
      className={`ap-trow${state.exception ? " ap-trow--exception" : ""}`}
      data-tool={config.id}
      data-mark={state.mark}
      data-testid={`tool-row-${config.id}`}
    >
      <button
        type="button"
        className="ap-trow__head"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`ap-mark ap-mark--${state.mark}`} aria-hidden />
        <span className="ap-trow__body">
          <span className="ap-trow__title">{config.name}</span>
          <span className="ap-trow__cap">
            <StateWord state={state} />
            {state.activeIncidents > 0 && (
              <> · {state.activeIncidents === 1 ? "1 active incident" : `${state.activeIncidents} active incidents`}</>
            )}
            {state.mode === "live" && data?.history && data.history.length > 0 && (
              <> · <LastIncidentBit history={data.history} /></>
            )}
            {state.mode !== "no-data" && <> · {sourceLabel}</>}
          </span>
        </span>
        {state.mode === "live" && data?.history && data.history.length > 0 && (
          <HealthStrip days={data.history} hasSamples={data.historyHasSamples ?? false} />
        )}
        <span className={`ap-chev${open ? " ap-chev--open" : ""}`} aria-hidden>
          ›
        </span>
      </button>

      {open && (
        <div className="ap-trow__detail" id={detailId}>
          <p className="ap-trow__sub">{config.subtitle}</p>
          {state.mode === "no-data" && <NoDataBody config={config} />}
          {state.mode === "pending" && (
            <Note head="Source pending verification">
              Source not Phase-0 validated yet. No number shown to preserve the trust contract.
            </Note>
          )}
          {state.mode === "awaiting" && <Note head="Awaiting first poll">Source verified. Polling…</Note>}
          {state.mode === "live" && data && (
            <>
              {data.activeIncidents && data.activeIncidents.length > 0 && (
                <ActiveIncidentList
                  incidents={data.activeIncidents}
                  sourceUrl={sourceUrl}
                  declaredStatus={data.status}
                />
              )}
              <LiveBody data={data} />
              {!config.incidentsApiAvailable && <IncidentsApiUnavailable sourceUrl={sourceUrl} />}
              {data.history && data.history.length > 0 && (
                <LastIncidentLine history={data.history} sourceUrl={sourceUrl} />
              )}
            </>
          )}
          {state.mode !== "no-data" && (
            <SourceFooter mode={state.mode} data={data} sourceUrl={sourceUrl} sourceLabel={sourceLabel} />
          )}
        </div>
      )}
    </div>
  );
}

function StateWord({ state }: { state: RowState }) {
  return <span className={`ap-word ap-word--${state.tone}`}>{state.word}</span>;
}

function LastIncidentBit({ history }: { history: NonNullable<ToolHealthData["history"]> }) {
  const now = useNow();
  const recap = pickLastIncident(history);
  if (recap.kind === "none") return <>no incidents in 7d</>;
  return (
    <>
      last incident {formatRelative(recap.createdAt, now)} · {formatIncidentDuration(recap.durationMinutes)}
    </>
  );
}

function Note({ head, children }: { head: string; children: React.ReactNode }) {
  return (
    <div className="ap-trow__note">
      <p className="ap-trow__notehead">{head}</p>
      <p>{children}</p>
    </div>
  );
}

function NoDataBody({ config }: { config: ToolConfig }) {
  return (
    <div className="ap-trow__note">
      <p className="ap-trow__notehead">No public source</p>
      <p>
        {config.noSourceReason ??
          "This tool has no publicly-hit-able status or issue endpoint. The row is shown so the gap is visible, not hidden."}
      </p>
      {config.publicPageUrl && (
        <p>
          <a href={config.publicPageUrl} target="_blank" rel="noopener noreferrer" className="ap-trow__link">
            {config.publicPageUrl.replace(/^https?:\/\//, "")}
          </a>
        </p>
      )}
    </div>
  );
}

function IncidentsApiUnavailable({ sourceUrl }: { sourceUrl?: string }) {
  return (
    <p className="ap-trow__line">
      incidents · n/a — provider doesn&rsquo;t expose an incidents JSON. Check the{" "}
      {sourceUrl ? (
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="ap-trow__link">
          public status page
        </a>
      ) : (
        "public status page"
      )}{" "}
      for unresolved incidents.
    </p>
  );
}

function ActiveIncidentList({
  incidents,
  sourceUrl,
  declaredStatus,
}: {
  incidents: NonNullable<ToolHealthData["activeIncidents"]>;
  sourceUrl?: string;
  declaredStatus?: ToolHealthData["status"];
}) {
  const now = useNow();
  return (
    <div className="ap-trow__incidents">
      <p className="ap-trow__notehead">
        <span className="ap-mark ap-mark--hatched ap-mark--sm" aria-hidden />
        {incidents.length === 1 ? "1 active incident" : `${incidents.length} active incidents`}
      </p>
      {/* Vendor self-disagreement (#63 posture: surface, don't resolve). The state word is the
          vendor's declared status for THIS tool; the incident list is the vendor's page-level
          declaration. When they conflict, say so instead of letting the row read as
          self-contradictory. */}
      {declaredStatus === "operational" && (
        <p className="ap-trow__line" data-testid="incident-status-disagreement">
          declared status and active incidents disagree — both shown as the vendor reports them
        </p>
      )}
      <ul className="ap-trow__list">
        {incidents.slice(0, 3).map((i) => (
          <li key={i.id}>
            <span className="ap-trow__kicker">{i.status}</span> {i.name}{" "}
            <span className="ap-trow__dim">· {formatRelative(i.createdAt, now)}</span>
          </li>
        ))}
        {incidents.length > 3 && sourceUrl && (
          <li className="ap-trow__dim">
            +{incidents.length - 3} more · see{" "}
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="ap-trow__link">
              status page
            </a>
          </li>
        )}
      </ul>
    </div>
  );
}

function LiveBody({ data }: { data: ToolHealthData }) {
  const rows: Array<{ label: string; value: string }> = [];
  if (data.openIssues !== undefined) {
    rows.push({ label: "Open issues", value: data.openIssues.toLocaleString() });
  }
  const probe = data.probe;
  if (rows.length === 0 && !probe) {
    return <p className="ap-trow__dim">metrics pending</p>;
  }
  return (
    <dl className="ap-trow__metrics">
      {rows.map((r) => (
        <div key={r.label} className="ap-trow__metric">
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
      {probe && <ProbeRow probe={probe} />}
    </dl>
  );
}

/**
 * The MEASURED signal, shown next to the declared word — never merged into it. The word is
 * "reachable", never "up/healthy"; a disagreement with the declared status is surfaced, not
 * resolved; hysteresis means one blip never reads as an outage. Ink only.
 */
function ProbeRow({ probe }: { probe: NonNullable<ToolHealthData["probe"]> }) {
  const now = useNow();
  const { state, latencyMs, host, checkedAt, consecutiveFails } = probe;
  let value: string;
  let title: string;
  if (state === "reachable") {
    const slow = latencyMs !== null && latencyMs > PROBE_LATENCY_CEILING_MS;
    value = latencyMs === null || slow ? "reachable" : `reachable · ${latencyMs}ms`;
    title = `Reachable from our probe · ${host}${checkedAt ? ` · ${formatRelative(checkedAt, now)}` : ""}. A response proves the service answered from our single probe location — not a guarantee the backend is healthy. Latency is one-location round-trip, mostly geography.`;
  } else if (state === "unreachable") {
    value = "unreachable";
    title = `No response on the last ${consecutiveFails} probes · ${host}. This is our measurement from one location — compare against the declared status; they may disagree.`;
  } else {
    value = "pending";
    title = `Probe pending · ${host}. Not enough samples yet to report reachability.`;
  }
  return (
    <div className="ap-trow__metric" title={title}>
      <dt>Reachability</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SourceFooter({
  mode,
  data,
  sourceUrl,
  sourceLabel,
}: {
  mode: RowMode;
  data?: ToolHealthData;
  sourceUrl?: string;
  sourceLabel: string;
}) {
  const now = useNow();
  const provenanceTitle =
    mode === "live" && data?.lastCheckedAt && sourceUrl
      ? formatProvenanceTooltip(data.lastCheckedAt, sourceUrl, now)
      : undefined;
  return (
    <p className="ap-trow__src" title={provenanceTitle}>
      <span>
        Source:{" "}
        {sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="ap-trow__link">
            {sourceLabel}
          </a>
        ) : (
          sourceLabel
        )}
      </span>
      {mode === "live" && data?.lastCheckedAt && <span>checked {formatRelative(data.lastCheckedAt, now)}</span>}
    </p>
  );
}

/**
 * "Last incident" recap for the detail: same DayBucket history the strip consumes — no new
 * fetch. Ongoing incidents say so in words; nothing is coloured.
 */
function LastIncidentLine({
  history,
  sourceUrl,
}: {
  history: NonNullable<ToolHealthData["history"]>;
  sourceUrl?: string;
}) {
  const now = useNow();
  const recap = pickLastIncident(history);
  if (recap.kind === "none") {
    return <p className="ap-trow__line">No incidents in the last 7 days.</p>;
  }
  const isOngoing = recap.durationMinutes === null;
  return (
    <p className="ap-trow__line" title={recap.name}>
      Last incident: {formatRelative(recap.createdAt, now)} · {formatIncidentDuration(recap.durationMinutes)} ·{" "}
      {formatIncidentImpact(recap.impact)}
      {isOngoing ? " · ongoing" : ""}
      {sourceUrl ? (
        <>
          {" · "}
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="ap-trow__link">
            source
          </a>
        </>
      ) : null}
    </p>
  );
}

/**
 * Relative time from the shared clock, never from Date.now() during render.
 * `now` is the useNow() snapshot: 0 on the server and during hydration, so the
 * server HTML carries an absolute UTC time ("12:00 UTC") that the client's
 * first render reproduces exactly; the ticking relative form ("35s ago")
 * appears only after hydration. Before this, the server computed "0s ago" at
 * its own instant and the client computed the real elapsed time — a text
 * mismatch that fired React #418 on every homepage load and regenerated the
 * whole card tree client-side.
 */
function formatRelative(iso: string, now: number): string {
  try {
    if (now === 0) {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "—";
      return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
    }
    const diffMs = now - new Date(iso).getTime();
    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  } catch {
    return "—";
  }
}
