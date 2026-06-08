#!/usr/bin/env python3
"""
TINDAKAN 1 (v2): Scrape Satuan Pendidikan DIKMEN via Belajar.id Data Portal API
================================================================================
The referensi.data.kemendikdasmen.go.id site is now a Next.js SPA — the old HTML
scraper silently exhausts the queue without extracting detail data. This rewrite
hits the JSON backend directly:

  Listing:  GET /v2/master-data/satuan-pendidikan/daftar-data-induk/{XX0000}?limit=20&offset=N
  Detail:   GET /v1/master-data/satuan-pendidikan/details/{npsn}

Filter strategy: the API silently ignores all bentukPendidikan-style filter
params, so we filter client-side to `bentukPendidikanGroup` in
{"SMA SEDERAJAT", "SMK SEDERAJAT"} which captures SMA/SMK/MA/MAK/SMALB/SMKLB.

Schema kept backwards-compatible with scripts/05_build_database.py.
New columns added for richer wilayah/identifier capture (yayasan_id,
satuan_pendidikan_id, kode_wilayah/kode_provinsi/kode_kabupaten/kode_kecamatan).

Fields NOT exposed by the JSON API (`operator`, `file_sk_operasional_url`,
`tgl_upload_sk_op`) remain in the schema but are stored as NULL — would need
either an undiscovered endpoint or HTML scraping of a separate page to recover.
These came from the old multi-tab HTML detail page.

Usage:
    python 01_scrape_dikmen.py                          # full scrape
    python 01_scrape_dikmen.py --provinces 350000       # one province
    python 01_scrape_dikmen.py --resume                 # idempotent re-run
    python 01_scrape_dikmen.py --skip-details           # listing only

Author: Ferro / Sekber Dikmen 2025 — rewritten 2026-05 for the SPA site.
"""

from __future__ import annotations

import argparse
import asyncio
import re
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
LISTING_PATH = "/v2/master-data/satuan-pendidikan/daftar-data-induk"
DETAIL_PATH = "/v1/master-data/satuan-pendidikan/details"

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

# 39 provinces discovered for yayasan; same wilayah codes apply.
PROVINCE_CODES: List[str] = [f"{i:02d}0000" for i in range(1, 40)]

# Page size is hard-capped at 20 server-side regardless of requested limit.
PAGE_SIZE = 20

# Client-side filter: only ingest SMA/SMK group satpen (dikmen = pendidikan menengah).
# Other levels (PAUD/SD/SMP) are part of the source dataset but out of scope.
DIKMEN_BENTUK_GROUPS = {"SMA SEDERAJAT", "SMK SEDERAJAT"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS satpen_dikmen (
    npsn TEXT PRIMARY KEY,
    satuan_pendidikan_id TEXT,
    nama TEXT,
    alamat TEXT,
    desa_kelurahan TEXT,
    kecamatan TEXT,
    kab_kota TEXT,
    provinsi TEXT,
    alamat_konsolidasi TEXT,
    status_sekolah TEXT,
    bentuk_pendidikan TEXT,
    bentuk_pendidikan_group TEXT,
    jenjang_pendidikan TEXT,
    jenis_pendidikan TEXT,
    jalur_pendidikan TEXT,
    kementerian_pembina TEXT,
    naungan TEXT,
    npyp TEXT,
    yayasan_id TEXT,
    no_sk_pendirian TEXT,
    tgl_sk_pendirian TEXT,
    no_sk_operasional TEXT,
    tgl_sk_operasional TEXT,
    file_sk_operasional_url TEXT,
    tgl_upload_sk_op TEXT,
    akreditasi TEXT,
    luas_tanah INTEGER,
    akses_internet TEXT,
    sumber_listrik TEXT,
    fax TEXT,
    telepon TEXT,
    email TEXT,
    website TEXT,
    operator TEXT,
    lintang REAL,
    bujur REAL,
    kode_wilayah TEXT,
    kode_provinsi TEXT,
    kode_kabupaten TEXT,
    kode_kecamatan TEXT,
    rt INTEGER,
    rw INTEGER,
    nama_dusun TEXT,
    scraped_at TEXT,
    source_url TEXT,
    detail_fetched_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_dikmen_provinsi ON satpen_dikmen(provinsi);
CREATE INDEX IF NOT EXISTS idx_dikmen_kab ON satpen_dikmen(kab_kota);
CREATE INDEX IF NOT EXISTS idx_dikmen_kec ON satpen_dikmen(kecamatan);
CREATE INDEX IF NOT EXISTS idx_dikmen_bentuk ON satpen_dikmen(bentuk_pendidikan);
CREATE INDEX IF NOT EXISTS idx_dikmen_status ON satpen_dikmen(status_sekolah);
CREATE INDEX IF NOT EXISTS idx_dikmen_npyp ON satpen_dikmen(npyp);
CREATE INDEX IF NOT EXISTS idx_dikmen_kode_wilayah ON satpen_dikmen(kode_wilayah);

CREATE TABLE IF NOT EXISTS dikmen_province_progress (
    kode_provinsi TEXT PRIMARY KEY,
    api_total INTEGER,
    fetched_pages INTEGER,
    matched_dikmen INTEGER,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS dikmen_detail_progress (
    npsn TEXT PRIMARY KEY,
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


def to_date(s: Optional[str]) -> Optional[str]:
    """Convert ISO datetime like '2012-07-01T00:00:00Z' to date 'YYYY-MM-DD'."""
    if not s:
        return None
    m = re.match(r"^(\d{4}-\d{2}-\d{2})", s)
    return m.group(1) if m else s


def consolidate_address(alamat: Optional[str], desa: Optional[str],
                        kec: Optional[str], kab: Optional[str],
                        prov: Optional[str]) -> str:
    return ", ".join(p for p in [alamat, desa, kec, kab, prov] if p)


class ApiClient:
    def __init__(self, concurrency: int, per_request_delay: float) -> None:
        self._sem = asyncio.Semaphore(concurrency)
        self._delay = per_request_delay
        # HTTP/1.1 with explicit connection pool: with HTTP/2 multiplexing on a single
        # connection, concurrent gather() calls stall together if any one request hangs.
        # HTTP/1.1 forces separate connections per concurrent request — no HOL blocking.
        self._http = httpx.AsyncClient(
            http2=False,
            limits=httpx.Limits(max_connections=max(concurrency * 2, 12),
                                max_keepalive_connections=concurrency),
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


LISTING_COLS = (
    "npsn", "satuan_pendidikan_id", "nama",
    "alamat", "desa_kelurahan", "kecamatan", "kab_kota", "provinsi", "alamat_konsolidasi",
    "status_sekolah", "bentuk_pendidikan", "bentuk_pendidikan_group",
    "jenjang_pendidikan", "jenis_pendidikan", "jalur_pendidikan",
    "kementerian_pembina", "kode_wilayah", "scraped_at", "source_url",
)


def upsert_listing(conn: sqlite3.Connection, row: Dict[str, Any]) -> None:
    """Insert/update a basic listing row. Detail fields stay NULL until detail phase."""
    cols = LISTING_COLS
    ph = ",".join(["?"] * len(cols))
    upd = ",".join(f"{c}=excluded.{c}" for c in cols if c != "npsn")
    conn.execute(
        f"INSERT INTO satpen_dikmen({','.join(cols)}) VALUES({ph}) "
        f"ON CONFLICT(npsn) DO UPDATE SET {upd}",
        [row.get(c) for c in cols],
    )


DETAIL_COLS = (
    "npsn",
    "naungan", "npyp", "yayasan_id",
    "no_sk_pendirian", "tgl_sk_pendirian",
    "no_sk_operasional", "tgl_sk_operasional",
    "file_sk_operasional_url", "tgl_upload_sk_op",
    "akreditasi",
    "luas_tanah", "akses_internet", "sumber_listrik",
    "fax", "telepon", "email", "website", "operator",
    "lintang", "bujur",
    "kode_provinsi", "kode_kabupaten", "kode_kecamatan",
    "rt", "rw", "nama_dusun",
    "detail_fetched_at",
)


def update_detail(conn: sqlite3.Connection, row: Dict[str, Any]) -> None:
    """Update an existing satpen row with detail fields (npsn must already exist)."""
    cols = [c for c in DETAIL_COLS if c != "npsn"]
    set_clause = ",".join(f"{c}=?" for c in cols)
    conn.execute(
        f"UPDATE satpen_dikmen SET {set_clause} WHERE npsn=?",
        [row.get(c) for c in cols] + [row["npsn"]],
    )


def _ingest_listing_page(conn: sqlite3.Connection, url: str,
                         data: List[Dict[str, Any]]) -> int:
    """Insert dikmen-bentuk rows from one listing page. Returns matched count."""
    now = utcnow_iso()
    matched = 0
    for item in data:
        if item.get("bentukPendidikanGroup") not in DIKMEN_BENTUK_GROUPS:
            continue
        npsn = item.get("npsn")
        if not npsn:
            continue
        alamat = item.get("alamatJalan")
        desa = item.get("namaDesa")
        kec = item.get("namaKecamatan")
        kab = item.get("namaKabupaten")
        prov = item.get("namaProvinsi")
        upsert_listing(conn, {
            "npsn": npsn,
            "satuan_pendidikan_id": item.get("satuanPendidikanId"),
            "nama": item.get("nama"),
            "alamat": alamat,
            "desa_kelurahan": desa,
            "kecamatan": kec,
            "kab_kota": kab,
            "provinsi": prov,
            "alamat_konsolidasi": consolidate_address(alamat, desa, kec, kab, prov),
            "status_sekolah": item.get("statusSatuanPendidikan"),
            "bentuk_pendidikan": item.get("bentukPendidikan"),
            "bentuk_pendidikan_group": item.get("bentukPendidikanGroup"),
            "jenjang_pendidikan": item.get("jenjangPendidikan"),
            "jenis_pendidikan": item.get("jenisPendidikan"),
            "jalur_pendidikan": item.get("jalurPendidikan"),
            "kementerian_pembina": item.get("pembina"),
            "kode_wilayah": item.get("kodeWilayah"),
            "scraped_at": now,
            "source_url": url,
        })
        matched += 1
    return matched


async def scrape_province_listing(client: ApiClient, conn: sqlite3.Connection,
                                  kode_provinsi: str, resume: bool) -> tuple[int, int]:
    """Pull every satpen in one province (sequential per-province), filter to
    dikmen-bentuk, insert listing rows.

    Within-province pagination is sequential (one page at a time on the shared
    client). Parallelism across multiple provinces is provided by the caller via
    asyncio.gather — this avoids HTTP/2 multiplexing stalls we hit when batching
    pages within a single province.

    Returns (api_total_scanned, matched_dikmen).
    """
    if resume:
        row = conn.execute(
            "SELECT api_total, matched_dikmen FROM dikmen_province_progress WHERE kode_provinsi=?",
            (kode_provinsi,),
        ).fetchone()
        if row and row[0] is not None and row[1] is not None:
            print(f"  [skip listing] {kode_provinsi}: already complete "
                  f"(scanned {row[0]:,}, dikmen {row[1]:,})")
            return row[0], row[1]

    base_url = f"{API_BASE}{LISTING_PATH}/{kode_provinsi}"
    offset = 0
    total: Optional[int] = None
    matched = 0
    pages = 0
    last_logged = 0
    while True:
        url = f"{base_url}?limit={PAGE_SIZE}&offset={offset}"
        payload = await client.get_json(url)
        data = payload.get("data") or []
        meta = payload.get("meta") or {}
        if total is None:
            total = int(meta.get("total", 0))
        if not data:
            break

        matched += _ingest_listing_page(conn, url, data)
        pages += 1

        if pages - last_logged >= 50:
            conn.commit()
            print(f"  {kode_provinsi}: scanned offset {offset:>6}/{total}  "
                  f"matched dikmen so far: {matched:,}")
            last_logged = pages

        offset += len(data)
        if offset >= total:
            break

    conn.execute(
        "INSERT OR REPLACE INTO dikmen_province_progress"
        "(kode_provinsi, api_total, fetched_pages, matched_dikmen, completed_at) "
        "VALUES(?,?,?,?,?)",
        (kode_provinsi, total, pages, matched, utcnow_iso()),
    )
    conn.commit()
    print(f"  {kode_provinsi}: DONE  scanned {total:,}  matched dikmen: {matched:,}")
    return total or 0, matched


async def fetch_one_detail(client: ApiClient, conn: sqlite3.Connection,
                           npsn: str) -> bool:
    """Fetch /details/{npsn} and UPDATE existing satpen row. Return True on success."""
    url = f"{API_BASE}{DETAIL_PATH}/{npsn}"
    payload = await client.get_json(url)
    sp = (payload or {}).get("satuanPendidikan") or {}
    if not sp.get("npsn"):
        return False

    update_detail(conn, {
        "npsn": sp.get("npsn"),
        "naungan": sp.get("namaYayasan"),
        "npyp": sp.get("npyp"),
        "yayasan_id": sp.get("yayasanId"),
        "no_sk_pendirian": sp.get("skPendirianSekolah"),
        "tgl_sk_pendirian": to_date(sp.get("tanggalSkPendirian")),
        "no_sk_operasional": sp.get("skIzinOperasional"),
        "tgl_sk_operasional": to_date(sp.get("tanggalSkIzinOperasional")),
        "file_sk_operasional_url": None,  # not in JSON API
        "tgl_upload_sk_op": None,         # not in JSON API
        "akreditasi": sp.get("akreditasi"),
        "luas_tanah": sp.get("luasTanahMilik"),
        "akses_internet": sp.get("aksesInternet"),
        "sumber_listrik": sp.get("sumberListrik"),
        "fax": sp.get("nomorFax"),
        "telepon": sp.get("nomorTelepon"),
        "email": sp.get("email"),
        "website": sp.get("website"),
        "operator": None,                 # not in JSON API
        "lintang": sp.get("lintang"),
        "bujur": sp.get("bujur"),
        "kode_provinsi": sp.get("kodeProvinsi"),
        "kode_kabupaten": sp.get("kodeKabupaten"),
        "kode_kecamatan": sp.get("kodeKecamatan"),
        "rt": sp.get("rt"),
        "rw": sp.get("rw"),
        "nama_dusun": sp.get("namaDusun"),
        "detail_fetched_at": utcnow_iso(),
    })
    conn.execute(
        "INSERT OR REPLACE INTO dikmen_detail_progress(npsn, completed_at) VALUES(?,?)",
        (npsn, utcnow_iso()),
    )
    return True


async def run_detail_phase(client: ApiClient, conn: sqlite3.Connection,
                           resume: bool) -> None:
    q = "SELECT npsn FROM satpen_dikmen"
    if resume:
        q += " WHERE npsn NOT IN (SELECT npsn FROM dikmen_detail_progress)"
    targets = [r[0] for r in conn.execute(q).fetchall()]
    print(f"[*] Detail phase: {len(targets):,} satpen to fetch (resume={resume})")

    done = [0]
    err = [0]
    lock = asyncio.Lock()

    async def _work(npsn: str) -> None:
        try:
            ok = await fetch_one_detail(client, conn, npsn)
            async with lock:
                done[0] += 1
                if done[0] % 200 == 0:
                    conn.commit()
                    print(f"    detail: {done[0]:,}/{len(targets):,} "
                          f"({done[0]/max(1,len(targets))*100:.1f}%)  errors={err[0]}")
        except Exception as e:
            err[0] += 1
            if err[0] <= 5:
                print(f"  [ERR] detail for {npsn}: {e}")

    await asyncio.gather(*[_work(n) for n in targets])
    conn.commit()
    print(f"[OK] Detail phase complete: {done[0]:,}/{len(targets):,}  errors={err[0]}")


async def amain(args: argparse.Namespace) -> None:
    conn = db_init(Path(args.db))
    client = ApiClient(concurrency=args.concurrency, per_request_delay=args.delay)
    try:
        provinces = [c.strip() for c in args.provinces.split(",")] if args.provinces else PROVINCE_CODES
        print(f"[*] Listing phase: {len(provinces)} provinces, "
              f"concurrency={args.concurrency}, delay={args.delay}s, page_size={PAGE_SIZE}")
        print(f"    filter: bentukPendidikanGroup ∈ {sorted(DIKMEN_BENTUK_GROUPS)}")

        # Parallelize across provinces — each province runs its own sequential
        # page-by-page loop (which we know works); the across-province
        # gather + semaphore gives us throughput without HTTP/2 multiplexing risk.
        province_sem = asyncio.Semaphore(args.province_concurrency)

        async def _run_province(code: str) -> tuple[int, int]:
            async with province_sem:
                return await scrape_province_listing(client, conn, code, args.resume)

        results = await asyncio.gather(*[_run_province(c) for c in provinces])
        grand_scanned = sum(r[0] for r in results)
        grand_matched = sum(r[1] for r in results)
        print(f"\n[*] Listing complete: scanned {grand_scanned:,} total satpen, "
              f"{grand_matched:,} match dikmen filter")
        total_in_db = conn.execute("SELECT COUNT(*) FROM satpen_dikmen").fetchone()[0]
        print(f"    satpen_dikmen rows in DB: {total_in_db:,}")

        if total_in_db == 0:
            sys.exit("FATAL: 0 satpen matched dikmen filter — refusing to mark success")

        if not args.skip_details:
            await run_detail_phase(client, conn, args.resume)

        total = conn.execute("SELECT COUNT(*) FROM satpen_dikmen").fetchone()[0]
        with_detail = conn.execute("SELECT COUNT(*) FROM dikmen_detail_progress").fetchone()[0]
        print(f"\n[DONE] satpen_dikmen: {total:,}  |  with detail: {with_detail:,}")
    finally:
        await client.close()
        conn.close()


def main() -> None:
    p = argparse.ArgumentParser(description="Tindakan 1 (v2): Scrape DIKMEN satpen via Belajar.id JSON API.")
    p.add_argument("--db", default="data/scraped/dikmen.db")
    p.add_argument("--concurrency", type=int, default=8,
                   help="Concurrent HTTP requests on the client (8 is conservative)")
    p.add_argument("--province-concurrency", type=int, default=4,
                   help="How many provinces to scrape in parallel (each runs sequential pagination)")
    p.add_argument("--delay", type=float, default=0.05,
                   help="Per-request sleep in seconds inside the semaphore")
    p.add_argument("--provinces", default="",
                   help="Comma-separated wilayah codes (e.g. 350000); empty=all 39")
    p.add_argument("--resume", action="store_true",
                   help="Skip provinces and NPSNs already fully fetched")
    p.add_argument("--skip-details", action="store_true",
                   help="Listing only; skip per-NPSN /details fetches")
    args = p.parse_args()
    asyncio.run(amain(args))


if __name__ == "__main__":
    main()
