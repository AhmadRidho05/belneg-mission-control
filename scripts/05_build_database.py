#!/usr/bin/env python3
"""
TINDAKAN 5 (Consolidator): Build Master Relational Database
============================================================
Menggabungkan output Tindakan 1-4 ke satu file SQLite (`dikmen_master.db`)
yang siap diakses Excel via "Get Data → From Database → From SQL Server Database"
(atau lebih akurat: "From ODBC" dengan driver SQLite ODBC) atau "Power Query".

Output tables:
─────────────
DIM_PROVINCE              (38 provinsi + Luar Negeri, dengan KD code)
DIM_TABLE_CATALOG         (registry semua 248 statistical tables dari PDF)

FACT_SATPEN_DIKMEN        (~43,144 satuan pendidikan SMA/SMK/MA dari Tindakan 1)
FACT_YAYASAN              (~148,693 yayasan dari Tindakan 2)
FACT_YAYASAN_NAUNGAN      (sekolah-sekolah dibawah naungan yayasan, 1-N)

FACT_SMA_STAT             (long-format: tabel_code, province_kd, col_index, value)
FACT_SMK_STAT             (long-format: tabel_code, province_kd, col_index, value)

VW_SATPEN_WITH_YAYASAN    (LEFT JOIN satpen + yayasan via NPYP)
VW_PROVINCE_ROLLUP        (KPI summary per province dari FACT_SATPEN + FACT_SMA/SMK_STAT)

Usage:
    python 05_build_database.py \\
        --dikmen-db   data/scraped/dikmen.db \\
        --yayasan-db  data/scraped/yayasan.db \\
        --sma-dir     data/extracted/sma \\
        --smk-dir     data/extracted/smk \\
        --out         database/dikmen_master.db

The script is idempotent — rerun anytime to refresh from sources.
"""

from __future__ import annotations

import argparse
import csv
import json
import sqlite3
from pathlib import Path
from typing import Dict, List, Optional, Tuple

PROVINCE_KD_MAP = {
    "11": "Aceh", "12": "Sumatera Utara", "13": "Sumatera Barat", "14": "Riau",
    "15": "Jambi", "16": "Sumatera Selatan", "17": "Bengkulu", "18": "Lampung",
    "19": "Kep. Bangka Belitung", "21": "Kepulauan Riau",
    "31": "DKI Jakarta", "32": "Jawa Barat", "33": "Jawa Tengah",
    "34": "DI Yogyakarta", "35": "Jawa Timur", "36": "Banten",
    "51": "Bali", "52": "Nusa Tenggara Barat", "53": "Nusa Tenggara Timur",
    "61": "Kalimantan Barat", "62": "Kalimantan Tengah", "63": "Kalimantan Selatan",
    "64": "Kalimantan Timur", "65": "Kalimantan Utara",
    "71": "Sulawesi Utara", "72": "Sulawesi Tengah", "73": "Sulawesi Selatan",
    "74": "Sulawesi Tenggara", "75": "Gorontalo", "76": "Sulawesi Barat",
    "81": "Maluku", "82": "Maluku Utara",
    "91": "Papua", "92": "Papua Barat", "93": "Papua Selatan",
    "94": "Papua Tengah", "95": "Papua Pegunungan", "96": "Papua Barat Daya",
    "-":  "Luar Negeri",
}

# API province name forms ("PROV. JAWA BARAT", "LUAR NEGERI") → 2-digit BPS kd.
# Both data.kemendikdasmen.go.id scrape sources (satpen, yayasan) emit this form;
# build_name_to_kd() expands PROVINCE_KD_MAP + handles the 3 punctuation oddities.
def _build_name_to_kd() -> Dict[str, str]:
    lookup: Dict[str, str] = {}
    for kd, short_name in PROVINCE_KD_MAP.items():
        if short_name == "Luar Negeri":
            lookup["LUAR NEGERI"] = kd
            continue
        upper = short_name.upper()
        lookup[f"PROV. {upper}"] = kd
        lookup[upper] = kd
    # API uses dotted variants for these three; PROVINCE_KD_MAP uses compact forms.
    lookup["PROV. D.K.I. JAKARTA"] = "31"
    lookup["PROV. D.I. YOGYAKARTA"] = "34"
    lookup["PROV. KEPULAUAN BANGKA BELITUNG"] = "19"
    return lookup


PROVINCE_NAME_TO_KD: Dict[str, str] = _build_name_to_kd()


# Island grouping for nicer dashboard slicers
ISLAND_MAP = {
    "11": "Sumatera", "12": "Sumatera", "13": "Sumatera", "14": "Sumatera",
    "15": "Sumatera", "16": "Sumatera", "17": "Sumatera", "18": "Sumatera",
    "19": "Sumatera", "21": "Sumatera",
    "31": "Jawa", "32": "Jawa", "33": "Jawa", "34": "Jawa", "35": "Jawa", "36": "Jawa",
    "51": "Bali & Nusa Tenggara", "52": "Bali & Nusa Tenggara", "53": "Bali & Nusa Tenggara",
    "61": "Kalimantan", "62": "Kalimantan", "63": "Kalimantan", "64": "Kalimantan", "65": "Kalimantan",
    "71": "Sulawesi", "72": "Sulawesi", "73": "Sulawesi", "74": "Sulawesi",
    "75": "Sulawesi", "76": "Sulawesi",
    "81": "Maluku & Papua", "82": "Maluku & Papua",
    "91": "Maluku & Papua", "92": "Maluku & Papua", "93": "Maluku & Papua",
    "94": "Maluku & Papua", "95": "Maluku & Papua", "96": "Maluku & Papua",
    "-":  "Luar Negeri",
}

SCHEMA = """
DROP TABLE IF EXISTS dim_province;
CREATE TABLE dim_province (
    province_kd TEXT PRIMARY KEY,
    province_name TEXT,
    island TEXT
);

DROP TABLE IF EXISTS dim_table_catalog;
CREATE TABLE dim_table_catalog (
    table_code TEXT,                      -- e.g. "1.1.2"
    kind TEXT,                            -- sma | smk
    title TEXT,
    n_columns INTEGER,
    n_rows INTEGER,
    header_hints TEXT,                    -- JSON array of raw header text lines
    column_names TEXT,                    -- JSON array of LLM-generated snake_case names per col_1..col_N
    PRIMARY KEY (table_code, kind)
);

DROP TABLE IF EXISTS fact_satpen_dikmen;
CREATE TABLE fact_satpen_dikmen (
    npsn TEXT PRIMARY KEY,
    nama TEXT,
    alamat TEXT, desa_kelurahan TEXT, kecamatan TEXT, kab_kota TEXT, provinsi TEXT,
    province_kd TEXT,                       -- 2-digit BPS code, FK -> dim_province
    kab_norm TEXT,                          -- uppercase kab/kota without prefix, for joining dim_kodim
    alamat_konsolidasi TEXT,
    status_sekolah TEXT, bentuk_pendidikan TEXT, jenjang_pendidikan TEXT,
    kementerian_pembina TEXT, naungan TEXT, npyp TEXT,
    no_sk_pendirian TEXT, tgl_sk_pendirian TEXT,
    no_sk_operasional TEXT, tgl_sk_operasional TEXT,
    file_sk_operasional_url TEXT, tgl_upload_sk_op TEXT,
    akreditasi TEXT,
    luas_tanah INTEGER, akses_internet TEXT, sumber_listrik TEXT,
    fax TEXT, telepon TEXT, email TEXT, website TEXT, operator TEXT,
    lintang REAL, bujur REAL,
    scraped_at TEXT, source_url TEXT
);
CREATE INDEX idx_satpen_prov ON fact_satpen_dikmen(provinsi);
CREATE INDEX idx_satpen_pkd ON fact_satpen_dikmen(province_kd);
CREATE INDEX idx_satpen_kab ON fact_satpen_dikmen(kab_kota);
CREATE INDEX idx_satpen_kabnorm ON fact_satpen_dikmen(kab_norm);
CREATE INDEX idx_satpen_kec ON fact_satpen_dikmen(kecamatan);
CREATE INDEX idx_satpen_bentuk ON fact_satpen_dikmen(bentuk_pendidikan);
CREATE INDEX idx_satpen_status ON fact_satpen_dikmen(status_sekolah);
CREATE INDEX idx_satpen_akr ON fact_satpen_dikmen(akreditasi);
CREATE INDEX idx_satpen_npyp ON fact_satpen_dikmen(npyp);

DROP TABLE IF EXISTS fact_yayasan;
CREATE TABLE fact_yayasan (
    npyp TEXT PRIMARY KEY,
    judul TEXT, pimpinan TEXT, operator TEXT, email TEXT,
    no_pendirian TEXT, tgl_pendirian TEXT,
    no_pengesahan_pn_ln TEXT,
    no_sk_badan_hukum TEXT, tgl_sk_pengesahan TEXT,
    n_sekolah_naungan INTEGER DEFAULT 0,
    nama_provinsi TEXT,                     -- "PROV. XXX" form from API
    province_kd TEXT,                       -- 2-digit BPS code, FK -> dim_province
    scraped_at TEXT, source_url TEXT
);
CREATE INDEX idx_yayasan_pkd ON fact_yayasan(province_kd);

DROP TABLE IF EXISTS fact_yayasan_naungan;
CREATE TABLE fact_yayasan_naungan (
    npyp TEXT, npsn TEXT, nama TEXT, jenjang TEXT,
    kecamatan TEXT, kabupaten TEXT, provinsi TEXT,
    province_kd TEXT,                       -- 2-digit BPS code, FK -> dim_province
    PRIMARY KEY (npyp, npsn)
);
CREATE INDEX idx_naung_prov ON fact_yayasan_naungan(provinsi);
CREATE INDEX idx_naung_pkd ON fact_yayasan_naungan(province_kd);
CREATE INDEX idx_naung_npsn ON fact_yayasan_naungan(npsn);

DROP TABLE IF EXISTS fact_stat_long;
CREATE TABLE fact_stat_long (
    kind TEXT NOT NULL,                  -- sma | smk
    table_code TEXT NOT NULL,            -- e.g. "1.1.2"
    province_kd TEXT NOT NULL,
    col_index INTEGER NOT NULL,          -- 1-based column index within that table
    value REAL,
    PRIMARY KEY (kind, table_code, province_kd, col_index)
);
CREATE INDEX idx_stat_kind_table ON fact_stat_long(kind, table_code);
CREATE INDEX idx_stat_kd ON fact_stat_long(province_kd);

-- ============================================================================
-- TNI AD territorial hierarchy: KODAM > KOREM > KODIM
-- Sourced from KODAMKOREMKODIM/ CSVs via 08_ingest_kodam_csv.py
-- ============================================================================
CREATE TABLE dim_kodam (
    kodam_id TEXT PRIMARY KEY,            -- e.g. "KODAM-01"
    name TEXT NOT NULL,                   -- e.g. "Kodam I/Bukit Barisan"
    address TEXT,
    lat REAL,
    lng REAL
);

CREATE TABLE dim_korem (
    korem_id TEXT PRIMARY KEY,            -- e.g. "KOREM-001"
    kodam_id TEXT NOT NULL REFERENCES dim_kodam(kodam_id),
    name TEXT NOT NULL,                   -- "Korem 022/Pantai Timur" or "Berdiri Sendiri"
    is_berdiri_sendiri INTEGER NOT NULL DEFAULT 0,  -- 1 if name = "Berdiri Sendiri"
    address TEXT,
    lat REAL,
    lng REAL
);
CREATE INDEX idx_korem_kodam ON dim_korem(kodam_id);

CREATE TABLE dim_kodim (
    kodim_id TEXT PRIMARY KEY,            -- e.g. "KODIM-001"
    korem_id TEXT REFERENCES dim_korem(korem_id),  -- nullable: Berdiri Sendiri kodim
    kodam_id TEXT NOT NULL REFERENCES dim_kodam(kodam_id),
    name TEXT NOT NULL,                   -- e.g. "Kodim 0201/Medan"
    address TEXT,
    lat REAL,
    lng REAL,
    kecamatan TEXT,
    kabupaten_kota TEXT,                  -- normalized "Kab. ..." or "Kota ..." string
    kabupaten_norm TEXT                   -- uppercase without "Kab. "/"Kota " prefix for joining
);
CREATE INDEX idx_kodim_kodam ON dim_kodim(kodam_id);
CREATE INDEX idx_kodim_korem ON dim_kodim(korem_id);
CREATE INDEX idx_kodim_kabnorm ON dim_kodim(kabupaten_norm);

-- Views: pivot-ready widening done at query time via Excel/Dashboard.

DROP VIEW IF EXISTS vw_satpen_with_yayasan;
CREATE VIEW vw_satpen_with_yayasan AS
    SELECT
        s.*,
        y.judul AS yayasan_nama,
        y.pimpinan AS yayasan_pimpinan,
        y.tgl_pendirian AS yayasan_tgl_pendirian,
        y.n_sekolah_naungan AS yayasan_total_naungan
    FROM fact_satpen_dikmen s
    LEFT JOIN fact_yayasan y ON s.npyp = y.npyp;

DROP VIEW IF EXISTS vw_satpen_with_kodim;
CREATE VIEW vw_satpen_with_kodim AS
    SELECT
        s.npsn, s.nama, s.bentuk_pendidikan, s.status_sekolah, s.akreditasi,
        s.kab_kota, s.kecamatan, s.provinsi, s.province_kd,
        s.lintang, s.bujur,
        k.kodim_id, k.name AS kodim_name,
        k.korem_id, kr.name AS korem_name,
        k.kodam_id, kd.name AS kodam_name
    FROM fact_satpen_dikmen s
    LEFT JOIN dim_kodim k ON s.kab_norm = k.kabupaten_norm
    LEFT JOIN dim_korem kr ON k.korem_id = kr.korem_id
    LEFT JOIN dim_kodam kd ON k.kodam_id = kd.kodam_id;

DROP VIEW IF EXISTS vw_kodam_school_summary;
CREATE VIEW vw_kodam_school_summary AS
    SELECT
        kd.kodam_id,
        kd.name AS kodam_name,
        (SELECT COUNT(*) FROM dim_korem WHERE kodam_id = kd.kodam_id AND is_berdiri_sendiri = 0) AS n_korem,
        (SELECT COUNT(*) FROM dim_kodim WHERE kodam_id = kd.kodam_id) AS n_kodim,
        (SELECT COUNT(*) FROM vw_satpen_with_kodim WHERE kodam_id = kd.kodam_id) AS n_sekolah,
        (SELECT COUNT(*) FROM vw_satpen_with_kodim WHERE kodam_id = kd.kodam_id AND akreditasi='A') AS n_akreditasi_a,
        (SELECT COUNT(*) FROM vw_satpen_with_kodim WHERE kodam_id = kd.kodam_id AND UPPER(status_sekolah)='NEGERI') AS n_negeri,
        (SELECT COUNT(*) FROM vw_satpen_with_kodim WHERE kodam_id = kd.kodam_id AND UPPER(status_sekolah)='SWASTA') AS n_swasta
    FROM dim_kodam kd;

DROP VIEW IF EXISTS vw_province_satpen_summary;
CREATE VIEW vw_province_satpen_summary AS
    SELECT
        provinsi AS province_name,
        COUNT(*) AS total_satpen,
        SUM(CASE WHEN status_sekolah='Negeri' THEN 1 ELSE 0 END) AS total_negeri,
        SUM(CASE WHEN status_sekolah='Swasta' THEN 1 ELSE 0 END) AS total_swasta,
        SUM(CASE WHEN bentuk_pendidikan='SMA' THEN 1 ELSE 0 END) AS total_sma,
        SUM(CASE WHEN bentuk_pendidikan='SMK' THEN 1 ELSE 0 END) AS total_smk,
        SUM(CASE WHEN bentuk_pendidikan='MA' THEN 1 ELSE 0 END) AS total_ma,
        SUM(CASE WHEN akreditasi='A' THEN 1 ELSE 0 END) AS akreditasi_a,
        SUM(CASE WHEN akreditasi='B' THEN 1 ELSE 0 END) AS akreditasi_b,
        SUM(CASE WHEN akreditasi='C' THEN 1 ELSE 0 END) AS akreditasi_c,
        SUM(CASE WHEN lintang IS NOT NULL AND bujur IS NOT NULL THEN 1 ELSE 0 END) AS with_coords
    FROM fact_satpen_dikmen
    WHERE provinsi IS NOT NULL
    GROUP BY provinsi;
"""


def load_csv_to_long(conn: sqlite3.Connection, csv_path: Path, kind: str, table_code: str) -> int:
    """Load one PDF-extracted CSV into FACT_STAT_LONG (long format)."""
    n = 0
    with csv_path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        # National summary tables (e.g. 1.1.1) have different schema — store specially in catalog.
        if "province_kd" not in (reader.fieldnames or []):
            return 0
        # Identify value columns: col_1, col_2, ...
        value_cols = [c for c in reader.fieldnames if c.startswith("col_")]
        for row in reader:
            kd = row["province_kd"]
            for ci, col in enumerate(value_cols, start=1):
                val = row.get(col)
                if val is None or val == "":
                    continue
                try:
                    fval = float(val)
                except ValueError:
                    continue
                conn.execute(
                    "INSERT OR REPLACE INTO fact_stat_long(kind, table_code, province_kd, col_index, value) "
                    "VALUES (?,?,?,?,?)",
                    (kind, table_code, kd, ci, fval),
                )
                n += 1
    return n


def import_pdf_extraction(conn: sqlite3.Connection, src_dir: Path, kind: str) -> Tuple[int, int]:
    """Import one PDF-extraction directory (sma/ or smk/)."""
    manifest_path = src_dir / "manifest.json"
    if not manifest_path.exists():
        print(f"[WARN] No manifest at {manifest_path}; skipping.")
        return 0, 0
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    n_tables = 0
    n_facts = 0
    for entry in manifest["tables"]:
        code = entry["code"]
        csv_name = entry["csv"]
        csv_path = src_dir / csv_name
        if not csv_path.exists():
            continue

        # Register in catalog
        conn.execute(
            "INSERT OR REPLACE INTO dim_table_catalog"
            "(table_code, kind, title, n_columns, n_rows, header_hints, column_names) "
            "VALUES (?,?,?,?,?,?,?)",
            (
                code, kind,
                entry.get("title", ""),
                entry.get("n_columns", 0),
                entry.get("rows", 0),
                json.dumps(entry.get("header_hints", []), ensure_ascii=False),
                json.dumps(entry.get("column_names", []), ensure_ascii=False),
            ),
        )
        n_tables += 1

        # Load fact rows
        added = load_csv_to_long(conn, csv_path, kind, code)
        n_facts += added

    return n_tables, n_facts


def import_scraped_db(conn: sqlite3.Connection, src_db: Path, table: str, target: str, cols: List[str]) -> int:
    if not src_db.exists():
        print(f"[WARN] {src_db} does not exist; skipping {target}.")
        return 0
    src = sqlite3.connect(src_db)
    try:
        n = 0
        col_csv = ",".join(cols)
        ph = ",".join(["?"] * len(cols))
        rows = src.execute(f"SELECT {col_csv} FROM {table}").fetchall()
        conn.executemany(
            f"INSERT OR REPLACE INTO {target}({col_csv}) VALUES({ph})",
            rows,
        )
        n = len(rows)
        return n
    finally:
        src.close()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--dikmen-db", type=Path, default=Path("data/scraped/dikmen.db"))
    p.add_argument("--yayasan-db", type=Path, default=Path("data/scraped/yayasan.db"))
    p.add_argument("--sma-dir", type=Path, default=Path("data/extracted/sma"))
    p.add_argument("--smk-dir", type=Path, default=Path("data/extracted/smk"))
    p.add_argument("--kodam-db", type=Path, default=Path("database/scraped/kodam.db"))
    p.add_argument("--out", type=Path, default=Path("database/dikmen_master.db"))
    args = p.parse_args()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    if args.out.exists():
        args.out.unlink()  # Fresh rebuild
    conn = sqlite3.connect(args.out)
    conn.executescript(SCHEMA)

    # 1) dim_province
    for kd, name in PROVINCE_KD_MAP.items():
        conn.execute(
            "INSERT INTO dim_province(province_kd, province_name, island) VALUES (?,?,?)",
            (kd, name, ISLAND_MAP.get(kd)),
        )
    print(f"[OK] dim_province: {len(PROVINCE_KD_MAP)} rows")

    # 2) Import PDF extractions
    n_t_sma, n_f_sma = import_pdf_extraction(conn, args.sma_dir, "sma")
    n_t_smk, n_f_smk = import_pdf_extraction(conn, args.smk_dir, "smk")
    conn.commit()
    print(f"[OK] SMA: {n_t_sma} tables, {n_f_sma:,} fact rows")
    print(f"[OK] SMK: {n_t_smk} tables, {n_f_smk:,} fact rows")

    # 3) Import scraped DBs
    satpen_cols = [
        "npsn","nama","alamat","desa_kelurahan","kecamatan","kab_kota","provinsi","alamat_konsolidasi",
        "status_sekolah","bentuk_pendidikan","jenjang_pendidikan","kementerian_pembina","naungan","npyp",
        "no_sk_pendirian","tgl_sk_pendirian","no_sk_operasional","tgl_sk_operasional",
        "file_sk_operasional_url","tgl_upload_sk_op","akreditasi","luas_tanah","akses_internet",
        "sumber_listrik","fax","telepon","email","website","operator","lintang","bujur",
        "scraped_at","source_url"
    ]
    n_satpen = import_scraped_db(conn, args.dikmen_db, "satpen_dikmen", "fact_satpen_dikmen", satpen_cols)
    print(f"[OK] fact_satpen_dikmen: {n_satpen:,} rows")

    yayasan_cols = [
        "npyp","judul","pimpinan","operator","email","no_pendirian","tgl_pendirian",
        "no_pengesahan_pn_ln","no_sk_badan_hukum","tgl_sk_pengesahan","n_sekolah_naungan",
        "nama_provinsi","scraped_at","source_url"
    ]
    n_y = import_scraped_db(conn, args.yayasan_db, "yayasan", "fact_yayasan", yayasan_cols)
    print(f"[OK] fact_yayasan: {n_y:,} rows")

    naungan_cols = ["npyp","npsn","nama","jenjang","kecamatan","kabupaten","provinsi"]
    n_n = import_scraped_db(conn, args.yayasan_db, "yayasan_naungan", "fact_yayasan_naungan", naungan_cols)
    print(f"[OK] fact_yayasan_naungan: {n_n:,} rows")

    # 4) Populate province_kd FK columns from text names (PROV. XXX → 2-digit BPS kd)
    print("[*] Populating province_kd FKs ...")
    targets = [
        ("fact_satpen_dikmen", "provinsi"),
        ("fact_yayasan",       "nama_provinsi"),
        ("fact_yayasan_naungan","provinsi"),
    ]
    for table, src_col in targets:
        n_updated = 0
        for name, kd in PROVINCE_NAME_TO_KD.items():
            cur = conn.execute(
                f"UPDATE {table} SET province_kd = ? WHERE {src_col} = ? AND province_kd IS NULL",
                (kd, name),
            )
            n_updated += cur.rowcount
        n_unmapped = conn.execute(
            f"SELECT COUNT(*) FROM {table} WHERE {src_col} IS NOT NULL AND {src_col} != '' AND province_kd IS NULL"
        ).fetchone()[0]
        print(f"  {table}: {n_updated:>7,} mapped, {n_unmapped:>5,} unmapped")
        if n_unmapped > 0:
            sample = conn.execute(
                f"SELECT DISTINCT {src_col} FROM {table} WHERE {src_col} IS NOT NULL AND {src_col} != '' AND province_kd IS NULL LIMIT 5"
            ).fetchall()
            for r in sample:
                print(f"    unmapped name: {r[0]!r}")

    # 4b) Populate kab_norm on fact_satpen_dikmen for kodim join
    print("[*] Populating kab_norm on fact_satpen_dikmen ...")
    rows = conn.execute("SELECT npsn, kab_kota FROM fact_satpen_dikmen WHERE kab_kota IS NOT NULL").fetchall()
    def _norm_satpen_kab(s: str) -> str:
        t = s.strip().upper()
        for prefix in ("KABUPATEN ", "KOTA ADM. ", "KOTA ADMINISTRASI ", "KAB. ", "KAB ", "KOTA "):
            if t.startswith(prefix):
                t = t[len(prefix):]
                break
        return t.strip()
    conn.executemany(
        "UPDATE fact_satpen_dikmen SET kab_norm = ? WHERE npsn = ?",
        [(_norm_satpen_kab(kab), npsn) for npsn, kab in rows],
    )
    print(f"  updated {len(rows):,} rows")

    # 5) Import KODAM/KOREM/KODIM hierarchy
    if args.kodam_db.exists():
        src = sqlite3.connect(args.kodam_db)
        kodam_rows = src.execute("SELECT kodam_id, name, address, lat, lng FROM kodam_raw").fetchall()
        conn.executemany("INSERT INTO dim_kodam(kodam_id,name,address,lat,lng) VALUES (?,?,?,?,?)", kodam_rows)

        korem_rows = src.execute("SELECT korem_id, kodam_id, name, address, lat, lng FROM korem_raw").fetchall()
        conn.executemany(
            "INSERT INTO dim_korem(korem_id,kodam_id,name,is_berdiri_sendiri,address,lat,lng) VALUES (?,?,?,?,?,?,?)",
            [(kid, kdid, nm, 1 if nm == "Berdiri Sendiri" else 0, addr, lat, lng) for kid, kdid, nm, addr, lat, lng in korem_rows],
        )

        kodim_rows = src.execute(
            "SELECT kodim_id, korem_id, kodam_id, name, address, lat, lng, kecamatan, kabupaten_kota FROM kodim_raw"
        ).fetchall()

        def norm_kab(s: str | None) -> str | None:
            if not s:
                return None
            t = s.strip()
            for prefix in ("Kabupaten ", "Kab. ", "Kab ", "Kota Administrasi ", "Kota "):
                if t.startswith(prefix):
                    t = t[len(prefix):]
                    break
            return t.upper()

        conn.executemany(
            "INSERT INTO dim_kodim(kodim_id,korem_id,kodam_id,name,address,lat,lng,kecamatan,kabupaten_kota,kabupaten_norm) VALUES (?,?,?,?,?,?,?,?,?,?)",
            [(*row, norm_kab(row[8])) for row in kodim_rows],
        )
        src.close()
        print(f"[OK] dim_kodam: {len(kodam_rows)}, dim_korem: {len(korem_rows)}, dim_kodim: {len(kodim_rows)}")
    else:
        print(f"[WARN] {args.kodam_db} not found; skipping KODAM hierarchy. Run scripts/08_ingest_kodam_csv.py first.")

    conn.execute("ANALYZE")
    conn.commit()
    conn.close()
    print(f"\n[DONE] Master DB written to: {args.out}")
    print(f"       Size: {args.out.stat().st_size / 1024 / 1024:.1f} MB")
    print("\nNext: open Excel → Data → Get Data → From Other Sources → From ODBC (with SQLite driver)")
    print("       or use DB Browser for SQLite for ad-hoc exploration.")


if __name__ == "__main__":
    main()
