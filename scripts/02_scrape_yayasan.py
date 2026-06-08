#!/usr/bin/env python3
"""
TINDAKAN 2: Scrape Yayasan via Belajar.id Data Portal API
==========================================================
The kemendikdasmen.go.id site is now a Next.js SPA — HTML scraping
no longer works. This rewrite hits the JSON backend directly:

  Listing:  GET /v2/master-data/yayasan/daftar-data-induk/{XX0000}?limit=N&offset=M
  Naungan:  GET /v1/master-data/yayasan-pendidikan/{yayasanId}/satuan-pendidikan?limit=N&offset=M

39 provinces (codes 010000..390000), ~148,740 yayasan total.
Schema is kept compatible with the original scraper so
scripts/05_build_database.py keeps working.

Fields no longer exposed by the API (pimpinan/operator/email/no_pendirian/
tgl_pendirian/no_pengesahan_pn_ln/no_sk_badan_hukum/tgl_sk_pengesahan) are
stored as NULL — they came from the old HTML detail pages and would need
a separate detail endpoint to recover.

Usage:
    python 02_scrape_yayasan.py                          # full scrape
    python 02_scrape_yayasan.py --provinces 010000,020000
    python 02_scrape_yayasan.py --resume                 # idempotent re-run
    python 02_scrape_yayasan.py --skip-naungan           # listing only

Author: Ferro / Sekber Dikmen 2025 — rewritten 2026-05 for the SPA site.
"""

from __future__ import annotations

import argparse
import asyncio
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import httpx
    from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
except ImportError as e:
    sys.exit(f"Missing dependency: {e}. Run: .venv/bin/pip install -r scripts/requirements.txt")

API_BASE = "https://api.data.belajar.id/data-portal-backend"
LISTING_PATH = "/v2/master-data/yayasan/daftar-data-induk"
NAUNGAN_PATH = "/v1/master-data/yayasan-pendidikan"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Safari/605.1.15 "
    "(SekberDikmen2025/research; contact: ferro@pijar.foundation)"
)
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json",
    "Accept-Language": "id,en;q=0.9",
    "Origin": "https://data.kemendikdasmen.go.id",
    "Referer": "https://data.kemendikdasmen.go.id/",
}

# 39 provinces discovered via probe of /v2/.../daftar-data-induk/XX0000
PROVINCE_CODES: List[str] = [f"{i:02d}0000" for i in range(1, 40)]

# Schema kept identical to the original to preserve build_database compatibility.
# `yayasan_id` (UUID from the new API) is added as a nullable column for joins.
SCHEMA = """
CREATE TABLE IF NOT EXISTS yayasan (
    npyp TEXT PRIMARY KEY,
    judul TEXT,
    pimpinan TEXT,
    operator TEXT,
    email TEXT,
    no_pendirian TEXT,
    tgl_pendirian TEXT,
    no_pengesahan_pn_ln TEXT,
    no_sk_badan_hukum TEXT,
    tgl_sk_pengesahan TEXT,
    n_sekolah_naungan INTEGER DEFAULT 0,
    scraped_at TEXT,
    source_url TEXT,
    yayasan_id TEXT,
    jenis_yayasan TEXT,
    parent_yayasan_id TEXT,
    nama_provinsi TEXT,
    nama_kabupaten TEXT,
    nama_kecamatan TEXT,
    nama_desa TEXT,
    alamat_jalan TEXT,
    kode_wilayah TEXT
);
CREATE INDEX IF NOT EXISTS idx_yayasan_kode_wilayah ON yayasan(kode_wilayah);
CREATE INDEX IF NOT EXISTS idx_yayasan_id ON yayasan(yayasan_id);

CREATE TABLE IF NOT EXISTS yayasan_naungan (
    npyp TEXT,
    npsn TEXT,
    nama TEXT,
    jenjang TEXT,
    kecamatan TEXT,
    kabupaten TEXT,
    provinsi TEXT,
    PRIMARY KEY (npyp, npsn),
    FOREIGN KEY (npyp) REFERENCES yayasan(npyp)
);
CREATE INDEX IF NOT EXISTS idx_naungan_npsn ON yayasan_naungan(npsn);
CREATE INDEX IF NOT EXISTS idx_naungan_prov ON yayasan_naungan(provinsi);

-- Tracks per-province listing completion so --resume can skip provinces
-- whose row count already matches the API's reported total.
CREATE TABLE IF NOT EXISTS yayasan_province_progress (
    kode_wilayah TEXT PRIMARY KEY,
    api_total INTEGER,
    inserted INTEGER,
    completed_at TEXT
);

-- Tracks naungan-fetch completion per yayasan so --resume can skip those done.
CREATE TABLE IF NOT EXISTS yayasan_naungan_progress (
    npyp TEXT PRIMARY KEY,
    expected INTEGER,
    fetched INTEGER,
    completed_at TEXT
);
"""


def db_init(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30)
    conn.executescript(SCHEMA)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.commit()
    return conn


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ApiClient:
    def __init__(self, concurrency: int, per_request_delay: float) -> None:
        self._sem = asyncio.Semaphore(concurrency)
        self._delay = per_request_delay
        self._http = httpx.AsyncClient(
            http2=True,
            timeout=httpx.Timeout(30.0, connect=10.0),
            headers=HEADERS,
            follow_redirects=True,
        )

    @retry(
        stop=stop_after_attempt(5),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception_type((httpx.HTTPError, asyncio.TimeoutError)),
        reraise=True,
    )
    async def get_json(self, url: str) -> Dict[str, Any]:
        async with self._sem:
            if self._delay:
                await asyncio.sleep(self._delay)
            r = await self._http.get(url)
            r.raise_for_status()
            return r.json()

    async def close(self) -> None:
        await self._http.aclose()


YAYASAN_INSERT_COLS = (
    "npyp", "judul", "n_sekolah_naungan", "scraped_at", "source_url",
    "yayasan_id", "jenis_yayasan", "parent_yayasan_id",
    "nama_provinsi", "nama_kabupaten", "nama_kecamatan", "nama_desa",
    "alamat_jalan", "kode_wilayah",
)


def upsert_yayasan(conn: sqlite3.Connection, row: Dict[str, Any]) -> None:
    cols = YAYASAN_INSERT_COLS
    ph = ",".join(["?"] * len(cols))
    upd = ",".join(f"{c}=excluded.{c}" for c in cols if c != "npyp")
    conn.execute(
        f"INSERT INTO yayasan({','.join(cols)}) VALUES({ph}) "
        f"ON CONFLICT(npyp) DO UPDATE SET {upd}",
        [row.get(c) for c in cols],
    )


def upsert_naungan(conn: sqlite3.Connection, rows: List[Dict[str, Any]]) -> None:
    conn.executemany(
        "INSERT OR REPLACE INTO yayasan_naungan(npyp,npsn,nama,jenjang,kecamatan,kabupaten,provinsi) "
        "VALUES(?,?,?,?,?,?,?)",
        [
            (r["npyp"], r["npsn"], r["nama"], r["jenjang"],
             r["kecamatan"], r["kabupaten"], r["provinsi"])
            for r in rows
        ],
    )


async def scrape_province(client: ApiClient, conn: sqlite3.Connection,
                          kode_wilayah: str, page_size: int, resume: bool) -> int:
    """Pull every yayasan in one province. Returns the number inserted/updated."""
    # If resume is set and progress table says completed with matching count, skip.
    if resume:
        row = conn.execute(
            "SELECT api_total, inserted FROM yayasan_province_progress WHERE kode_wilayah=?",
            (kode_wilayah,),
        ).fetchone()
        if row and row[0] is not None and row[1] is not None and row[1] >= row[0]:
            print(f"  [skip] {kode_wilayah}: already complete ({row[1]}/{row[0]})")
            return 0

    offset = 0
    total: Optional[int] = None
    inserted_total = 0
    while True:
        url = f"{API_BASE}{LISTING_PATH}/{kode_wilayah}?limit={page_size}&offset={offset}"
        payload = await client.get_json(url)
        data = payload.get("data") or []
        meta = payload.get("meta") or {}
        if total is None:
            total = int(meta.get("total", 0))
        if not data:
            break

        batch: List[Dict[str, Any]] = []
        now = utcnow_iso()
        for item in data:
            npyp = item.get("npyp")
            if not npyp:
                continue
            batch.append({
                "npyp": npyp,
                "judul": item.get("namaYayasan"),
                "n_sekolah_naungan": int(item.get("jumlahSekolahNaungan") or 0),
                "scraped_at": now,
                "source_url": url,
                "yayasan_id": item.get("yayasanId"),
                "jenis_yayasan": item.get("jenisYayasan"),
                "parent_yayasan_id": item.get("parentYayasanId"),
                "nama_provinsi": item.get("namaProvinsi"),
                "nama_kabupaten": item.get("namaKabupaten"),
                "nama_kecamatan": item.get("namaKecamatan"),
                "nama_desa": item.get("namaDesa"),
                "alamat_jalan": item.get("alamatJalan"),
                "kode_wilayah": kode_wilayah,
            })

        for row in batch:
            upsert_yayasan(conn, row)
        conn.commit()
        inserted_total += len(batch)
        print(f"  {kode_wilayah}: offset {offset:>6} → +{len(batch)}  "
              f"(running {inserted_total}/{total})")

        offset += len(data)
        if offset >= total:
            break

    conn.execute(
        "INSERT OR REPLACE INTO yayasan_province_progress(kode_wilayah, api_total, inserted, completed_at) "
        "VALUES(?,?,?,?)",
        (kode_wilayah, total, inserted_total, utcnow_iso()),
    )
    conn.commit()
    return inserted_total


async def scrape_naungan_for_yayasan(client: ApiClient, conn: sqlite3.Connection,
                                     yayasan_row: sqlite3.Row, page_size: int) -> int:
    """Fetch sekolah naungan for one yayasan; inherit yayasan's wilayah strings."""
    yid = yayasan_row["yayasan_id"]
    npyp = yayasan_row["npyp"]
    expected = int(yayasan_row["n_sekolah_naungan"] or 0)
    if not yid or expected <= 0:
        return 0

    offset = 0
    fetched_total = 0
    while True:
        url = f"{API_BASE}{NAUNGAN_PATH}/{yid}/satuan-pendidikan?limit={page_size}&offset={offset}"
        payload = await client.get_json(url)
        data = payload.get("data") or []
        meta = payload.get("meta") or {}
        total = int(meta.get("total", 0))
        if not data:
            break

        rows = []
        for item in data:
            npsn = item.get("npsn")
            if not npsn:
                continue
            rows.append({
                "npyp": npyp,
                "npsn": npsn,
                "nama": item.get("nama"),
                "jenjang": item.get("bentukPendidikan") or item.get("bentukPendidikanGroup"),
                # Inherit yayasan's geo since the school endpoint doesn't expose full hierarchy.
                "provinsi": yayasan_row["nama_provinsi"],
                "kabupaten": yayasan_row["nama_kabupaten"],
                "kecamatan": yayasan_row["nama_kecamatan"],
            })
        upsert_naungan(conn, rows)
        fetched_total += len(rows)
        offset += len(data)
        if offset >= total:
            break

    conn.execute(
        "INSERT OR REPLACE INTO yayasan_naungan_progress(npyp, expected, fetched, completed_at) "
        "VALUES(?,?,?,?)",
        (npyp, expected, fetched_total, utcnow_iso()),
    )
    return fetched_total


async def run_naungan_phase(client: ApiClient, conn: sqlite3.Connection,
                            page_size: int, resume: bool) -> None:
    conn.row_factory = sqlite3.Row
    q = "SELECT * FROM yayasan WHERE n_sekolah_naungan > 0 AND yayasan_id IS NOT NULL"
    if resume:
        q += (" AND npyp NOT IN ("
              "SELECT npyp FROM yayasan_naungan_progress WHERE fetched >= expected)")
    targets = conn.execute(q).fetchall()
    print(f"[*] Naungan phase: {len(targets):,} yayasan to fetch (resume={resume})")

    done = [0]
    err = [0]
    lock = asyncio.Lock()

    async def _work(row: sqlite3.Row) -> None:
        try:
            await scrape_naungan_for_yayasan(client, conn, row, page_size)
            async with lock:
                done[0] += 1
                if done[0] % 200 == 0:
                    conn.commit()
                    print(f"    naungan: {done[0]:,}/{len(targets):,} "
                          f"({done[0]/max(1,len(targets))*100:.1f}%)  errors={err[0]}")
        except Exception as e:
            err[0] += 1
            if err[0] <= 5:
                print(f"  [ERR] naungan for {row['npyp']}: {e}")

    await asyncio.gather(*[_work(r) for r in targets])
    conn.commit()
    print(f"[OK] Naungan phase complete: {done[0]:,}/{len(targets):,}  errors={err[0]}")


async def amain(args: argparse.Namespace) -> None:
    conn = db_init(Path(args.db))
    client = ApiClient(concurrency=args.concurrency, per_request_delay=args.delay)
    try:
        provinces = [c.strip() for c in args.provinces.split(",")] if args.provinces else PROVINCE_CODES
        print(f"[*] Listing phase: {len(provinces)} provinces, "
              f"concurrency={args.concurrency}, delay={args.delay}s, page_size={args.page_size}")
        for code in provinces:
            await scrape_province(client, conn, code, args.page_size, args.resume)

        total_yayasan = conn.execute("SELECT COUNT(*) FROM yayasan").fetchone()[0]
        print(f"\n[*] Listing complete: {total_yayasan:,} yayasan in DB")

        if not args.skip_naungan:
            await run_naungan_phase(client, conn, args.naungan_page_size, args.resume)

        total_naungan = conn.execute("SELECT COUNT(*) FROM yayasan_naungan").fetchone()[0]
        print(f"\n[DONE] yayasan: {total_yayasan:,}  |  sekolah naungan: {total_naungan:,}")
    finally:
        await client.close()
        conn.close()


def main() -> None:
    p = argparse.ArgumentParser(description="Tindakan 2: Scrape yayasan via Belajar.id JSON API.")
    p.add_argument("--db", default="data/scraped/yayasan.db")
    p.add_argument("--concurrency", type=int, default=4,
                   help="Concurrent HTTP requests (4 is conservative; >6 risks throttling)")
    p.add_argument("--delay", type=float, default=0.1,
                   help="Per-request sleep in seconds inside the semaphore")
    p.add_argument("--page-size", type=int, default=500,
                   help="Listing page size (max observed: 500+)")
    p.add_argument("--naungan-page-size", type=int, default=500)
    p.add_argument("--provinces", default="",
                   help="Comma-separated wilayah codes (e.g. 350000,320000); empty=all 39")
    p.add_argument("--resume", action="store_true",
                   help="Skip provinces and yayasan already fully fetched")
    p.add_argument("--skip-naungan", action="store_true",
                   help="Listing only; skip per-yayasan sekolah-naungan fetches")

    # Backwards compatibility with the old --max-pages flag the launcher passes.
    # The new API has no concept of fixed page count; we accept and ignore.
    p.add_argument("--max-pages", type=int, default=0, help=argparse.SUPPRESS)

    args = p.parse_args()
    asyncio.run(amain(args))


if __name__ == "__main__":
    main()
