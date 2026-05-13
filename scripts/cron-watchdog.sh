#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$DIR/out/logs/watchdog-$(date +%Y-%m-%d).log"

echo "=== Watchdog run: $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> "$LOG"

cd "$DIR"

# Tier 1: deterministic probe
npx tsx scripts/probe-sources.ts >> "$LOG" 2>&1 || true

# Tier 2: Hermes Agent analysis (gracefully degrades if Ollama is offline)
npx tsx scripts/watchdog-agent.ts >> "$LOG" 2>&1 || true

echo "=== Done: $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> "$LOG"
