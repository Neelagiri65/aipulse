import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UptimeSparkline } from "./UptimeSparkline";
import {
  allSourcesVerified,
  primarySourceUrl,
  type ToolConfig,
  type ToolHealthData,
  type ToolHealthStatus,
} from "./tools";

export type ToolHealthCardProps = {
  config: ToolConfig;
  data?: ToolHealthData;
};

export function ToolHealthCard({ config, data }: ToolHealthCardProps) {
  const sourcesVerified = allSourcesVerified(config);
  const sourceUrl = primarySourceUrl(config);

  // State precedence:
  // 0. Config flags no public source → "no-data" card (honest gap, no pill)
  // 1. Source unverified → grey "pending verification" state
  // 2. Source verified but no data yet → amber "awaiting first poll"
  // 3. Source verified + data present → render the live reading
  const mode: "no-data" | "pending" | "awaiting" | "live" = config.noPublicSource
    ? "no-data"
    : !sourcesVerified
      ? "pending"
      : data === undefined
        ? "awaiting"
        : "live";

  return (
    <Card className="relative gap-3 border-border/60 bg-card/40 py-3 backdrop-blur-sm">
      <CardHeader className="gap-1 px-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold tracking-tight">
              {config.name}
            </CardTitle>
            <p className="ap-label-sm mt-0.5">{config.subtitle}</p>
          </div>
          <SeverityPill mode={mode} status={data?.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-3">
        {mode === "no-data" && <NoDataBody config={config} />}
        {mode === "pending" && <PendingSourceBody />}
        {mode === "awaiting" && <AwaitingBody />}
        {mode === "live" && data && <LiveBody data={data} />}
        {mode === "live" && data?.activeIncidents && data.activeIncidents.length > 0 && (
          <ActiveIncidentList incidents={data.activeIncidents} sourceUrl={sourceUrl} />
        )}
        {mode === "live" && !config.incidentsApiAvailable && (
          <IncidentsApiUnavailable sourceUrl={sourceUrl} />
        )}
        {mode === "live" && data?.history && data.history.length > 0 && (
          <UptimeSparkline
            days={data.history}
            hasSamples={data.historyHasSamples ?? false}
          />
        )}
        {mode !== "no-data" && (
          <SourceFooter
            mode={mode}
            data={data}
            sourceUrl={sourceUrl}
            sourceLabel={config.sourceIds[0] ?? "n/a"}
          />
        )}
      </CardContent>
    </Card>
  );
}

function NoDataBody({ config }: { config: ToolConfig }) {
  return (
    <div className="rounded-md border border-border/40 bg-muted/20 p-2.5 text-[11px] leading-snug text-muted-foreground">
      <p className="ap-label-sm" style={{ color: "var(--sev-pending)" }}>
        No public source
      </p>
      <p className="mt-1">
        {config.noSourceReason ??
          "This tool has no publicly-hit-able status or issue endpoint. Card is shown so the gap is visible, not hidden."}
      </p>
      {config.publicPageUrl && (
        <p className="mt-1.5">
          <a
            href={config.publicPageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            {config.publicPageUrl.replace(/^https?:\/\//, "")}
          </a>
        </p>
      )}
    </div>
  );
}

function IncidentsApiUnavailable({ sourceUrl }: { sourceUrl?: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-muted/20 p-2 text-[10px] leading-snug text-muted-foreground">
      <span className="ap-label-sm">incidents · n/a</span>{" "}
      <span>
        Provider doesn&rsquo;t expose an incidents JSON. Check the{" "}
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            public status page
          </a>
        ) : (
          "public status page"
        )}{" "}
        for unresolved incidents.
      </span>
    </div>
  );
}

function ActiveIncidentList({
  incidents,
  sourceUrl,
}: {
  incidents: NonNullable<ToolHealthData["activeIncidents"]>;
  sourceUrl?: string;
}) {
  return (
    <div className="space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="ap-sev-pill ap-sev-pill--degrade">
          <span className="ap-sev-dot ap-sev-dot--sm" aria-hidden />
          {incidents.length === 1 ? "1 active incident" : `${incidents.length} active incidents`}
        </span>
      </div>
      <ul className="space-y-1">
        {incidents.slice(0, 3).map((i) => (
          <li key={i.id} className="text-[11px] leading-snug text-amber-100/90">
            <span className="ap-label-sm" style={{ color: "var(--sev-degrade)" }}>
              {i.status}
            </span>{" "}
            <span>{i.name}</span>{" "}
            <span className="text-amber-200/60">· {formatRelative(i.createdAt)}</span>
          </li>
        ))}
        {incidents.length > 3 && sourceUrl && (
          <li className="text-[10px] text-amber-200/60">
            +{incidents.length - 3} more · see{" "}
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted underline-offset-2 hover:text-amber-100"
            >
              status page
            </a>
          </li>
        )}
      </ul>
    </div>
  );
}

export function SeverityPill({
  mode,
  status,
}: {
  mode: "no-data" | "pending" | "awaiting" | "live";
  status?: ToolHealthStatus;
}) {
  const { variant, label } = pillStyle(mode, status);
  return (
    <span className={`ap-sev-pill ap-sev-pill--${variant}`}>
      <span className="ap-sev-dot ap-sev-dot--sm" aria-hidden />
      {label}
    </span>
  );
}

type PillVariant = "outage" | "degrade" | "regress" | "op" | "info" | "pending";

function pillStyle(
  mode: "no-data" | "pending" | "awaiting" | "live",
  status?: ToolHealthStatus,
): { variant: PillVariant; label: string } {
  if (mode === "no-data") return { variant: "pending", label: "n/a" };
  if (mode === "pending") return { variant: "pending", label: "no source" };
  if (mode === "awaiting") return { variant: "degrade", label: "no data" };
  switch (status) {
    case "operational":
      return { variant: "op", label: "operational" };
    case "degraded":
      return { variant: "degrade", label: "degraded" };
    case "partial_outage":
      return { variant: "regress", label: "partial outage" };
    case "major_outage":
      return { variant: "outage", label: "major outage" };
    default:
      return { variant: "pending", label: "unknown" };
  }
}

function PendingSourceBody() {
  return (
    <div className="rounded-md border border-border/40 bg-muted/30 p-2.5 text-xs text-muted-foreground">
      <p className="ap-label-sm">Source pending verification</p>
      <p className="mt-1 leading-relaxed">
        Source not Phase-0 validated yet. No number shown to preserve the trust
        contract.
      </p>
    </div>
  );
}

function AwaitingBody() {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-200/90">
      <p className="ap-label-sm" style={{ color: "var(--sev-degrade)" }}>
        Awaiting first poll
      </p>
      <p className="mt-1 leading-relaxed">Source verified. Polling…</p>
    </div>
  );
}

function LiveBody({ data }: { data: ToolHealthData }) {
  // Only render rows for metrics we actually have a source for right now.
  // When no rows are available we render nothing — the severity pill in
  // the header already communicates status; a placeholder line only
  // added noise (especially at maximised width).
  const rows: Array<{ label: string; value: string }> = [];
  if (data.openIssues !== undefined) {
    rows.push({ label: "Open issues", value: data.openIssues.toLocaleString() });
  }

  if (rows.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <MetricRow key={r.label} label={r.label} value={r.value} />
      ))}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-sm tabular-nums">{value}</span>
    </div>
  );
}

function SourceFooter({
  mode,
  data,
  sourceUrl,
  sourceLabel,
}: {
  mode: "no-data" | "pending" | "awaiting" | "live";
  data?: ToolHealthData;
  sourceUrl?: string;
  sourceLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border/30 pt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      <span className="truncate">
        Source:{" "}
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            {sourceLabel}
          </a>
        ) : (
          sourceLabel
        )}
      </span>
      {mode === "live" && data?.lastCheckedAt && (
        <Badge variant="secondary" className="font-mono text-[9px]">
          {formatRelative(data.lastCheckedAt)}
        </Badge>
      )}
    </div>
  );
}

function formatRelative(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
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
