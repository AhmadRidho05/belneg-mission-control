#!/usr/bin/env bash
# =============================================================================
# SEKBER DIKMEN 2025 — Stopper (Non-Interactive)
# =============================================================================
# Hentikan semua proses pipeline tanpa konfirmasi.
# Resume tetap mungkin via `bash scripts/run_unattended.sh` lagi (queue persist).
#
# Usage:
#   bash scripts/stop_unattended.sh
# =============================================================================

set -u

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

LATEST=$(ls -1dt logs/unattended-* 2>/dev/null | head -1)

if [ -z "$LATEST" ]; then
  echo "Tidak ada run aktif yang ditemukan."
  exit 0
fi

echo "Stopping pipeline from: $LATEST"

# Kill daemon dulu
if [ -f "$LATEST/launcher.pid" ]; then
  pid=$(cat "$LATEST/launcher.pid")
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null && echo "  Stopped launcher (PID $pid)"
  fi
fi

# Kill child scrapers
for name in yayasan dikmen; do
  pidfile="$LATEST/$name.pid"
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null && echo "  Stopped $name (PID $pid)"
    fi
  fi
done

# Hard-kill leftover python scrapers (best-effort)
pkill -f "scripts/01_scrape_dikmen.py"  2>/dev/null && echo "  Killed orphan dikmen process"  || true
pkill -f "scripts/02_scrape_yayasan.py" 2>/dev/null && echo "  Killed orphan yayasan process" || true

echo "Done. Resume kapan saja dengan: bash scripts/run_unattended.sh"
