#!/usr/bin/env python3
"""Ingest KODAMKOREMKODIM CSVs into a staging SQLite DB.

Reads kodam.csv, korem.csv, kodim.csv from KODAMKOREMKODIM/ and writes them
into database/scraped/kodam.db as raw staging tables (kodam_raw, korem_raw,
kodim_raw). Run 05_build_database.py afterward to fold these into the master DB
as dim_kodam, dim_korem, dim_kodim.
"""

from __future__ import annotations

import argparse
import csv
import sqlite3
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SRC = REPO_ROOT / "KODAMKOREMKODIM"
DEFAULT_DST = REPO_ROOT / "database" / "scraped" / "kodam.db"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--src", type=Path, default=DEFAULT_SRC)
    parser.add_argument("--db", type=Path, default=DEFAULT_DST)
    args = parser.parse_args()

    args.db.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(args.db)
    cur = con.cursor()

    cur.executescript(
        """
        DROP TABLE IF EXISTS kodam_raw;
        DROP TABLE IF EXISTS korem_raw;
        DROP TABLE IF EXISTS kodim_raw;

        CREATE TABLE kodam_raw (
            kodam_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            address TEXT,
            lat REAL,
            lng REAL
        );

        CREATE TABLE korem_raw (
            korem_id TEXT PRIMARY KEY,
            kodam_id TEXT NOT NULL,
            kodam TEXT,
            name TEXT NOT NULL,
            address TEXT,
            lat REAL,
            lng REAL
        );

        CREATE TABLE kodim_raw (
            kodim_id TEXT PRIMARY KEY,
            korem_id TEXT,
            kodam_id TEXT NOT NULL,
            kodam TEXT,
            korem TEXT,
            name TEXT NOT NULL,
            address TEXT,
            lat REAL,
            lng REAL,
            kecamatan TEXT,
            kabupaten_kota TEXT,
            kecamatan_lat REAL,
            kecamatan_lng REAL
        );
        """
    )

    def to_float(s: str) -> float | None:
        s = (s or "").strip()
        if not s:
            return None
        try:
            return float(s)
        except ValueError:
            return None

    # KODAM
    with (args.src / "kodam.csv").open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        rows = [
            (
                r["kodam_id"].strip(),
                r["name"].strip(),
                r.get("address", "").strip() or None,
                to_float(r.get("lat", "")),
                to_float(r.get("lng", "")),
            )
            for r in reader
        ]
        cur.executemany(
            "INSERT INTO kodam_raw VALUES (?,?,?,?,?)", rows
        )
    print(f"kodam_raw: {len(rows)} rows")

    # KOREM
    with (args.src / "korem.csv").open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        rows = [
            (
                r["korem_id"].strip(),
                r["kodam_id"].strip(),
                r.get("kodam", "").strip() or None,
                r["name"].strip(),
                r.get("address", "").strip() or None,
                to_float(r.get("lat", "")),
                to_float(r.get("lng", "")),
            )
            for r in reader
        ]
        cur.executemany(
            "INSERT INTO korem_raw VALUES (?,?,?,?,?,?,?)", rows
        )
    print(f"korem_raw: {len(rows)} rows")

    # KODIM
    with (args.src / "kodim.csv").open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        rows = [
            (
                r["kodim_id"].strip(),
                r.get("korem_id", "").strip() or None,
                r["kodam_id"].strip(),
                r.get("kodam", "").strip() or None,
                r.get("korem", "").strip() or None,
                r["name"].strip(),
                r.get("address", "").strip() or None,
                to_float(r.get("lat", "")),
                to_float(r.get("lng", "")),
                r.get("kecamatan", "").strip() or None,
                r.get("kabupaten_kota", "").strip() or None,
                to_float(r.get("kecamatan_lat", "")),
                to_float(r.get("kecamatan_lng", "")),
            )
            for r in reader
        ]
        cur.executemany(
            "INSERT INTO kodim_raw VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", rows
        )
    print(f"kodim_raw: {len(rows)} rows")

    con.commit()
    con.close()
    print(f"\nWrote {args.db}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
