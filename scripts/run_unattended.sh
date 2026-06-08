#!/usr/bin/env bash
# =============================================================================
# SEKBER DIKMEN 2025 — Unattended Pipeline Runner
# =============================================================================
# Jalankan SELURUH pipeline scraping (Tindakan 1 + Tindakan 2) → build DB
# → export XLSX, TANPA interaksi user.
#
# Usage:
#   bash scripts/run_unattended.sh
#
# Setelah dipanggil, script langsung detach ke background dan PID parent exit.
# Aman menutup terminal / SSH disconnect — proses lanjut via nohup.
#
# Behavior:
#   • Self-daemonize via nohup (terminal-safe).
#   • Auto-restart per-scraper kalau crash (sleep 60s antar retry).
#   • Poll queue table tiap 5 menit untuk deteksi completion.
#   • Setelah BOTH scraper selesai → otomatis build DB + export XLSX.
#   • Tulis marker file `logs/.PIPELINE_COMPLETE` saat full success.
#   • NEVER prompt user. NEVER ask yes/no. NEVER block on input.
#
# Monitor (opsional, read-only):
#   tail -f logs/unattended-*/launcher.log
#   bash scripts/check_progress.sh
#
# Stop:
#   bash scripts/stop_unattended.sh
# =============================================================================

set -u  # error on unset vars
# NOTE: deliberately NOT using `set -e` — we want to survive transient failures

# ───────────────────────────────────────────────────────────────────────────
# Stage 1: Self-daemonize
# ───────────────────────────────────────────────────────────────────────────
# Pada panggilan pertama, fork ke background via nohup lalu exit dengan cepat.
# Pada panggilan kedua (yang sudah di-fork), env var SEKBER_DAEMONIZED=1,
# dan kita lanjut ke stage 2.

if [ -z "${SEKBER_DAEMONIZED:-}" ]; then
  TS=$(date +%Y%m%d-%H%M%S)
  LOG_DIR="logs/unattended-$TS"
  mkdir -p "$LOG_DIR"

  echo "================================================================"
  echo "  SEKBER DIKMEN 2025 — Unattended Pipeline"
  echo "================================================================"
  echo "  Started:   $(date)"
  echo "  Log dir:   $LOG_DIR/"
  echo "  Launcher:  $LOG_DIR/launcher.log"
  echo "----------------------------------------------------------------"
  echo "  Pipeline will run in background. Safe to close this terminal."
  echo ""
  echo "  Monitor:   tail -f $LOG_DIR/launcher.log"
  echo "             bash scripts/check_progress.sh"
  echo "  Stop:      bash scripts/stop_unattended.sh"
  echo "================================================================"

  export SEKBER_DAEMONIZED=1
  export SEKBER_LOG_DIR="$LOG_DIR"
  # Detach via nohup + setsid (jika tersedia) supaya benar-benar lepas dari TTY
  if command -v setsid >/dev/null 2>&1; then
    nohup setsid bash "$0" </dev/null > "$LOG_DIR/launcher.log" 2>&1 &
  else
    nohup bash "$0" </dev/null > "$LOG_DIR/launcher.log" 2>&1 &
  fi
  DAEMON_PID=$!
  disown 2>/dev/null || true
  echo "  Daemon PID: $DAEMON_PID"
  echo "$DAEMON_PID" > "$LOG_DIR/launcher.pid"
  exit 0
fi

# ───────────────────────────────────────────────────────────────────────────
# Stage 2: Daemon body (runs in background)
# ───────────────────────────────────────────────────────────────────────────

LOG_DIR="${SEKBER_LOG_DIR}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Use the project venv's interpreter so deps installed via `pip install -r
# scripts/requirements.txt` into .venv/ are visible. Override with PY=... env.
PY="${PY:-$PROJECT_ROOT/.venv/bin/python3}"

mkdir -p data/scraped database logs

log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
fail() { log "FATAL: $*"; touch "$LOG_DIR/.PIPELINE_FAILED"; exit 1; }

log "=== Daemon started in $PROJECT_ROOT ==="
log "PID: $$"
log "Python: $PY"

# ───────────────────────────────────────────────────────────────────────────
# Pre-flight checks (silent, fail-fast, no prompts)
# ───────────────────────────────────────────────────────────────────────────
[ -x "$PY" ] || fail "Python interpreter not found at $PY — run 'python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt' first"
"$PY" -c "import httpx, bs4, tenacity" 2>/dev/null || fail "Python deps missing in $PY — run '.venv/bin/pip install -r scripts/requirements.txt' first"

log "Pre-flight OK"

# ───────────────────────────────────────────────────────────────────────────
# Sleep prevention (best-effort, never blocks)
# ───────────────────────────────────────────────────────────────────────────
INHIBIT=""
if command -v systemd-inhibit >/dev/null 2>&1; then
  INHIBIT="systemd-inhibit --what=sleep:idle --who=sekber-dikmen --why=overnight-scrape"
  log "Sleep prevention: systemd-inhibit"
elif command -v caffeinate >/dev/null 2>&1; then
  INHIBIT="caffeinate -i"
  log "Sleep prevention: caffeinate (macOS)"
else
  log "Sleep prevention: none available — disable system sleep manually if needed"
fi

# ───────────────────────────────────────────────────────────────────────────
# Launcher per-scraper dengan auto-restart loop
# ───────────────────────────────────────────────────────────────────────────
# Setiap scraper di-wrap di subshell yang restart otomatis jika exit non-zero.
# Stop kondisi: exit 0 (queue empty + clean shutdown).

launch_scraper() {
  local name="$1"
  local cmd="$2"
  local log="$LOG_DIR/$name.log"
  local pidfile="$LOG_DIR/$name.pid"

  (
    local attempt=0
    while true; do
      attempt=$((attempt + 1))
      log "[$name] Attempt #$attempt starting"
      echo "[$(date)] === Attempt $attempt ===" >> "$log"

      # Run scraper, capture exit code
      eval "$INHIBIT $cmd" >> "$log" 2>&1
      EXIT_CODE=$?

      if [ $EXIT_CODE -eq 0 ]; then
        log "[$name] Clean exit (queue empty)"
        touch "$LOG_DIR/.${name}_DONE"
        break
      fi

      log "[$name] Exited with code $EXIT_CODE — restart in 60s"
      sleep 60

      # Safety valve: jika sudah 200 kali restart, give up
      if [ $attempt -ge 200 ]; then
        log "[$name] Too many restarts ($attempt) — giving up"
        touch "$LOG_DIR/.${name}_FAILED"
        break
      fi
    done
  ) &

  local pid=$!
  echo "$pid" > "$pidfile"
  log "[$name] Launched as PID $pid"
}

launch_scraper "yayasan" "$PY scripts/02_scrape_yayasan.py --resume --concurrency 6 --max-pages 7500"
launch_scraper "dikmen"  "$PY scripts/01_scrape_dikmen.py  --resume --concurrency 8"

# ───────────────────────────────────────────────────────────────────────────
# Wait for completion — poll every 5 min, log progress snapshot
# ───────────────────────────────────────────────────────────────────────────
log "Waiting for both scrapers to complete..."
log "Will poll every 5 minutes. Estimated total: 12-30 hours."

POLL_INTERVAL=300  # 5 minutes
ELAPSED=0

while true; do
  YAYASAN_DONE=0
  DIKMEN_DONE=0
  [ -f "$LOG_DIR/.yayasan_DONE" ] || [ -f "$LOG_DIR/.yayasan_FAILED" ] && YAYASAN_DONE=1
  [ -f "$LOG_DIR/.dikmen_DONE" ]  || [ -f "$LOG_DIR/.dikmen_FAILED" ]  && DIKMEN_DONE=1

  # Snapshot progress (silent fail jika DB belum ada)
  Y_ROWS=$("$PY" -c "
import sqlite3, os
p='data/scraped/yayasan.db'
print(sqlite3.connect(p).execute('SELECT COUNT(*) FROM yayasan').fetchone()[0] if os.path.exists(p) else 0)
" 2>/dev/null || echo "?")
  D_ROWS=$("$PY" -c "
import sqlite3, os
p='data/scraped/dikmen.db'
print(sqlite3.connect(p).execute('SELECT COUNT(*) FROM satpen_dikmen').fetchone()[0] if os.path.exists(p) else 0)
" 2>/dev/null || echo "?")

  ELAPSED_H=$((ELAPSED / 3600))
  ELAPSED_M=$(((ELAPSED % 3600) / 60))
  log "Progress | elapsed ${ELAPSED_H}h${ELAPSED_M}m | yayasan: $Y_ROWS rows (done=$YAYASAN_DONE) | dikmen: $D_ROWS rows (done=$DIKMEN_DONE)"

  if [ $YAYASAN_DONE -eq 1 ] && [ $DIKMEN_DONE -eq 1 ]; then
    log "Both scrapers reported completion"
    break
  fi

  sleep $POLL_INTERVAL
  ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

# ───────────────────────────────────────────────────────────────────────────
# Stage 3: Build master DB + export XLSX
# ───────────────────────────────────────────────────────────────────────────
log "=== Phase 2: Build master database ==="

EXTRACTED_DIR="data/extracted"
if [ ! -d "$EXTRACTED_DIR/sma" ] || [ ! -d "$EXTRACTED_DIR/smk" ]; then
  log "WARN: PDF extraction belum dijalankan. Skipping DB build."
  log "Run manually: pnpm extract:pdf && pnpm build:db && pnpm export:xlsx"
  touch "$LOG_DIR/.PIPELINE_PARTIAL"
  exit 0
fi

"$PY" scripts/05_build_database.py \
  --sma-dir    "$EXTRACTED_DIR/sma" \
  --smk-dir    "$EXTRACTED_DIR/smk" \
  --dikmen-db  data/scraped/dikmen.db \
  --yayasan-db data/scraped/yayasan.db \
  --out        database/dikmen_master.db \
  >> "$LOG_DIR/build_db.log" 2>&1

if [ $? -eq 0 ]; then
  log "Master DB built: database/dikmen_master.db"
else
  log "ERROR: DB build failed — see $LOG_DIR/build_db.log"
  touch "$LOG_DIR/.PIPELINE_PARTIAL"
  exit 1
fi

log "=== Phase 3: Export XLSX ==="
"$PY" scripts/06_export_to_xlsx.py \
  --db  database/dikmen_master.db \
  --out database/dikmen_master.xlsx \
  >> "$LOG_DIR/export_xlsx.log" 2>&1

if [ $? -eq 0 ]; then
  log "XLSX exported: database/dikmen_master.xlsx"
else
  log "WARN: XLSX export failed — DB tetap usable"
fi

# ───────────────────────────────────────────────────────────────────────────
# Done
# ───────────────────────────────────────────────────────────────────────────
touch "$LOG_DIR/.PIPELINE_COMPLETE"
log "================================================================"
log "  PIPELINE COMPLETE"
log "  Total elapsed: ${ELAPSED_H}h${ELAPSED_M}m"
log "  Marker: $LOG_DIR/.PIPELINE_COMPLETE"
log "================================================================"
