#!/usr/bin/env python3
"""
TINDAKAN 3 & 4: PDF Table Extractor
====================================
Mengekstrak SEMUA tabel (1.1.1 hingga 2.13.x) dari:
- statistik-sekolah-menengah-atas-sma-tahun-2025-2026-2026-sma-ma-sederajat.pdf
- statistik-sekolah-menengah-kejuruan-smk-tahun-2025-2026-2026-smk-mak-sederajat.pdf

Output:
- 1 CSV per tabel di data/extracted/{sma|smk}/
- 1 manifest.json yang berisi metadata semua tabel
- Skip kolom "KD" dan row "Indonesia" sesuai instruksi

Strategy:
- Gunakan `pdftotext -layout` (poppler) untuk mendapatkan layout-preserved text
- Parse provincial rows berdasarkan pattern: <No 1-39> <KD 2digit> <Province> <values...>
- Detect table boundaries via "TABEL X.Y.Z" / "TABEL LANJUTAN" markers
- Multi-column tables (Negeri vs Swasta, Laki vs Perempuan) digabung otomatis lewat KD-as-join-key

Usage:
    python 03_04_extract_pdf_tables.py --pdf <path> --kind <sma|smk> --out data/extracted/<kind>

Author: Ferro / Sekber Dikmen 2025
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Reference: 38 provinces + 1 "Luar Negeri" (39 rows max per provincial table)
# KD codes are 2-digit BPS province codes. We use them as the join key.
# ---------------------------------------------------------------------------
PROVINCE_KD_MAP: Dict[str, str] = {
    "11": "Aceh",
    "12": "Sumatera Utara",
    "13": "Sumatera Barat",
    "14": "Riau",
    "15": "Jambi",
    "16": "Sumatera Selatan",
    "17": "Bengkulu",
    "18": "Lampung",
    "19": "Kep. Bangka Belitung",
    "21": "Kepulauan Riau",
    "31": "DKI Jakarta",
    "32": "Jawa Barat",
    "33": "Jawa Tengah",
    "34": "DI Yogyakarta",
    "35": "Jawa Timur",
    "36": "Banten",
    "51": "Bali",
    "52": "Nusa Tenggara Barat",
    "53": "Nusa Tenggara Timur",
    "61": "Kalimantan Barat",
    "62": "Kalimantan Tengah",
    "63": "Kalimantan Selatan",
    "64": "Kalimantan Timur",
    "65": "Kalimantan Utara",
    "71": "Sulawesi Utara",
    "72": "Sulawesi Tengah",
    "73": "Sulawesi Selatan",
    "74": "Sulawesi Tenggara",
    "75": "Gorontalo",
    "76": "Sulawesi Barat",
    "81": "Maluku",
    "82": "Maluku Utara",
    "91": "Papua",
    "92": "Papua Barat",
    "93": "Papua Selatan",
    "94": "Papua Tengah",
    "95": "Papua Pegunungan",
    "96": "Papua Barat Daya",
    "-":  "Luar Negeri",  # KD "-" for overseas Indonesian schools
}

VALID_KDS = set(PROVINCE_KD_MAP.keys())

# Row pattern: leading whitespace, sequence number (1-39), KD (2 digits or "-"),
# then province name (which may contain spaces/dots), then numeric values.
# We capture: row_num, kd, rest_of_line
ROW_RE = re.compile(
    r"^\s*(\d{1,2})\s+([0-9]{2}|-)\s+(.+)$"
)

# Table header: e.g. "TABEL 1.1.2 GAMBARAN UMUM ..."
TABLE_HEADER_RE = re.compile(
    r"^\s*TABEL\s+(\d+\.\d+\.\d+)\s+(.+)$",
    re.IGNORECASE,
)
TABLE_CONT_RE = re.compile(
    r"^\s*TABEL\s+LANJUTAN\s*/?\s*CONTINUED\s+TABLE\s*:?\s*(\d+\.\d+\.\d+)",
    re.IGNORECASE,
)

# A value token is either a number like "1.397.934" or "1.234,56" or "-" (zero placeholder)
# We split by whitespace, then validate.
VALUE_TOKEN_RE = re.compile(r"^([\d.,]+|-)$")


@dataclass
class TableBlock:
    """A logical table identified by code (e.g. '1.1.2')."""

    code: str
    title: str = ""
    # Each segment is one continuation block on one page.
    # We collect raw lines, then merge by KD as the join key.
    segments: List[List[str]] = field(default_factory=list)
    # Optional column-header hints (free-text, multiple lines collected)
    header_hints: List[str] = field(default_factory=list)


def run_pdftotext(pdf_path: Path) -> str:
    """Extract layout-preserved text from PDF using poppler's pdftotext."""
    result = subprocess.run(
        ["pdftotext", "-layout", str(pdf_path), "-"],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return result.stdout


def split_tables(text: str) -> Dict[str, TableBlock]:
    """Walk the document and group lines by table code."""
    tables: Dict[str, TableBlock] = {}
    current: Optional[TableBlock] = None
    current_buf: List[str] = []
    in_toc = True  # First section is the table-of-contents; skip until we see real tables

    for raw_line in text.splitlines():
        line = raw_line.rstrip()

        # Detect TOC end: a real table header appears multiple times; we want
        # the first occurrence that is followed by actual data rows (not page
        # numbers in TOC). Heuristic: TOC entries end with a page number; real
        # table headers don't have a numeric column at the very end.
        m_header = TABLE_HEADER_RE.match(line)
        m_cont = TABLE_CONT_RE.match(line)

        if m_header:
            code = m_header.group(1)
            title_fragment = m_header.group(2).strip()

            # TOC heuristic: TOC lines end with a page number (1-3 digits) and
            # the title contains no "MENURUT" data we can parse from.
            stripped_end = line.rstrip()
            ends_with_pagenum = bool(re.search(r"\s+\d{1,3}\s*$", stripped_end))

            # If we're in TOC, just track but don't store
            if in_toc and ends_with_pagenum and "MENURUT" not in title_fragment.upper() and "GAMBARAN" not in title_fragment.upper():
                continue

            # Real header. Flush previous, start new.
            if current is not None and current_buf:
                current.segments.append(current_buf)
                current_buf = []

            in_toc = False
            if code not in tables:
                tables[code] = TableBlock(code=code, title=title_fragment)
            else:
                # Append title fragment if longer
                if len(title_fragment) > len(tables[code].title):
                    tables[code].title = title_fragment
            current = tables[code]
            current_buf = []
            continue

        if m_cont and not in_toc:
            code = m_cont.group(1)
            if current is not None and current_buf:
                current.segments.append(current_buf)
                current_buf = []
            if code not in tables:
                tables[code] = TableBlock(code=code, title="(continuation)")
            current = tables[code]
            current_buf = []
            continue

        if current is not None and not in_toc:
            current_buf.append(line)

    if current is not None and current_buf:
        current.segments.append(current_buf)

    return tables


def parse_value(token: str) -> Optional[float | int]:
    """
    Parse Indonesian-formatted number.
    - '.' = thousands separator
    - ',' = decimal point
    - '-' = zero / null (treated as 0)
    """
    if token == "-" or token == "":
        return 0
    # Remove thousands separators (dots not followed by 2 digits at end)
    # Indonesian: "1.397.934" -> 1397934 ; "74,98" -> 74.98 ; "1.234,56" -> 1234.56
    if "," in token:
        # Decimal number
        whole, _, frac = token.partition(",")
        whole = whole.replace(".", "")
        try:
            return float(f"{whole}.{frac}")
        except ValueError:
            return None
    # Integer with thousands sep
    cleaned = token.replace(".", "")
    try:
        return int(cleaned)
    except ValueError:
        return None


def parse_row_line(line: str) -> Optional[Tuple[int, str, str, List[str]]]:
    """
    Try to parse a provincial row line.
    Returns (row_num, kd, province_name, value_tokens) or None.
    """
    m = ROW_RE.match(line)
    if not m:
        return None

    row_num = int(m.group(1))
    kd = m.group(2)
    rest = m.group(3)

    if row_num < 1 or row_num > 39:
        return None
    if kd not in VALID_KDS:
        return None

    # Tokenize rest. The province name is a known string from PROVINCE_KD_MAP;
    # use it to split province name from value tokens reliably.
    expected_name = PROVINCE_KD_MAP[kd]
    if rest.startswith(expected_name):
        remainder = rest[len(expected_name):].strip()
        province = expected_name
    else:
        # Fallback: greedy match — province name is the longest prefix that
        # contains no pure-numeric tokens.
        tokens = rest.split()
        prov_tokens: List[str] = []
        i = 0
        while i < len(tokens) and not VALUE_TOKEN_RE.match(tokens[i]):
            prov_tokens.append(tokens[i])
            i += 1
        if not prov_tokens:
            return None
        province = " ".join(prov_tokens)
        remainder = " ".join(tokens[i:])

    value_tokens = [t for t in remainder.split() if VALUE_TOKEN_RE.match(t)]
    return row_num, kd, province, value_tokens


def extract_table_rows(table: TableBlock) -> Tuple[List[str], List[List[object]]]:
    """
    For one TableBlock, merge all segments into one row-per-province record.
    Returns (header_names, data_rows).

    Strategy:
    - For each segment (continuation block), parse provincial rows.
    - Concatenate the value lists per KD across all segments.
    - Header column names are generated as col_1, col_2, ... since
      the PDF column headers are visually multi-line and hard to parse
      reliably; we keep the FIRST raw header lines per segment as
      `header_hints` for human reference in the manifest.
    """
    # KD -> list of value tokens accumulated across segments
    accumulator: Dict[str, List[str]] = {}
    province_name_by_kd: Dict[str, str] = {}
    order_by_kd: Dict[str, int] = {}

    for seg in table.segments:
        # Collect header hints from leading non-data lines of each segment
        for line in seg[:15]:
            stripped = line.strip()
            if not stripped:
                continue
            if parse_row_line(line) is not None:
                break
            # Skip very long horizontal rules / page numbers
            if re.match(r"^[-_=\s]+$", stripped):
                continue
            if re.match(r"^\(\d+\)\s+", stripped):
                continue  # column numbers row like (1) (2) (3)
            if len(stripped) > 3:
                table.header_hints.append(stripped)

        for line in seg:
            # Skip Indonesia accumulation row
            if re.match(r"^\s*Indonesia\b", line, re.IGNORECASE):
                continue
            # Skip "Jumlah" total rows
            if re.match(r"^\s*Jumlah\b", line, re.IGNORECASE):
                continue

            parsed = parse_row_line(line)
            if parsed is None:
                continue
            row_num, kd, prov, values = parsed
            if kd not in accumulator:
                accumulator[kd] = []
                province_name_by_kd[kd] = prov
                order_by_kd[kd] = row_num
            accumulator[kd].extend(values)

    if not accumulator:
        return [], []

    max_cols = max(len(v) for v in accumulator.values())
    header = ["province_kd", "province_name"] + [f"col_{i+1}" for i in range(max_cols)]

    # Sort by original row number to preserve province order
    sorted_kds = sorted(accumulator.keys(), key=lambda k: order_by_kd.get(k, 999))

    rows: List[List[object]] = []
    for kd in sorted_kds:
        vals = accumulator[kd]
        # Pad to max_cols with None
        padded = vals + [""] * (max_cols - len(vals))
        parsed_vals = [parse_value(v) if v else None for v in padded]
        rows.append([kd, province_name_by_kd[kd]] + parsed_vals)

    return header, rows


def extract_national_summary_1_1_1(text: str, kind: str) -> Optional[Tuple[List[str], List[List[object]]]]:
    """
    Special handling for Table 1.1.1 (national overview by status).
    This table is structured by VARIABLE (not province):
        Variable | Negeri Jml | Negeri % | Swasta Jml | Swasta % | Jumlah Total
    """
    # Find the section between "TABEL 1.1.1" and the next "TABEL 1.1.2"
    start_m = re.search(r"TABEL\s+1\.1\.1\b", text)
    end_m = re.search(r"TABEL\s+1\.1\.2\b", text[start_m.end():] if start_m else text)
    if not start_m:
        return None
    end_pos = start_m.end() + (end_m.start() if end_m else len(text) - start_m.end())
    section = text[start_m.start():end_pos]

    header = ["no", "variable", "negeri_jumlah", "negeri_persen", "swasta_jumlah", "swasta_persen", "total"]
    rows: List[List[object]] = []

    # Pattern: "N.   Variable description    val1  val2  val3  val4  val5"
    # Numbers can include thousand separators with dots.
    row_re = re.compile(
        r"^\s*(\d+)\.\s+(.+?)\s+([\d.]+)\s+([\d,]+)\s+([\d.]+)\s+([\d,]+)\s+([\d.]+)\s*$"
    )
    for line in section.splitlines():
        m = row_re.match(line)
        if not m:
            continue
        no = int(m.group(1))
        var = m.group(2).strip()
        # Strip trailing english translation after first " / "? Keep both: "Satuan Pendidikan / Schools"
        rows.append([
            no,
            var,
            parse_value(m.group(3)),
            parse_value(m.group(4)),
            parse_value(m.group(5)),
            parse_value(m.group(6)),
            parse_value(m.group(7)),
        ])
    if not rows:
        return None
    return header, rows


def slugify_code(code: str) -> str:
    """Convert '1.1.2' -> 'tabel_1_1_2'."""
    return "tabel_" + code.replace(".", "_")


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract SMA/SMK statistical tables from PDF.")
    parser.add_argument("--pdf", required=True, type=Path, help="Path to source PDF.")
    parser.add_argument("--kind", required=True, choices=["sma", "smk"], help="Document kind.")
    parser.add_argument("--out", required=True, type=Path, help="Output directory for CSVs.")
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)

    print(f"[*] Running pdftotext on {args.pdf} ...")
    text = run_pdftotext(args.pdf)
    print(f"[*] Extracted {len(text):,} characters of layout-preserved text.")

    # Special: extract 1.1.1 (national summary)
    summary = extract_national_summary_1_1_1(text, args.kind)
    manifest: List[Dict] = []
    if summary is not None:
        header, rows = summary
        out_path = args.out / "tabel_1_1_1.csv"
        with out_path.open("w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(header)
            w.writerows(rows)
        print(f"[OK] tabel_1_1_1.csv  ({len(rows)} rows)")
        manifest.append({
            "code": "1.1.1",
            "csv": "tabel_1_1_1.csv",
            "kind": "national_summary",
            "rows": len(rows),
            "title": "Gambaran Umum Keadaan SMA/SMK Menurut Status Satuan Pendidikan",
        })

    # Provincial tables (1.1.2 onward)
    tables = split_tables(text)
    print(f"[*] Identified {len(tables)} table codes.")

    for code, block in sorted(tables.items(), key=lambda kv: tuple(int(p) for p in kv[0].split("."))):
        if code == "1.1.1":
            continue  # Already handled

        header, rows = extract_table_rows(block)
        if not rows:
            print(f"[--] {code:8s} (no rows extracted; skipping)")
            continue

        slug = slugify_code(code)
        out_path = args.out / f"{slug}.csv"
        with out_path.open("w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(header)
            w.writerows(rows)

        manifest.append({
            "code": code,
            "csv": f"{slug}.csv",
            "kind": "provincial",
            "rows": len(rows),
            "n_columns": len(header) - 2,  # minus province_kd, province_name
            "title": block.title,
            "header_hints": block.header_hints[:20],  # first 20 header-area lines
        })
        print(f"[OK] {slug}.csv  ({len(rows)} rows, {len(header)-2} value cols)")

    manifest_path = args.out / "manifest.json"
    manifest_path.write_text(json.dumps({
        "kind": args.kind,
        "source_pdf": str(args.pdf.name),
        "n_tables": len(manifest),
        "tables": manifest,
    }, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n[DONE] {len(manifest)} tables written to {args.out}")
    print(f"       Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
