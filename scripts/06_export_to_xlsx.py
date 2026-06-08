#!/usr/bin/env python3
"""
06_export_to_xlsx.py
====================

Ekspor `database/dikmen_master.db` ke file `.xlsx` multi-sheet untuk
konsumsi non-teknis (operator, analis BI yang tidak setup ODBC).

Strategi:
- Tiap tabel/view utama → 1 sheet
- `fact_stat_long` di-pivot menjadi beberapa sheet per (kind, table_code) populer
- Auto-width kolom, freeze header row, format angka thousand separator

Usage:
    python3 scripts/06_export_to_xlsx.py \
        --db  database/dikmen_master.db \
        --out database/dikmen_master.xlsx

Catatan: kalau DB besar (full Tindakan 1+2 sudah selesai = ~190K row sekolah+yayasan),
output bisa ~50-80MB. Excel modern (2016+) sanggup.
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

try:
    import xlsxwriter
except ImportError:
    print("ERROR: xlsxwriter not installed. Run: pip install xlsxwriter", file=sys.stderr)
    sys.exit(1)


# Sheets utama yang selalu di-export (jika tabel ada)
CORE_SHEETS = [
    ("dim_province", "SELECT * FROM dim_province ORDER BY province_kd", "Dim Provinsi"),
    ("dim_table_catalog", "SELECT * FROM dim_table_catalog ORDER BY kind, table_code", "Dim Tabel"),
    ("vw_province_satpen_summary", "SELECT * FROM vw_province_satpen_summary", "Ringkasan Provinsi"),
    ("fact_satpen_dikmen", "SELECT * FROM fact_satpen_dikmen LIMIT 1000000", "Satuan Pendidikan"),
    ("fact_yayasan", "SELECT * FROM fact_yayasan LIMIT 1000000", "Yayasan"),
    ("fact_yayasan_naungan", "SELECT * FROM fact_yayasan_naungan LIMIT 1000000", "Yayasan-Sekolah"),
]

# Tabel statistik PDF "populer" yang di-pivot ke sheet sendiri
# (kind, table_code, sheet_name)
PIVOT_HIGHLIGHTS = [
    ("sma", "1.1.1", "SMA 1.1.1 SatPen"),
    ("sma", "1.1.2", "SMA 1.1.2 Siswa"),
    ("smk", "1.1.1", "SMK 1.1.1 SatPen"),
    ("smk", "1.1.2", "SMK 1.1.2 Siswa"),
]


def export(db_path: Path, out_path: Path) -> None:
    if not db_path.exists():
        sys.exit(f"DB not found: {db_path}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    wb = xlsxwriter.Workbook(str(out_path), {"constant_memory": True, "default_date_format": "yyyy-mm-dd"})

    # Styles
    fmt_header = wb.add_format({"bold": True, "bg_color": "#0B2545", "font_color": "#FFFFFF",
                                "border": 1, "align": "center", "valign": "vcenter"})
    fmt_int = wb.add_format({"num_format": "#,##0"})
    fmt_text = wb.add_format({})

    # ── Cover sheet ─────────────────────────────────────────────────────────
    cover = wb.add_worksheet("README")
    cover.set_column("A:A", 100)
    cover.write(0, 0, "SEKBER DIKMEN 2025 — Master Database Export", wb.add_format({"bold": True, "font_size": 16, "font_color": "#0B2545"}))
    cover.write(2, 0, "File ini di-generate otomatis dari database/dikmen_master.db oleh script 06_export_to_xlsx.py.")
    cover.write(3, 0, "Untuk query ad-hoc langsung dari Excel, gunakan Get Data → SQLite (lihat docs/EXCEL_GET_DATA_GUIDE.md).")
    cover.write(5, 0, "Daftar sheet:")
    row = 6
    for tbl, _, label in CORE_SHEETS:
        cover.write(row, 0, f"  • {label} (sumber: {tbl})")
        row += 1
    for kind, code, label in PIVOT_HIGHLIGHTS:
        cover.write(row, 0, f"  • {label} (pivot dari fact_stat_long)")
        row += 1
    cover.write(row + 1, 0, "Linkage rules: lihat docs/SCHEMA.md section 2.")

    # ── Core sheets ─────────────────────────────────────────────────────────
    for tbl, sql, sheet_name in CORE_SHEETS:
        # Skip kalau tabel kosong / belum ada
        try:
            n = cur.execute(f"SELECT COUNT(*) FROM ({sql.split(' LIMIT ')[0]})").fetchone()[0]
        except sqlite3.OperationalError:
            print(f"  [skip] {tbl}: tabel tidak ada")
            continue
        if n == 0:
            print(f"  [skip] {tbl}: 0 row")
            continue

        ws = wb.add_worksheet(sheet_name[:31])
        ws.freeze_panes(1, 0)

        cur.execute(sql)
        cols = [d[0] for d in cur.description]

        # Header
        for j, c in enumerate(cols):
            ws.write(0, j, c, fmt_header)
        ws.set_column(0, len(cols) - 1, 18)

        # Data (streaming, constant memory mode)
        i = 1
        for row_data in cur:
            for j, val in enumerate(row_data):
                if val is None:
                    continue
                if isinstance(val, (int, float)) and not isinstance(val, bool):
                    ws.write_number(i, j, val, fmt_int)
                else:
                    ws.write_string(i, j, str(val), fmt_text)
            i += 1
        print(f"  [ok]   {sheet_name}: {i-1:,} rows")

    # ── Pivot highlights ────────────────────────────────────────────────────
    for kind, code, sheet_name in PIVOT_HIGHLIGHTS:
        cur.execute("""
            SELECT 1 FROM dim_table_catalog WHERE kind=? AND table_code=?
        """, (kind, code))
        if not cur.fetchone():
            print(f"  [skip] {sheet_name}: tabel tidak ada di catalog")
            continue

        # Get max col_index
        cur.execute("SELECT MAX(col_index) FROM fact_stat_long WHERE kind=? AND table_code=?", (kind, code))
        max_col = cur.fetchone()[0]
        if max_col is None:
            print(f"  [skip] {sheet_name}: tidak ada data fact (kemungkinan tabel ringkasan nasional)")
            continue

        # Get header_hints
        cur.execute("SELECT header_hints, title FROM dim_table_catalog WHERE kind=? AND table_code=?", (kind, code))
        hints_row = cur.fetchone()
        hints = (hints_row["header_hints"] or "").split("|") if hints_row else []
        title = hints_row["title"] if hints_row else f"{kind.upper()} {code}"

        # Pivot query
        pivot_cols = ", ".join([f"SUM(CASE WHEN col_index={i} THEN value END) AS c{i}" for i in range(1, max_col + 1)])
        pivot_sql = f"""
            SELECT p.province_kd, p.province_name, {pivot_cols}
            FROM fact_stat_long f
            JOIN dim_province p ON p.province_kd = f.province_kd
            WHERE f.kind=? AND f.table_code=?
            GROUP BY p.province_kd, p.province_name
            ORDER BY p.province_kd
        """
        cur.execute(pivot_sql, (kind, code))

        ws = wb.add_worksheet(sheet_name[:31])
        ws.freeze_panes(2, 2)

        # Title row
        title_fmt = wb.add_format({"bold": True, "font_size": 12, "font_color": "#0B2545"})
        ws.merge_range(0, 0, 0, max_col + 1, title, title_fmt)

        # Header
        ws.write(1, 0, "province_kd", fmt_header)
        ws.write(1, 1, "province_name", fmt_header)
        for i in range(1, max_col + 1):
            hint = hints[i - 1].strip() if i - 1 < len(hints) else f"col_{i}"
            ws.write(1, i + 1, hint or f"col_{i}", fmt_header)
        ws.set_column(0, 1, 20)
        ws.set_column(2, max_col + 1, 15)

        r = 2
        for row_data in cur:
            ws.write_string(r, 0, str(row_data["province_kd"]))
            ws.write_string(r, 1, row_data["province_name"] or "")
            for i in range(1, max_col + 1):
                val = row_data[f"c{i}"]
                if val is not None:
                    ws.write_number(r, i + 1, val, fmt_int)
            r += 1
        print(f"  [ok]   {sheet_name}: {r-2:,} rows × {max_col} cols")

    wb.close()
    con.close()

    size_mb = out_path.stat().st_size / 1024 / 1024
    print(f"\n✓ Export selesai: {out_path}  ({size_mb:.1f} MB)")


def main() -> None:
    p = argparse.ArgumentParser(description="Export dikmen_master.db ke multi-sheet XLSX")
    p.add_argument("--db", type=Path, default=Path("database/dikmen_master.db"))
    p.add_argument("--out", type=Path, default=Path("database/dikmen_master.xlsx"))
    args = p.parse_args()
    export(args.db, args.out)


if __name__ == "__main__":
    main()
