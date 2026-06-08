#!/usr/bin/env bash
# =============================================================================
# SEKBER DIKMEN 2025 — Progress Checker (Read-Only, Non-Interactive)
# =============================================================================
# Cek progress pipeline tanpa interupsi proses berjalan.
# Aman dipanggil kapan saja, sama sekali tidak meminta input apapun.
#
# Usage:
#   bash scripts/check_progress.sh
# =============================================================================

set -u

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Prefer the project venv's interpreter (consistent with run_unattended.sh).
PY="${PY:-$PROJECT_ROOT/.venv/bin/python3}"
[ -x "$PY" ] || PY="python3"

# Cari log dir terbaru
LATEST=$(ls -1dt logs/unattended-* 2>/dev/null | head -1)

echo "=============================================="
echo "  SEKBER DIKMEN — Pipeline Status"
echo "  $(date)"
echo "=============================================="

if [ -z "$LATEST" ]; then
  echo "Belum ada run unattended. Mulai dengan:"
  echo "  bash scripts/run_unattended.sh"
  exit 0
fi

echo "Latest run: $LATEST"
echo ""

# Phase status
echo "── Phase markers ─────────────────────────────"
for marker in .yayasan_DONE .dikmen_DONE .PIPELINE_COMPLETE .PIPELINE_PARTIAL .PIPELINE_FAILED .yayasan_FAILED .dikmen_FAILED; do
  if [ -f "$LATEST/$marker" ]; then
    echo "  ✓ $marker  ($(stat -c %y "$LATEST/$marker" 2>/dev/null || stat -f %Sm "$LATEST/$marker" 2>/dev/null))"
  fi
done
echo ""

# Process status
echo "── Process status ────────────────────────────"
for name in yayasan dikmen; do
  pidfile="$LATEST/$name.pid"
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      echo "  $name: RUNNING (PID $pid)"
    else
      echo "  $name: stopped (PID $pid was last)"
    fi
  fi
done
echo ""

# Row counts
echo "── Row counts ────────────────────────────────"
"$PY" <<'PY' 2>/dev/null
import sqlite3, os
targets = [
    ("yayasan",         "data/scraped/yayasan.db",      "yayasan"),
    ("yayasan_naungan", "data/scraped/yayasan.db",      "yayasan_naungan"),
    ("satpen_dikmen",   "data/scraped/dikmen.db",       "satpen_dikmen"),
    ("master DB tables", "database/dikmen_master.db",   None),
]
for label, dbpath, tbl in targets:
    if not os.path.exists(dbpath):
        print(f"  {label:20s}: (db belum ada)")
        continue
    try:
        c = sqlite3.connect(dbpath)
        if tbl:
            n = c.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
            print(f"  {label:20s}: {n:>10,}")
        else:
            tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
            for t in tables:
                try:
                    n = c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                    print(f"    {t:18s}: {n:>10,}")
                except Exception:
                    pass
        c.close()
    except Exception as e:
        print(f"  {label:20s}: ERR {e}")
PY
echo ""

# Tail of launcher log
echo "── Last 8 lines of launcher.log ──────────────"
if [ -f "$LATEST/launcher.log" ]; then
  tail -8 "$LATEST/launcher.log" | sed 's/^/  /'
fi
echo ""
echo "Full log: tail -f $LATEST/launcher.log"
echo "=============================================="
