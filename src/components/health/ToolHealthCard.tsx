import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
    <Card className="relative gap-3 border-border/60 bg-card/40 backdrop-blur-sm">
      <CardHeader className="gap-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold tracking-tight">
              {config.name}
            </CardTitle>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {config.subtitle}
            </p>
          </div>
          <StatusDot mode={mode} status={data?.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
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

function StatusDot({
  mode,
  status,
}: {
  mode: "pending" | "awaiting" | "live";
  status?: ToolHealthStatus;
}) {
  const { color, label, pulse } = dotStyle(mode, status);
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "relative inline-block h-2.5 w-2.5 rounded-full",
          pulse && "animate-pulse",
        )}
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
        aria-label={label}
      />
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function dotStyle(
  mode: "pending" | "awaiting" | "live",
  status?: ToolHealthStatus,
): { color: string; label: string; pulse: boolean } {
  if (mode === "pending") return { color: "#52525b", label: "no source", pulse: false };
  if (mode === "awaiting") return { color: "#fbbf24", label: "no data", pulse: true };
  switch (status) {
    case "operational":
      return { color: "#22c55e", label: "operational", pulse: false };
    case "degraded":
      return { color: "#fbbf24", label: "degraded", pulse: true };
    case "partial_outage":
      return { color: "#f97316", label: "partial outage", pulse: true };
    case "major_outage":
      return { color: "#ef4444", label: "major outage", pulse: true };
    default:
      return { color: "#71717a", label: "unknown", pulse: false };
  }
}

function PendingSourceBody() {
  return (
    <div className="rounded-md border border-border/40 bg-muted/30 p-3 text-xs text-muted-foreground">
      <p className="font-mono text-[10px] uppercase tracking-wider text-foreground/60">
        Source pending verification
      </p>
      <p className="mt-1 leading-relaxed">
        This tool depends on a data source that has not been Phase-0 validated
        in this session. No number is shown to preserve the trust contract.
      </p>
    </div>
  );
}

function AwaitingBody() {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/90">
      <p className="font-mono text-[10px] uppercase tracking-wider text-amber-300/80">
        Awaiting first poll
      </p>
      <p className="mt-1 leading-relaxed">
        Source is verified. Live polling pipeline ships in Checkpoint 2.
      </p>
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
