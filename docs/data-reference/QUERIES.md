# QUERIES — SEKBER DIKMEN 2025 Cookbook

Common queries with SQL + minimal code examples (Node.js better-sqlite3, Python sqlite3). Index of recipes below; pick what you need.

For schema reference: [SCHEMA.md](./SCHEMA.md). For data quality caveats: [DATA-NOTES.md](./DATA-NOTES.md).

---

## Index

1. [Open the DB](#open-the-db)
2. [Top N provinces by school count](#top-n-provinces-by-school-count)
3. [All schools in a specific kecamatan](#all-schools-in-a-specific-kecamatan)
4. [Schools under a specific yayasan](#schools-under-a-specific-yayasan)
5. [Yayasan with most schools (mega-foundations)](#yayasan-with-most-schools-mega-foundations)
6. [School lookup by NPSN](#school-lookup-by-npsn)
7. [Pivot a PDF stat table to wide form](#pivot-a-pdf-stat-table-to-wide-form)
8. [Decode column names for a stat table](#decode-column-names-for-a-stat-table)
9. [Compute negeri vs swasta share per province](#compute-negeri-vs-swasta-share-per-province)
10. [Akreditasi distribution per province](#akreditasi-distribution-per-province)
11. [Map markers (with coord-zero filter)](#map-markers-with-coord-zero-filter)
12. [Joining master with scraped for UUIDs](#joining-master-with-scraped-for-uuids)
13. [Bentuk × Status crosstab](#bentuk--status-crosstab)
14. [LUAR NEGERI satpen (Indonesian schools abroad)](#luar-negeri-satpen)
15. [Yayasan parent → cabang hierarchy](#yayasan-parent--cabang-hierarchy-needs-scrapedyayasandb)

---

## Open the DB

### Node.js

```ts
import Database from "better-sqlite3";

export function openDb(path = "./dikmen_master.db") {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  db.pragma("cache_size = -64000");   // 64MB
  db.pragma("query_only = ON");        // refuse writes even if mode flipped
  return db;
}
```

### Python

```python
import sqlite3

def open_db(path="./dikmen_master.db"):
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con
```

> All examples below assume `db` (Node) or `con` (Python) is a handle from these helpers.

---

## Top N provinces by school count

```sql
SELECT province_name, total_satpen, total_negeri, total_swasta,
       total_sma, total_smk, total_ma
FROM vw_province_satpen_summary
ORDER BY total_satpen DESC
LIMIT 10;
```

### Node

```ts
const top = db.prepare(`
  SELECT province_name, total_satpen, total_negeri, total_swasta
  FROM vw_province_satpen_summary
  ORDER BY total_satpen DESC LIMIT ?
`).all(10);
```

### Python

```python
top = con.execute("""
  SELECT province_name, total_satpen, total_negeri, total_swasta
  FROM vw_province_satpen_summary
  ORDER BY total_satpen DESC LIMIT ?
""", (10,)).fetchall()
```

---

## All schools in a specific kecamatan

```sql
SELECT npsn, nama, bentuk_pendidikan, status_sekolah, akreditasi
FROM fact_satpen_dikmen
WHERE provinsi = 'PROV. JAWA BARAT'
  AND kab_kota = 'KAB. BANDUNG'
  AND kecamatan = 'KEC. SOREANG'
ORDER BY nama;
```

> Note the `"PROV. "` and `"KAB. "` / `"KOTA "` / `"KEC. "` prefixes — that's the raw form from the API.

---

## Schools under a specific yayasan

Given an NPYP, get all schools — both **dikmen** (in `fact_satpen_dikmen`) AND **non-dikmen** (PAUD/SD/SMP in `fact_yayasan_naungan` only).

### All sekolah for one yayasan (any jenjang)

```sql
SELECT npsn, nama, jenjang, provinsi, kabupaten
FROM fact_yayasan_naungan
WHERE npyp = 'AX4713'
ORDER BY jenjang, nama;
```

### Only dikmen (SMA/SMK/MA) under a yayasan

```sql
SELECT s.npsn, s.nama, s.bentuk_pendidikan, s.akreditasi, s.alamat_konsolidasi
FROM fact_satpen_dikmen s
WHERE s.npyp = 'AX4713'
ORDER BY s.bentuk_pendidikan, s.nama;
```

---

## Yayasan with most schools (mega-foundations)

```sql
SELECT npyp, judul, pimpinan, n_sekolah_naungan
FROM fact_yayasan
WHERE n_sekolah_naungan > 0
ORDER BY n_sekolah_naungan DESC
LIMIT 20;
```

Top hits will be names like YAYASAN GMIM, PKK KABUPATEN LAMONGAN, MUSLIMAT NU, YAYASAN KEMALA BHAYANGKARI, PIMPINAN DAERAH MUHAMMADIYAH.

---

## School lookup by NPSN

```sql
SELECT * FROM vw_satpen_with_yayasan WHERE npsn = '70062083';
```

The view auto-joins yayasan info (NULL for negeri schools).

---

## Pivot a PDF stat table to wide form

The `fact_stat_long` table is in long format: one row per (kind, table_code, province_kd, col_index). To get a wide table (one row per province, columns 1..N):

### SQL (with CASE expansion)

```sql
-- For table 1.1.2 SMA (39 cols → too wide for SQL; use code instead)
SELECT province_kd,
       MAX(CASE WHEN col_index = 1 THEN value END) AS col_1,
       MAX(CASE WHEN col_index = 2 THEN value END) AS col_2,
       MAX(CASE WHEN col_index = 3 THEN value END) AS col_3
       -- ... up to col_N
FROM fact_stat_long
WHERE kind = 'sma' AND table_code = '1.1.2'
GROUP BY province_kd
ORDER BY province_kd;
```

### Node (cleaner — pivot in code)

```ts
function pivotStatTable(db, kind, code) {
  const rows = db.prepare(`
    SELECT province_kd, col_index, value
    FROM fact_stat_long WHERE kind = ? AND table_code = ?
  `).all(kind, code);
  const byProv = new Map();
  for (const r of rows) {
    if (!byProv.has(r.province_kd)) byProv.set(r.province_kd, { province_kd: r.province_kd });
    byProv.get(r.province_kd)[`col_${r.col_index}`] = r.value;
  }
  return Array.from(byProv.values());
}

const sma_overview = pivotStatTable(db, "sma", "1.1.2");
// sma_overview[0] = { province_kd: "32", col_1: 2078, col_2: ..., ... }
```

### Python

```python
def pivot_stat_table(con, kind, code):
    by_prov = {}
    for r in con.execute("""
        SELECT province_kd, col_index, value
        FROM fact_stat_long WHERE kind=? AND table_code=?
    """, (kind, code)):
        by_prov.setdefault(r["province_kd"], {"province_kd": r["province_kd"]})[f"col_{r['col_index']}"] = r["value"]
    return list(by_prov.values())
```

---

## Decode column names for a stat table

Each table's `dim_table_catalog.column_names` is a JSON array. Index N-1 maps to `col_N` in the pivoted output.

```sql
SELECT column_names FROM dim_table_catalog
WHERE kind = 'sma' AND table_code = '1.1.2';
-- returns: '["negeri_satuan_pendidikan","negeri_peserta_didik_baru_laki_laki", ...]'
```

### Node — full pivot with named columns

```ts
function pivotWithNames(db, kind, code) {
  const meta = db.prepare(`
    SELECT n_columns, column_names FROM dim_table_catalog
    WHERE kind = ? AND table_code = ?
  `).get(kind, code);
  if (!meta) return null;
  const names = JSON.parse(meta.column_names || "[]");
  const rows = pivotStatTable(db, kind, code);
  return rows.map((r) => {
    const out = { province_kd: r.province_kd };
    for (let i = 1; i <= meta.n_columns; i++) {
      const name = names[i - 1] || `col_${i}`;
      out[name] = r[`col_${i}`];
    }
    return out;
  });
}
```

---

## Compute negeri vs swasta share per province

```sql
SELECT province_name,
       total_satpen,
       ROUND(100.0 * total_negeri / total_satpen, 1) AS negeri_pct,
       ROUND(100.0 * total_swasta / total_satpen, 1) AS swasta_pct
FROM vw_province_satpen_summary
WHERE total_satpen > 0
ORDER BY negeri_pct DESC;
```

> Note: `vw_province_satpen_summary.total_negeri + total_swasta` may not equal `total_satpen` exactly because a few `status_sekolah` values are NULL/unknown.

---

## Akreditasi distribution per province

```sql
SELECT province_name,
       total_satpen,
       akreditasi_a,
       akreditasi_b,
       akreditasi_c,
       (total_satpen - akreditasi_a - akreditasi_b - akreditasi_c) AS other_or_null,
       ROUND(100.0 * akreditasi_a / total_satpen, 1) AS a_pct
FROM vw_province_satpen_summary
WHERE total_satpen > 0
ORDER BY a_pct DESC;
```

Expect DKI Jakarta at top (~63%) and NTB / NTT at bottom.

---

## Map markers (with coord-zero filter)

⚠️ ~9% of satpen have `lintang = 0 AND bujur = 0` (data entry artifact). Always filter:

```sql
SELECT npsn, nama, lintang, bujur, bentuk_pendidikan, status_sekolah
FROM fact_satpen_dikmen
WHERE lintang IS NOT NULL AND bujur IS NOT NULL
  AND ABS(lintang) > 0.5 AND ABS(bujur) > 90
  AND provinsi = 'PROV. JAWA BARAT'
LIMIT 5000;
```

The `ABS > 0.5` / `> 90` thresholds also catch a few outliers that landed near Greenwich (0, 0) area. Indonesia's true bbox: lat −11..6, lon 95..141.

---

## Joining master with scraped for UUIDs

Need the Belajar.id UUID to make API calls? `ATTACH` the scraped DB:

```sql
ATTACH DATABASE './scraped/dikmen.db' AS s;

SELECT m.npsn, m.nama, s.satuan_pendidikan_id, s.kode_kecamatan
FROM fact_satpen_dikmen m
JOIN s.satpen_dikmen s ON m.npsn = s.npsn
WHERE m.provinsi = 'PROV. JAWA BARAT' AND m.bentuk_pendidikan = 'SMA'
LIMIT 10;

DETACH DATABASE s;
```

Same pattern for yayasan:

```sql
ATTACH DATABASE './scraped/yayasan.db' AS y;

SELECT m.npyp, m.judul, y.yayasan_id, y.jenis_yayasan, y.parent_yayasan_id
FROM fact_yayasan m JOIN y.yayasan y ON m.npyp = y.npyp
WHERE m.n_sekolah_naungan > 50
ORDER BY m.n_sekolah_naungan DESC LIMIT 10;

DETACH DATABASE y;
```

> Note: ATTACH is a write operation by default. If opening master read-only, use `db.exec("ATTACH ... AS s")` after open is fine (better-sqlite3 / Python sqlite3 allow it). For ATTACH-read-only, append `?mode=ro`: `ATTACH DATABASE 'file:./scraped/dikmen.db?mode=ro' AS s` (requires URI mode).

---

## Bentuk × Status crosstab

```sql
SELECT bentuk_pendidikan, status_sekolah, COUNT(*) AS n
FROM fact_satpen_dikmen
GROUP BY bentuk_pendidikan, status_sekolah
ORDER BY bentuk_pendidikan, status_sekolah;
```

Expect SMA ~50/50 negeri/swasta, SMK ~30/70, MA ~7/93.

---

## LUAR NEGERI satpen

Indonesian schools abroad (SILN — Sekolah Indonesia Luar Negeri):

```sql
SELECT npsn, nama, kab_kota AS country, akreditasi, telepon, email
FROM fact_satpen_dikmen
WHERE provinsi = 'LUAR NEGERI'
ORDER BY kab_kota, nama;
```

Returns 13 satpen — SILN Tokyo, SILN Riyadh, SILN Kuala Lumpur, dll.

---

## Yayasan parent → cabang hierarchy (needs `scraped/yayasan.db`)

```sql
ATTACH DATABASE './scraped/yayasan.db' AS y;

-- All cabang yayasan and their parents
SELECT child.npyp AS cabang_npyp, child.judul AS cabang_nama,
       parent.npyp AS parent_npyp, parent.judul AS parent_nama
FROM y.yayasan child
LEFT JOIN y.yayasan parent ON parent.yayasan_id = child.parent_yayasan_id
WHERE child.jenis_yayasan = 'CABANG'
LIMIT 20;

DETACH DATABASE y;
```

---

## SAFETY — read-only enforcement

If your app passes user-controlled SQL (e.g. for an AI assistant feature), validate:

```ts
function safeReadOnly(sql: string) {
  const trimmed = sql.trim().replace(/;+$/, "");
  if (!/^(SELECT|WITH)\s/i.test(trimmed)) {
    throw new Error("Only SELECT / WITH queries allowed");
  }
  if (/\b(ATTACH|DETACH|PRAGMA|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|VACUUM)\b/i.test(trimmed)) {
    throw new Error("Forbidden statement");
  }
  return db.prepare(trimmed).all();
}
```

Plus open with `{ readonly: true }` and `pragma("query_only = ON")` as belt-and-suspenders.

---

## Performance tips

1. **Indexes are pre-built** — see SCHEMA.md per table. Most filter columns (`provinsi`, `kab_kota`, `bentuk_pendidikan`, `akreditasi`, `npyp`) are indexed.
2. **Use the views** (`vw_satpen_with_yayasan`, `vw_province_satpen_summary`) — they're not materialized but the optimizer handles them efficiently.
3. **Set `cache_size = -64000`** (64MB) on connection — much faster for repeated queries.
4. **For UI dashboards**: wrap query helpers in a cache layer (Next.js `unstable_cache`, in-memory LRU, etc.) — these are read-only data, TTL can be 1h+ since the DB only changes on pipeline rebuild.

For caveats on **what the data means** (cross-source gaps, outliers, NULL fields), see [DATA-NOTES.md](./DATA-NOTES.md).
