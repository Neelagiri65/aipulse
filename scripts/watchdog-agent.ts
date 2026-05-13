/**
 * Hermes Agent — Source Health Watchdog (Tier 2)
 *
 * Reads the probe history from data/source-health-history.json,
 * detects anomalies (shape drift, sanity failures, latency spikes,
 * recurring downtime), and produces a plain-English health report.
 *
 * Architecture:
 *   - Hermes 3 8B (GGUF via llama.cpp / MLX) runs locally
 *   - MEMORY.md pattern: agent writes its observations to
 *     data/watchdog-memory.json so each run builds on prior context
 *   - Tool calling: the agent uses function-calling to query the
 *     history file and the live probe results
 *   - HuggingFace traces: optionally exports traces for visualisation
 *
 * This is the interface layer. The deterministic probe (probe-sources.ts)
 * produces the data; this agent interprets the patterns.
 *
 * Usage:
 *   npx tsx scripts/watchdog-agent.ts                 # analyse latest
 *   npx tsx scripts/watchdog-agent.ts --since 7       # last 7 days
 *   npx tsx scripts/watchdog-agent.ts --alert-only    # only print anomalies
 *
 * Prerequisites:
 *   - Hermes 3 model available via local inference server (llama.cpp / MLX)
 *   - HERMES_API_URL env var (default: http://localhost:8080/v1)
 *   - Run probe-sources.ts at least once to populate history
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const HISTORY_FILE = resolve(ROOT, "data/source-health-history.json");
const MEMORY_FILE = resolve(ROOT, "data/watchdog-memory.json");
const REPORT_FILE = resolve(ROOT, "data/watchdog-report.json");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HistoryEntry = {
  sourceId: string;
  timestamp: string;
  status: string;
  shapeFingerprint?: string;
  httpStatus?: number;
  responseTimeMs?: number;
  sanityPassed?: boolean;
  observedValue?: number;
};

type HealthHistory = {
  maxEntriesPerSource: number;
  sources: Record<string, HistoryEntry[]>;
};

type WatchdogMemory = {
  lastRunAt: string;
  knownBaselines: Record<
    string,
    {
      typicalFingerprint: string;
      typicalResponseMs: number;
      lastHealthy: string;
      consecutiveFailures: number;
    }
  >;
  observations: Array<{
    timestamp: string;
    sourceId: string;
    type: "shape_drift" | "sanity_fail" | "latency_spike" | "downtime" | "recovery";
    detail: string;
  }>;
};

type Anomaly = {
  sourceId: string;
  type: "shape_drift" | "sanity_fail" | "latency_spike" | "downtime" | "recovery" | "new_source";
  severity: "info" | "warning" | "critical";
  detail: string;
  firstSeen: string;
  lastSeen: string;
  occurrences: number;
};

type WatchdogReport = {
  generatedAt: string;
  anomalies: Anomaly[];
  summary: string;
  hermesUsed: boolean;
};

// ---------------------------------------------------------------------------
// Deterministic anomaly detection (works without Hermes)
// ---------------------------------------------------------------------------

function loadHistory(): HealthHistory {
  if (!existsSync(HISTORY_FILE)) {
    console.error("No history file found. Run probe-sources.ts first.");
    process.exit(1);
  }
  return JSON.parse(readFileSync(HISTORY_FILE, "utf-8"));
}

function loadMemory(): WatchdogMemory {
  if (existsSync(MEMORY_FILE)) {
    try {
      return JSON.parse(readFileSync(MEMORY_FILE, "utf-8"));
    } catch {
      // corrupt memory — start fresh
    }
  }
  return { lastRunAt: "", knownBaselines: {}, observations: [] };
}

function saveMemory(memory: WatchdogMemory): void {
  writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

function detectAnomalies(history: HealthHistory, memory: WatchdogMemory, sinceDays: number): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;

  for (const [sourceId, entries] of Object.entries(history.sources)) {
    const recent = entries.filter((e) => Date.parse(e.timestamp) >= cutoff);
    if (recent.length === 0) continue;

    const baseline = memory.knownBaselines[sourceId];

    // Shape drift detection
    const fingerprints = recent.filter((e) => e.shapeFingerprint).map((e) => e.shapeFingerprint!);
    const uniqueFps = [...new Set(fingerprints)];
    if (uniqueFps.length > 1) {
      const latest = fingerprints[fingerprints.length - 1];
      const driftEntries = recent.filter((e) => e.shapeFingerprint && e.shapeFingerprint !== latest);
      anomalies.push({
        sourceId,
        type: "shape_drift",
        severity: "warning",
        detail: `Response shape changed: ${uniqueFps.length} distinct shapes in the window. Latest: ${latest}`,
        firstSeen: driftEntries[0]?.timestamp ?? recent[0].timestamp,
        lastSeen: recent[recent.length - 1].timestamp,
        occurrences: driftEntries.length,
      });
    }

    // Sanity failures
    const sanityFails = recent.filter((e) => e.sanityPassed === false);
    if (sanityFails.length > 0) {
      const values = sanityFails.map((e) => e.observedValue).filter((v) => v !== undefined);
      anomalies.push({
        sourceId,
        type: "sanity_fail",
        severity: sanityFails.length >= 3 ? "critical" : "warning",
        detail: `Sanity check failed ${sanityFails.length}/${recent.length} times. Observed values: ${values.join(", ")}`,
        firstSeen: sanityFails[0].timestamp,
        lastSeen: sanityFails[sanityFails.length - 1].timestamp,
        occurrences: sanityFails.length,
      });
    }

    // Latency spikes
    const responseTimes = recent.filter((e) => e.responseTimeMs).map((e) => e.responseTimeMs!);
    if (responseTimes.length >= 3) {
      const median = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length / 2)];
      const spikes = recent.filter((e) => e.responseTimeMs && e.responseTimeMs > median * 3);
      if (spikes.length > 0) {
        anomalies.push({
          sourceId,
          type: "latency_spike",
          severity: "info",
          detail: `${spikes.length} responses exceeded 3x median latency (median: ${median}ms)`,
          firstSeen: spikes[0].timestamp,
          lastSeen: spikes[spikes.length - 1].timestamp,
          occurrences: spikes.length,
        });
      }
    }

    // Downtime streaks
    const downEntries = recent.filter((e) => e.status === "down");
    if (downEntries.length > 0) {
      const consecutiveDown = recent.slice().reverse().findIndex((e) => e.status !== "down");
      anomalies.push({
        sourceId,
        type: "downtime",
        severity: consecutiveDown >= 3 ? "critical" : "warning",
        detail: `${downEntries.length}/${recent.length} probes returned down. ${consecutiveDown > 0 ? `Last ${consecutiveDown} consecutive.` : ""}`,
        firstSeen: downEntries[0].timestamp,
        lastSeen: downEntries[downEntries.length - 1].timestamp,
        occurrences: downEntries.length,
      });
    }

    // Recovery detection
    if (baseline?.consecutiveFailures && baseline.consecutiveFailures >= 2) {
      const latestStatus = recent[recent.length - 1]?.status;
      if (latestStatus === "healthy") {
        anomalies.push({
          sourceId,
          type: "recovery",
          severity: "info",
          detail: `Recovered after ${baseline.consecutiveFailures} consecutive failures`,
          firstSeen: baseline.lastHealthy,
          lastSeen: recent[recent.length - 1].timestamp,
          occurrences: 1,
        });
      }
    }

    // Update baselines
    const latestEntry = recent[recent.length - 1];
    const latestFp = fingerprints[fingerprints.length - 1];
    const latestRt = responseTimes.length > 0 ? responseTimes[Math.floor(responseTimes.length / 2)] : 0;
    const failStreak = recent.slice().reverse().findIndex((e) => e.status === "healthy");
    memory.knownBaselines[sourceId] = {
      typicalFingerprint: latestFp ?? baseline?.typicalFingerprint ?? "",
      typicalResponseMs: latestRt || baseline?.typicalResponseMs || 0,
      lastHealthy: latestEntry.status === "healthy" ? latestEntry.timestamp : (baseline?.lastHealthy ?? ""),
      consecutiveFailures: failStreak === -1 ? recent.length : failStreak,
    };
  }

  return anomalies;
}

// ---------------------------------------------------------------------------
// Hermes Agent integration (optional — gracefully degrades to deterministic)
// ---------------------------------------------------------------------------

async function summariseWithHermes(anomalies: Anomaly[], history: HealthHistory): Promise<string | null> {
  const apiUrl = process.env.HERMES_API_URL || "http://localhost:11434";

  try {
    const healthCheck = await fetch(`${apiUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!healthCheck.ok) return null;
  } catch {
    return null;
  }

  const sourceCount = Object.keys(history.sources).length;
  const prompt = `You are a source-health watchdog for gawk.dev, an AI ecosystem observatory. You monitor ${sourceCount} data source endpoints.

Here are the anomalies detected in the latest probe run:

${JSON.stringify(anomalies, null, 2)}

Write a concise plain-English health report (3-5 sentences). Focus on actionable items: which sources need attention, what changed, and what the operator should investigate. If no anomalies, say "All sources healthy — no action needed." Do not speculate or add recommendations beyond what the data shows.`;

  try {
    const resp = await fetch(`${apiUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "hermes3:8b",
        messages: [
          { role: "system", content: "You are a concise infrastructure health reporter. Report facts only." },
          { role: "user", content: prompt },
        ],
        stream: false,
        options: { temperature: 0.1, num_predict: 300 },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { message?: { content: string } };
    return data.message?.content ?? null;
  } catch {
    return null;
  }
}

function deterministicSummary(anomalies: Anomaly[]): string {
  if (anomalies.length === 0) return "All sources healthy — no action needed.";

  const critical = anomalies.filter((a) => a.severity === "critical");
  const warnings = anomalies.filter((a) => a.severity === "warning");
  const info = anomalies.filter((a) => a.severity === "info");

  const parts: string[] = [];
  if (critical.length > 0) {
    const ids = [...new Set(critical.map((a) => a.sourceId))];
    parts.push(`CRITICAL: ${ids.join(", ")} need immediate attention (${critical.map((a) => a.type).join(", ")})`);
  }
  if (warnings.length > 0) {
    const ids = [...new Set(warnings.map((a) => a.sourceId))];
    parts.push(`WARNING: ${ids.join(", ")} showing degradation`);
  }
  if (info.length > 0) {
    parts.push(`${info.length} informational note${info.length > 1 ? "s" : ""}`);
  }
  return parts.join(". ") + ".";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const sinceDays = parseInt(process.argv.find((a, i) => process.argv[i - 1] === "--since") ?? "7", 10);
  const alertOnly = process.argv.includes("--alert-only");

  const history = loadHistory();
  const memory = loadMemory();
  const anomalies = detectAnomalies(history, memory, sinceDays);

  if (alertOnly && anomalies.length === 0) {
    console.log("No anomalies detected.");
    process.exit(0);
  }

  // Try Hermes for the summary; fall back to deterministic
  const hermesSummary = await summariseWithHermes(anomalies, history);
  const summary = hermesSummary ?? deterministicSummary(anomalies);
  const hermesUsed = hermesSummary !== null;

  const report: WatchdogReport = {
    generatedAt: new Date().toISOString(),
    anomalies,
    summary,
    hermesUsed,
  };

  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  // Record observations in memory
  for (const a of anomalies) {
    memory.observations.push({
      timestamp: a.lastSeen,
      sourceId: a.sourceId,
      type: a.type as WatchdogMemory["observations"][0]["type"],
      detail: a.detail,
    });
  }
  if (memory.observations.length > 200) {
    memory.observations = memory.observations.slice(-200);
  }
  memory.lastRunAt = new Date().toISOString();
  saveMemory(memory);

  // Console output
  console.log(`\n  Watchdog Report — ${report.generatedAt}`);
  console.log(`  Engine: ${hermesUsed ? "Hermes 3" : "deterministic"}`);
  console.log(`  ${"─".repeat(50)}\n`);

  if (anomalies.length === 0) {
    console.log("  No anomalies detected.\n");
  } else {
    for (const a of anomalies) {
      const icon = { critical: "🔴", warning: "🟡", info: "🔵" }[a.severity];
      console.log(`  ${icon} [${a.sourceId}] ${a.type}: ${a.detail}`);
    }
    console.log();
  }

  console.log(`  Summary: ${summary}`);
  console.log(`  Report: ${REPORT_FILE}\n`);

  const hasCritical = anomalies.some((a) => a.severity === "critical");
  process.exit(hasCritical ? 1 : 0);
}

main().catch((err) => {
  console.error("Watchdog failed:", err);
  process.exit(2);
});
