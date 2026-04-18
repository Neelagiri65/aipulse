import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  // 1. Source unverified → grey "pending verification" state (strongest message)
  // 2. Source verified but no data yet → amber "awaiting first poll"
  // 3. Source verified + data present → render the live reading
  const mode: "pending" | "awaiting" | "live" = !sourcesVerified
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
        {mode === "pending" && <PendingSourceBody />}
        {mode === "awaiting" && <AwaitingBody />}
        {mode === "live" && data && <LiveBody data={data} />}
        <SourceFooter
          mode={mode}
          data={data}
          sourceUrl={sourceUrl}
          sourceLabel={config.sourceIds[0]}
        />
      </CardContent>
    </Card>
  );
}

export function SeverityPill({
  mode,
  status,
}: {
  mode: "pending" | "awaiting" | "live";
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
  mode: "pending" | "awaiting" | "live",
  status?: ToolHealthStatus,
): { variant: PillVariant; label: string } {
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
  // Uptime/version/sentiment return when the pipelines for them land; until
  // then an empty row would read as "broken", not "intentionally minimal".
  const rows: Array<{ label: string; value: string }> = [];
  if (data.openIssues !== undefined) {
    rows.push({ label: "Open issues", value: data.openIssues.toLocaleString() });
  }

  if (rows.length === 0) {
    return (
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Status only · additional metrics pending dedicated sources
      </p>
    );
  }

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
  mode: "pending" | "awaiting" | "live";
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
