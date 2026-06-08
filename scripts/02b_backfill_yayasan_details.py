#!/usr/bin/env python3
"""
TINDAKAN 2 (backfill): Populate yayasan detail fields missing from the listing API.

The v2 listing endpoint (daftar-data-induk) covers basic yayasan fields, but the
7 detail fields below come from a separate per-yayasan endpoint:

    GET /v1/master-data/yayasan-pendidikan/{yayasanId}

This script iterates every yayasan row that has a `yayasan_id` (UUID) and an
unpopulated detail set, fetches the detail endpoint, and UPDATEs the row in
place. Idempotent and resumable: rows that already have `pimpinan` set are
skipped unless `--force` is passed.

Field mapping:
    namaPimpinanYayasan     -> pimpinan
    noPendirianYayasan      -> no_pendirian
    tanggalPendirianYayasan -> tgl_pendirian      (ISO -> YYYY-MM-DD)
    nomorPengesahanPnLn     -> no_pengesahan_pn_ln
    nomorSkBn               -> no_sk_badan_hukum
    tanggalSkBn             -> tgl_sk_pengesahan  (ISO -> YYYY-MM-DD)
    email                   -> email              (overwrite — listing didn't have it)

The `operator` field is NOT in the API response anywhere we've found; remains NULL.

Usage:
    python 02b_backfill_yayasan_details.py                  # backfill all empty
    python 02b_backfill_yayasan_details.py --force          # re-fetch all rows
    python 02b_backfill_yayasan_details.py --limit 100      # smoke test

Author: Ferro / Sekber Dikmen 2025 — v2 backfill, 2026-05.
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
DETAIL_PATH = "/v1/master-data/yayasan-pendidikan"

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


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def to_date(s: Optional[str]) -> Optional[str]:
    """ISO datetime like '2014-02-25T00:00:00Z' -> 'YYYY-MM-DD'."""
    if not s:
        return None
    m = re.match(r"^(\d{4}-\d{2}-\d{2})", s)
    return m.group(1) if m else s


class ApiClient:
    def __init__(self, concurrency: int, per_request_delay: float) -> None:
        self._sem = asyncio.Semaphore(concurrency)
        self._delay = per_request_delay
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


def select_targets(conn: sqlite3.Connection, force: bool, limit: Optional[int]) -> List[tuple]:
    q = "SELECT yayasan_id, npyp FROM yayasan WHERE yayasan_id IS NOT NULL AND yayasan_id != ''"
    if not force:
        q += " AND (pimpinan IS NULL OR pimpinan = '')"
    if limit:
        q += f" LIMIT {int(limit)}"
    return conn.execute(q).fetchall()


async def fetch_and_update(client: ApiClient, conn: sqlite3.Connection,
                           yayasan_id: str, npyp: str) -> bool:
    url = f"{API_BASE}{DETAIL_PATH}/{yayasan_id}"
    payload = await client.get_json(url)
    yp = (payload or {}).get("yayasanPendidikan") or {}
    if not yp.get("yayasanId"):
        return False

    conn.execute(
        "UPDATE yayasan SET "
        "pimpinan=?, no_pendirian=?, tgl_pendirian=?, "
        "no_pengesahan_pn_ln=?, no_sk_badan_hukum=?, tgl_sk_pengesahan=?, "
        "email=COALESCE(NULLIF(?,''), email) "
        "WHERE npyp=?",
        (
            yp.get("namaPimpinanYayasan"),
            yp.get("noPendirianYayasan"),
            to_date(yp.get("tanggalPendirianYayasan")),
            yp.get("nomorPengesahanPnLn"),
            yp.get("nomorSkBn"),
            to_date(yp.get("tanggalSkBn")),
            yp.get("email"),
            npyp,
        ),
    )
    return True


async def amain(args: argparse.Namespace) -> None:
    conn = sqlite3.connect(args.db, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    targets = select_targets(conn, args.force, args.limit)
    print(f"[*] Backfill: {len(targets):,} yayasan to fetch "
          f"(force={args.force}, concurrency={args.concurrency}, delay={args.delay}s)")
    if not targets:
        print("[OK] Nothing to do — all yayasan already have detail fields.")
        return

    client = ApiClient(concurrency=args.concurrency, per_request_delay=args.delay)
    done = [0]
    err = [0]
    lock = asyncio.Lock()

    async def _work(yid: str, npyp: str) -> None:
        try:
            await fetch_and_update(client, conn, yid, npyp)
            async with lock:
                done[0] += 1
                if done[0] % 500 == 0:
                    conn.commit()
                    pct = done[0] / max(1, len(targets)) * 100
                    print(f"    {done[0]:>7,}/{len(targets):,} ({pct:.1f}%)  errors={err[0]}")
        except Exception as e:
            err[0] += 1
            if err[0] <= 5:
                print(f"  [ERR] backfill {yid} ({npyp}): {e}")

    try:
        await asyncio.gather(*[_work(yid, npyp) for yid, npyp in targets])
        conn.commit()
    finally:
        await client.close()
        conn.close()
    print(f"\n[DONE] Backfilled {done[0]:,} yayasan ({err[0]} errors).")


def main() -> None:
    p = argparse.ArgumentParser(description="Backfill yayasan detail fields from the /v1 detail endpoint.")
    p.add_argument("--db", default="data/scraped/yayasan.db")
    p.add_argument("--concurrency", type=int, default=8)
    p.add_argument("--delay", type=float, default=0.05)
    p.add_argument("--limit", type=int, default=0, help="0 = no limit (smoke test with small number)")
    p.add_argument("--force", action="store_true", help="Re-fetch even rows that already have pimpinan set")
    args = p.parse_args()
    args.limit = args.limit if args.limit > 0 else None
    asyncio.run(amain(args))


if __name__ == "__main__":
    main()
