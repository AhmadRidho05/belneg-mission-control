#!/usr/bin/env python3
"""
TINDAKAN 7: LLM-assisted column naming
======================================
Replaces generic `col_1, col_2, ...` headers with semantic snake_case names
for all 248 statistical tables extracted from the BPS PDFs.

The PDF column headers are multi-line / multi-row (group headers like "Negeri /
Public" spanning sub-metrics like "Satuan Pendidikan", "Peserta Didik Baru",
"Lulusan") — too fragile to parse reliably with regex. This script feeds the
raw `header_hints` blob + `title` + `n_columns` to Claude Sonnet 4.6 and asks
for clean column names, one per data column. Results are written back into
each kind's manifest.json as a `column_names` list, alongside the existing
`header_hints` (which we keep for provenance + as Claude context on re-runs).

Idempotent: skips tables that already have `column_names`. Use `--force` to
re-fetch all. Cost optimization: prompt caching on the system block (the same
~2k-token instruction set is sent for every table → ~90% cheaper after the
first call).

Usage:
    python 07_generate_column_names.py                    # all tables, skip done
    python 07_generate_column_names.py --kind sma         # one kind only
    python 07_generate_column_names.py --limit 5          # smoke test
    python 07_generate_column_names.py --force            # re-fetch all

Author: Ferro / Sekber Dikmen 2025 — v3 LLM-naming pass, 2026-05.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from anthropic import AsyncAnthropic
except ImportError:
    sys.exit("Missing dependency: anthropic. Run: .venv/bin/pip install -r scripts/requirements.txt")


MODEL = "claude-sonnet-4-6"

# System prompt is large + stable → cache_control on it gives ~90% cost
# savings on the 247 calls that follow the first.
SYSTEM_PROMPT = """You are an expert at interpreting Indonesian education statistical tables published by Kemendikdasmen (BPS-style) and converting their multi-row PDF column headers into clean, programmatic column names.

CONTEXT
-------
Each table represents data for 38 Indonesian provinces + 1 'Luar Negeri' row. The CSV stores `province_kd` and `province_name` as the first 2 columns; everything after is `col_1, col_2, ..., col_N` where N is the number of data columns you must name.

The raw header text was extracted by `pdftotext -layout`, so it appears flattened. Group headers typically span multiple sub-columns. Common groupings include:

- "Negeri / Public" vs "Swasta / Private" vs "Negeri+Swasta / Public+Private"
- "Laki-laki / Male" vs "Perempuan / Female" vs "Laki+Perempuan / Subjml. / Sub-tot."
- "Sertifikasi / Certification" vs "Belum Sertifikasi / Not-yet Certification"
- "Pagi / Morning" vs "Siang / Afternoon" vs "Kombinasi / Combination" vs "Jumlah / Total"
- Age buckets like "<15", "15", "16", "17", ">17"
- Grade levels like "Kelas 10", "Kelas 11", "Kelas 12"
- Education levels like "SD", "SMP", "SMA", "SMK"

Common sub-metrics (within a group) include:

- "Satuan Pendidikan / Schools" (count of schools)
- "Peserta Didik Baru / New Students"
- "Peserta Didik / Students" (total enrolled)
- "Peserta Didik Mengulang / Repeaters"
- "Putus Sekolah / Drop-outs"
- "Lulusan / Graduates"
- "Jml. / No. of" (count)
- "%" (percentage)
- "Jumlah / Total" (grand total / subtotal)
- "Subjml. / Sub-tot." (subtotal within a group)

NAMING RULES
------------
1. Output exactly N names (one per data column, in order — `col_1` first).
2. Use snake_case ASCII identifiers: lowercase, words separated by underscores, no spaces or special chars.
3. Prefix with the group when applicable: `negeri_satuan_pendidikan`, `swasta_peserta_didik_baru`, `laki_laki_negeri`.
4. Be concise but specific. Prefer `negeri_peserta_didik` over `negeri_jumlah_peserta_didik_yang_terdaftar`.
5. If a column is a percentage within a group, suffix with `_persen`: `negeri_persen` or `swasta_satuan_pendidikan_persen`.
6. The final "Total/Jumlah" column at the end of a row usually combines all groups — name it `total` or `jumlah_total` if there are multiple total columns.
7. If a "Subjml. / Sub-tot." column appears, name it like `<group>_subtotal`, e.g. `laki_laki_subtotal`.
8. If a column is age-based use `usia_15`, `usia_kurang_15`, `usia_lebih_17`. For grades use `kelas_10`, `kelas_11`, `kelas_12`.
9. When the header is too ambiguous to map confidently, fall back to a clean generic like `col_3_unknown` (still snake_case, but signals uncertainty).
10. Names must be UNIQUE within the table — if two columns would produce the same name, suffix with `_2`, `_3`, etc.

EXAMPLES
--------

Example A — Status × School-metric table (12 data columns):
title: "GAMBARAN UMUM KEADAAN SMA MENURUT STATUS"
n_columns: 12
header_hints:
  - "Provinsi                                                      Negeri / Public"
  - "No.  KD                Satuan Pendidikan Peserta Didik Baru Peserta Didik Mengulang Putus Sekolah Lulusan"
  - "Province"
  - "Schools     New Students     Students     Repeaters    Drop-outs     Graduates"
  - "Provinsi                                                     Swasta / Private"
  - "Provinsi                                            Negeri+Swasta / Public+Private"

CORRECT output:
{"column_names":[
  "negeri_satuan_pendidikan","negeri_peserta_didik_baru","negeri_peserta_didik","negeri_peserta_didik_mengulang","negeri_putus_sekolah","negeri_lulusan",
  "swasta_satuan_pendidikan","swasta_peserta_didik_baru","swasta_peserta_didik","swasta_peserta_didik_mengulang","swasta_putus_sekolah","swasta_lulusan"
]}

Wait, that's 12 names — but a "Negeri+Swasta" group is also present per the headers. Reread n_columns carefully. If n_columns=18, add 6 more `total_*` names. If n_columns=12, stop at swasta. NEVER invent columns the table doesn't have.

Example B — Sex × Status table (9 data columns):
title: "JUMLAH MENGULANG MENURUT JENIS KELAMIN DAN STATUS"
n_columns: 9
header_hints:
  - "Provinsi             Laki-laki / Male         Perempuan / Female     Laki2+Perempuan / Male+Female"
  - "No.  KD                  Negeri Swasta Subjml.    Negeri Swasta Subjml.    Negeri Swasta Jumlah"
  - "Public Private Sub-tot.   Public Private Sub-tot.    Public Private Total"

CORRECT output:
{"column_names":[
  "laki_laki_negeri","laki_laki_swasta","laki_laki_subtotal",
  "perempuan_negeri","perempuan_swasta","perempuan_subtotal",
  "negeri","swasta","total"
]}

Example C — Time-of-day × count/pct (12 data columns):
title: "JUMLAH SATUAN PENDIDIKAN MENURUT WAKTU PENYELENGGARAAN DAN STATUS"
n_columns: 12
header_hints:
  - "Provinsi                                          Negeri / Public"
  - "No.        KD              Pagi / Morning  Siang / Afternoon  Kombinasi / Combination  Jumlah"
  - "Jml. / No. of  %      Jml. / No. of  %    Jml. / No. of  %    Total"

CORRECT output (assuming pattern repeats for Swasta but n_columns=12 → only Negeri side fits):
{"column_names":[
  "pagi_jumlah","pagi_persen","siang_jumlah","siang_persen","kombinasi_jumlah","kombinasi_persen","jumlah",
  "swasta_pagi_jumlah","swasta_pagi_persen","swasta_siang_jumlah","swasta_siang_persen","swasta_total"
]}

(If only Negeri fits in 7 cols and then negeri_total is col 7, the remaining 5 must be inferred from the next group present in header_hints — Swasta if shown. The above is illustrative; YOUR job is to match the n_columns count exactly.)

OUTPUT FORMAT
-------------
Return ONLY a JSON object: {"column_names": ["name_1", "name_2", ...]} with exactly N strings. No prose. No code fences."""


# JSON schema for structured output. Anthropic's structured outputs do not
# support array length constraints, so we validate length post-hoc in Python.
OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "column_names": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["column_names"],
    "additionalProperties": False,
}


def build_user_message(code: str, title: str, n_columns: int,
                       header_hints: List[str]) -> str:
    hints_block = "\n".join(f"  - {h!r}" for h in header_hints) if header_hints else "  (no header hints captured)"
    return (
        f"Table code: {code}\n"
        f"Table title: {title}\n"
        f"Number of data columns to name (n_columns): {n_columns}\n"
        f"Raw header_hints from PDF:\n{hints_block}\n\n"
        f"Generate exactly {n_columns} snake_case column names."
    )


def validate_response(names: List[str], expected_n: int) -> Optional[str]:
    """Returns an error string if invalid, None if OK."""
    if not isinstance(names, list):
        return f"not a list (got {type(names).__name__})"
    if len(names) != expected_n:
        return f"length mismatch: got {len(names)} names, expected {expected_n}"
    for i, n in enumerate(names):
        if not isinstance(n, str) or not n:
            return f"col {i+1}: empty or non-string name"
        # snake_case lowercase ASCII; allow digit-leading (e.g. year buckets "2023_2024_negeri")
        if not re.match(r"^[a-z0-9][a-z0-9_]*$", n):
            return f"col {i+1}: not snake_case lowercase: {n!r}"
    if len(set(names)) != len(names):
        # Find dupes for the error message
        seen = set()
        dupes = []
        for n in names:
            if n in seen:
                dupes.append(n)
            seen.add(n)
        return f"duplicate names: {dupes}"
    return None


def atomic_write_json(path: Path, data: Any) -> None:
    """Write JSON atomically (tmp file + rename) to avoid corruption on crash."""
    tmp = tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", delete=False,
        dir=path.parent, prefix=f".{path.name}.", suffix=".tmp",
    )
    try:
        json.dump(data, tmp, indent=2, ensure_ascii=False)
        tmp.flush()
        os.fsync(tmp.fileno())
        tmp.close()
        os.replace(tmp.name, path)
    except Exception:
        os.unlink(tmp.name)
        raise


async def name_one_table(client: AsyncAnthropic, entry: Dict[str, Any],
                         sem: asyncio.Semaphore) -> tuple[Dict[str, Any], Optional[str]]:
    """Call the API for one table. Returns (entry-with-column_names, error-or-None)."""
    async with sem:
        code = entry["code"]
        title = entry.get("title", "")
        n_cols = int(entry.get("n_columns", 0))
        hints = entry.get("header_hints", []) or []

        try:
            resp = await client.messages.create(
                model=MODEL,
                max_tokens=4096,
                system=[{
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }],
                messages=[{
                    "role": "user",
                    "content": build_user_message(code, title, n_cols, hints),
                }],
                output_config={
                    "format": {
                        "type": "json_schema",
                        "schema": OUTPUT_SCHEMA,
                    },
                },
            )
        except Exception as e:
            return entry, f"API error: {e}"

        # Extract text content; structured output returns JSON in the text block
        text_blocks = [b.text for b in resp.content if getattr(b, "type", "") == "text"]
        raw = "\n".join(text_blocks).strip()
        try:
            parsed = json.loads(raw)
            names = parsed.get("column_names")
        except json.JSONDecodeError as e:
            return entry, f"invalid JSON in response: {e}; raw={raw[:200]!r}"

        err = validate_response(names, n_cols)
        if err:
            return entry, err

        # Stamp into entry
        entry = dict(entry)
        entry["column_names"] = names
        entry["column_names_model"] = MODEL
        # Track cache usage from this call for observability
        usage = resp.usage
        cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
        cache_write = getattr(usage, "cache_creation_input_tokens", 0) or 0
        return entry, None


async def warm_cache(client: AsyncAnthropic, sample_entry: Dict[str, Any]) -> None:
    """One serial call to write the cache before fanning out — avoids the parallel
    first-wave all paying the cache-write premium."""
    print("[*] Warming cache (1 serial call) ...")
    sem = asyncio.Semaphore(1)
    _, err = await name_one_table(client, sample_entry, sem)
    if err:
        print(f"  [warn] warmup call failed: {err}")
    else:
        print(f"  [ok] cache warmed")


async def process_manifest(manifest_path: Path, kind: str,
                           concurrency: int, force: bool, limit: Optional[int]) -> None:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    tables = manifest["tables"]

    # Filter: only provincial tables (national summaries have a different schema)
    candidates = [
        t for t in tables
        if t.get("kind") == "provincial" and int(t.get("n_columns", 0)) > 0
        and (force or not t.get("column_names"))
    ]
    if limit:
        candidates = candidates[:limit]

    skipped = len([t for t in tables if t.get("kind") == "provincial" and int(t.get("n_columns", 0)) > 0]) - len(candidates)
    print(f"\n=== {kind} ===")
    print(f"  total provincial tables: {sum(1 for t in tables if t.get('kind')=='provincial' and int(t.get('n_columns',0))>0)}")
    print(f"  to process: {len(candidates)}  (skipped {skipped} already-named)")
    if not candidates:
        print("  nothing to do.")
        return

    client = AsyncAnthropic()  # picks up ANTHROPIC_API_KEY

    try:
        # Warm the cache so the parallel first-wave benefits from cached system prompt
        if not force and len(candidates) > 1:
            await warm_cache(client, candidates[0])
            # the warmup call already produced a result; re-fetch with the parallel pass
            # is fine since it's idempotent — but to save 1 API call, mark it done first.
            # Simpler: just include it in the pass below.

        sem = asyncio.Semaphore(concurrency)
        done = 0
        errors: List[tuple[str, str]] = []

        # Index tables by code so we can update in place after gather
        by_code = {t["code"]: t for t in tables}

        async def _one(entry: Dict[str, Any]) -> tuple[str, Optional[str]]:
            updated, err = await name_one_table(client, entry, sem)
            return updated, err

        # Run with periodic checkpointing: process in chunks of N and write manifest after each
        CHUNK = 25
        for i in range(0, len(candidates), CHUNK):
            chunk = candidates[i:i+CHUNK]
            results = await asyncio.gather(*[_one(c) for c in chunk])
            for updated, err in results:
                code = updated["code"]
                if err:
                    errors.append((code, err))
                else:
                    by_code[code] = updated
                done += 1

            # Persist after each chunk
            manifest["tables"] = [by_code[t["code"]] if t["code"] in by_code else t for t in tables]
            atomic_write_json(manifest_path, manifest)
            ok = done - len(errors)
            print(f"  progress: {done}/{len(candidates)}  ({ok} ok, {len(errors)} err)")

        if errors:
            print(f"\n  [!] {len(errors)} errors:")
            for code, e in errors[:10]:
                print(f"    {code}: {e[:120]}")
            if len(errors) > 10:
                print(f"    ... and {len(errors)-10} more")
        else:
            print(f"  [OK] All {done} tables named successfully.")
    finally:
        await client.close()


async def amain(args: argparse.Namespace) -> None:
    kinds = [args.kind] if args.kind else ["sma", "smk"]
    for kind in kinds:
        manifest_path = Path(f"data/extracted/{kind}/manifest.json")
        if not manifest_path.exists():
            print(f"[!] No manifest at {manifest_path}, skipping")
            continue
        await process_manifest(manifest_path, kind, args.concurrency, args.force, args.limit)


def main() -> None:
    p = argparse.ArgumentParser(description="LLM-assisted column naming for extracted PDF tables.")
    p.add_argument("--kind", choices=["sma", "smk"], default=None,
                   help="Only process one kind (default: both)")
    p.add_argument("--concurrency", type=int, default=8,
                   help="Parallel API calls (default 8; Sonnet RPM is generous)")
    p.add_argument("--limit", type=int, default=0,
                   help="Process at most N tables per kind (0 = all). Useful for smoke testing.")
    p.add_argument("--force", action="store_true",
                   help="Re-fetch even tables that already have column_names")
    args = p.parse_args()
    args.limit = args.limit if args.limit > 0 else None
    asyncio.run(amain(args))


if __name__ == "__main__":
    main()
