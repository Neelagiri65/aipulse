#!/bin/bash
# Gawk Daily Video — cron wrapper
# Runs the full pipeline securely via launchd/cron.
#
# Security measures:
#   - Explicit PATH (no inherited env from cron)
#   - umask 077 (created files are owner-only)
#   - Log rotation (keeps last 7 days, no unbounded growth)
#   - No secrets in stdout/stderr (scripts read from ~/.secrets/ directly)
#   - Lockfile prevents overlapping runs
#   - Timeout kills stuck processes after 10 minutes

set -euo pipefail

# ── Config ──
PROJECT_DIR="/Users/srinathprasannancs/aipulse"
LOG_DIR="${PROJECT_DIR}/out/logs"
LOCKFILE="/tmp/gawk-daily.lock"
MAX_LOG_DAYS=7
TIMEOUT_SEC=600

# ── Minimal PATH — only what the pipeline needs ──
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="/Users/srinathprasannancs"

# ── Owner-only file creation ──
umask 077

# ── Lockfile — prevent overlapping runs ──
if [ -f "$LOCKFILE" ]; then
    LOCK_PID=$(cat "$LOCKFILE" 2>/dev/null || echo "")
    if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
        echo "$(date -Iseconds) SKIP: previous run still active (PID $LOCK_PID)" >> "${LOG_DIR}/cron.log"
        exit 0
    fi
    rm -f "$LOCKFILE"
fi

mkdir -p "$LOG_DIR"
echo $$ > "$LOCKFILE"
trap 'rm -f "$LOCKFILE"' EXIT

# ── Log rotation — delete logs older than 7 days ──
find "$LOG_DIR" -name "daily-*.log" -mtime +${MAX_LOG_DAYS} -delete 2>/dev/null || true

DATE=$(date +%Y-%m-%d)
LOG="${LOG_DIR}/daily-${DATE}.log"

echo "$(date -Iseconds) START" >> "$LOG"

# ── Run pipeline with timeout ──
cd "$PROJECT_DIR"

if timeout "$TIMEOUT_SEC" npx tsx scripts/video/daily.ts >> "$LOG" 2>&1; then
    echo "$(date -Iseconds) DONE" >> "$LOG"
else
    EXIT_CODE=$?
    echo "$(date -Iseconds) FAIL (exit $EXIT_CODE)" >> "$LOG"
    exit $EXIT_CODE
fi
