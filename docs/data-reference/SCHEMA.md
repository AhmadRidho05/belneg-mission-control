# SCHEMA Reference — SEKBER DIKMEN 2025

Reference detail untuk setiap tabel di 3 SQLite DB yang kamu pegang. Untuk overview konseptual & quickstart, baca [README.md](./README.md) dulu.

---

## File 1 — `dikmen_master.db` (consolidated star schema)

Built oleh `scripts/05_build_database.py` di source repo. **DB ini adalah yang harusnya dipakai aplikasi konsumen** (read-only, joinable, indexed).

Engine: SQLite 3, WAL journal mode, ~120 MB.

### Tabel: `dim_province`

39 rows. Provinces (38 BPS + "Luar Negeri").

| Kolom | Type | Notes |
|---|---|---|
| `province_kd` | TEXT PRIMARY KEY | 2-digit BPS code, e.g. `"32"` Jawa Barat. `"-"` for Luar Negeri |
| `province_name` | TEXT | Short form: `"Jawa Barat"`, `"DKI Jakarta"`, `"Luar Negeri"` |
| `island` | TEXT | Gugus kepulauan: `"Sumatera"`, `"Jawa"`, `"Bali & Nusa Tenggara"`, `"Kalimantan"`, `"Sulawesi"`, `"Maluku & Papua"`, `"Luar Negeri"` |

### Tabel: `dim_table_catalog`

248 rows. Registry of all PDF statistical tables (122 SMA + 126 SMK).

| Kolom | Type | Notes |
|---|---|---|
| `table_code` | TEXT | e.g. `"1.1.2"`, `"2.13.11"`. Composite PK with kind |
| `kind` | TEXT | `"sma"` or `"smk"`. Composite PK |
| `title` | TEXT | Original Indonesian title from PDF |
| `n_columns` | INTEGER | Number of data columns (excluding province_kd / province_name) |
| `n_rows` | INTEGER | Number of data rows (39 for provincial, ~11 for national-summary) |
| `header_hints` | TEXT (JSON array of strings) | Raw multi-line header text from `pdftotext` — useful as tooltip context |
| `column_names` | TEXT (JSON array of strings) | **LLM-generated snake_case names**, one per data column. `[]` for `tabel_1_1_1` national-summary tables (different schema). Length matches `n_columns` |

Example:

```sql
SELECT table_code, title, column_names FROM dim_table_catalog
WHERE kind='sma' AND table_code='1.1.2';
-- column_names = '["negeri_satuan_pendidikan","negeri_peserta_didik_baru_laki_laki",...]'
```

### Tabel: `fact_stat_long`

138,316 rows. Long-format pivot of all PDF tables — one row per (kind, table_code, province, col_index).

| Kolom | Type | Notes |
|---|---|---|
| `kind` | TEXT NOT NULL | `"sma"` or `"smk"`. Part of composite PK |
| `table_code` | TEXT NOT NULL | FK → `dim_table_catalog.table_code` |
| `province_kd` | TEXT NOT NULL | FK → `dim_province.province_kd` |
| `col_index` | INTEGER NOT NULL | 1-based, maps to `dim_table_catalog.column_names[col_index-1]` |
| `value` | REAL | Numeric cell value (`NULL` allowed for blank cells) |

Indexes: `(kind, table_code)`, `(province_kd)`.

To pivot to wide format, see [QUERIES.md §Pivot a stat table](./QUERIES.md#pivot-a-pdf-stat-table-to-wide-form).

### Tabel: `fact_satpen_dikmen`

34,011 rows. Satuan pendidikan SMA/SMK/MA (sederajat) scraped from data.kemendikdasmen.go.id.

| Kolom | Type | Notes |
|---|---|---|
| `npsn` | TEXT PRIMARY KEY | 8-digit BPS school code, e.g. `"70062083"`. Some MA/luar-negeri use alphanumeric |
| `nama` | TEXT | Nama satuan pendidikan |
| `alamat` | TEXT | Street address |
| `desa_kelurahan` | TEXT | |
| `kecamatan` | TEXT | |
| `kab_kota` | TEXT | Format: `"KAB. JAYAPURA"`, `"KOTA SURABAYA"` |
| `provinsi` | TEXT | Format: `"PROV. JAWA BARAT"`, `"LUAR NEGERI"` |
| `province_kd` | TEXT | 2-digit BPS code, **FK → `dim_province`** (cleaner join key than `provinsi` text) |
| `alamat_konsolidasi` | TEXT | Computed `alamat, desa, kecamatan, kab_kota, provinsi` concat |
| `status_sekolah` | TEXT | `"NEGERI"` or `"SWASTA"` |
| `bentuk_pendidikan` | TEXT | `"SMA"`, `"SMK"`, `"MA"`, `"MAK"`, `"SMAK"`, `"SMTK"`, `"SPK SMA"`, `"PDF ULYA"`, `"SPM ULYA"`, `"UTTAMA DHAMMASEKHA"` |
| `jenjang_pendidikan` | TEXT | Typically `"PENDIDIKAN MENENGAH"` |
| `kementerian_pembina` | TEXT | e.g. `"KEMENTERIAN PENDIDIKAN DASAR DAN MENENGAH"`, `"KEMENTERIAN AGAMA"` |
| `naungan` | TEXT | Nama yayasan (only for swasta — same as `fact_yayasan.judul` joined via `npyp`) |
| `npyp` | TEXT | 6-char yayasan code (e.g. `"AX4713"`). FK → `fact_yayasan.npyp`. NULL for negeri |
| `no_sk_pendirian` | TEXT | |
| `tgl_sk_pendirian` | TEXT | `"YYYY-MM-DD"` |
| `no_sk_operasional` | TEXT | |
| `tgl_sk_operasional` | TEXT | `"YYYY-MM-DD"` |
| `file_sk_operasional_url` | TEXT | **NULL for all rows** — API doesn't expose this. See DATA-NOTES §6 |
| `tgl_upload_sk_op` | TEXT | **NULL for all rows** — same |
| `akreditasi` | TEXT | `"A"`, `"B"`, `"C"`, `"TT"`, `"Belum Terakreditasi"`, or NULL |
| `luas_tanah` | INTEGER | m². **Outliers >1M m² exist** — see DATA-NOTES §3 |
| `akses_internet` | TEXT | `"TELKOM"`, `"DEDICATED"`, `"SHARED"`, etc. |
| `sumber_listrik` | TEXT | `"PLN"`, `"DIESEL"`, `"MENUMPANG"`, etc. |
| `fax` | TEXT | |
| `telepon` | TEXT | |
| `email` | TEXT | |
| `website` | TEXT | |
| `operator` | TEXT | **NULL for all rows** — API gap |
| `lintang` | REAL | Latitude WGS84. **Many are 0.0 — filter `ABS(lintang)>0.5` for map markers** |
| `bujur` | REAL | Longitude WGS84. Same filter |
| `scraped_at` | TEXT | ISO timestamp of when this row was scraped |
| `source_url` | TEXT | API endpoint used |

Indexes: `provinsi`, `province_kd`, `kab_kota`, `kecamatan`, `bentuk_pendidikan`, `status_sekolah`, `akreditasi`, `npyp`.

### Tabel: `fact_yayasan`

139,662 rows. Yayasan pendidikan.

| Kolom | Type | Notes |
|---|---|---|
| `npyp` | TEXT PRIMARY KEY | 6-char yayasan code, e.g. `"AX4713"` |
| `judul` | TEXT | Nama yayasan (e.g. `"YAYASAN PONDOK PESANTREN AS SYAKUR"`) |
| `pimpinan` | TEXT | Nama pimpinan yayasan |
| `operator` | TEXT | **NULL for all rows** — API gap |
| `email` | TEXT | |
| `no_pendirian` | TEXT | SK pendirian yayasan |
| `tgl_pendirian` | TEXT | `"YYYY-MM-DD"` |
| `no_pengesahan_pn_ln` | TEXT | Pengesahan PN LN |
| `no_sk_badan_hukum` | TEXT | SK Pengesahan Badan Hukum Menkumham |
| `tgl_sk_pengesahan` | TEXT | `"YYYY-MM-DD"` |
| `n_sekolah_naungan` | INTEGER | Cached count of `fact_yayasan_naungan` rows for this npyp |
| `nama_provinsi` | TEXT | `"PROV. JAWA BARAT"`, `"LUAR NEGERI"` — derived from listing API |
| `province_kd` | TEXT | 2-digit BPS code, **FK → `dim_province`** |
| `scraped_at` | TEXT | ISO timestamp |
| `source_url` | TEXT | |

Index: `province_kd`.

> ~28% of yayasan have `n_sekolah_naungan = 0` (yayasan non-pendidikan-formal or pending). See DATA-NOTES §4.

### Tabel: `fact_yayasan_naungan` (bridge: yayasan ↔ satpen)

180,722 rows. Many-to-many bridge: each row is one school owned by one yayasan.

| Kolom | Type | Notes |
|---|---|---|
| `npyp` | TEXT | FK → `fact_yayasan.npyp`. Part of composite PK |
| `npsn` | TEXT | FK → `fact_satpen_dikmen.npsn`. Part of composite PK |
| `nama` | TEXT | Nama sekolah (denormalized from satpen) |
| `jenjang` | TEXT | e.g. `"SMA"`, `"SMK"`, `"SD"`, `"SMP"`, `"PAUD"`, `"TK"` — **note: includes ALL jenjang under that yayasan, not just dikmen** |
| `kecamatan` | TEXT | Inherited from yayasan's wilayah |
| `kabupaten` | TEXT | Inherited from yayasan's wilayah |
| `provinsi` | TEXT | Inherited from yayasan's wilayah |
| `province_kd` | TEXT | FK → `dim_province` |

Indexes: `provinsi`, `province_kd`, `npsn`.

> ⚠️ This table covers all sekolah under each yayasan (PAUD/SD/SMP/SMA/SMK/MA), not just dikmen. The `fact_satpen_dikmen` table only has SMA/SMK/MA. To join: `WHERE jenjang IN ('SMA','SMK','MA',...)`.

### View: `vw_satpen_with_yayasan`

LEFT JOIN of `fact_satpen_dikmen` + `fact_yayasan` on NPYP. Adds these columns to satpen rows:

| Kolom | Notes |
|---|---|
| `yayasan_nama` | = `fact_yayasan.judul` |
| `yayasan_pimpinan` | = `fact_yayasan.pimpinan` |
| `yayasan_tgl_pendirian` | = `fact_yayasan.tgl_pendirian` |
| `yayasan_total_naungan` | = `fact_yayasan.n_sekolah_naungan` |

Negeri schools (NPYP NULL) get NULLs for yayasan fields.

### View: `vw_province_satpen_summary`

Aggregate per province from `fact_satpen_dikmen`. Useful for KPI dashboards.

| Kolom | Notes |
|---|---|
| `province_name` | From `provinsi` text (PROV. prefix stripped is NOT done — still `"PROV. JAWA BARAT"`) |
| `total_satpen` | COUNT(*) |
| `total_negeri` / `total_swasta` | by `status_sekolah` |
| `total_sma` / `total_smk` / `total_ma` | by `bentuk_pendidikan` (only these 3 forms — niche groups not included) |
| `akreditasi_a` / `akreditasi_b` / `akreditasi_c` | by `akreditasi` |
| `with_coords` | COUNT where `lintang IS NOT NULL AND bujur IS NOT NULL` (does **not** filter zero-coords — see DATA-NOTES §2) |

---

## File 2 — `scraped/yayasan.db` (extra fields)

Schema mirrors what's in `fact_yayasan` PLUS these fields that `05_build_database.py` doesn't import:

### Extra columns in `yayasan` table

| Kolom | Type | Notes |
|---|---|---|
| `yayasan_id` | TEXT | **UUID from Belajar.id API** — required for re-calling the yayasan-detail or naungan-fetch endpoints |
| `jenis_yayasan` | TEXT | `"INDUK"`, `"CABANG"`, `"MANDIRI"` |
| `parent_yayasan_id` | TEXT | UUID of parent (for CABANG yayasan) |
| `nama_kabupaten` | TEXT | `"KAB. JAYAPURA"` (raw API form) |
| `nama_kecamatan` | TEXT | |
| `nama_desa` | TEXT | |
| `alamat_jalan` | TEXT | |
| `kode_wilayah` | TEXT | 6-digit Permendagri code (NOT BPS — different system, see §"Wilayah codes" below) |

### Tables NOT in `fact_yayasan` (scraper progress state)

- `yayasan_province_progress` — per-province scrape progress (resume tracking)
- `yayasan_naungan_progress` — per-yayasan naungan-fetch progress

These are operational state — not useful for read apps. Ignore unless you're re-running the pipeline.

### `yayasan_naungan` table

Same schema as `fact_yayasan_naungan` in master, no extras. Use either.

---

## File 3 — `scraped/dikmen.db` (extra fields)

Schema mirrors `fact_satpen_dikmen` PLUS these:

### Extra columns in `satpen_dikmen` table

| Kolom | Type | Notes |
|---|---|---|
| `satuan_pendidikan_id` | TEXT | UUID from Belajar.id API |
| `bentuk_pendidikan_group` | TEXT | `"SMA SEDERAJAT"` or `"SMK SEDERAJAT"` — useful for SMA+MA vs SMK groupings |
| `jenis_pendidikan` | TEXT | `"PENDIDIKAN UMUM"`, `"PENDIDIKAN KEAGAMAAN"`, `"PENDIDIKAN KEJURUAN"`, etc. |
| `jalur_pendidikan` | TEXT | `"FORMAL"`, `"NON FORMAL"` |
| `kode_wilayah` | TEXT | 6-digit Permendagri kecamatan code |
| `kode_provinsi` | TEXT | 6-digit Permendagri province code (e.g. `"020000"` = Jawa Barat) |
| `kode_kabupaten` | TEXT | 6-digit |
| `kode_kecamatan` | TEXT | 6-digit |
| `rt` | INTEGER | |
| `rw` | INTEGER | |
| `nama_dusun` | TEXT | |
| `detail_fetched_at` | TEXT | ISO timestamp of when the detail endpoint was called |

### Tables NOT in master (scraper state)

- `dikmen_province_progress`, `dikmen_detail_progress` — scrape resume tracking. Ignore.

---

## Master vs Scraped — when to use which

| Need | Use |
|---|---|
| Province-level joins, KPI dashboards, AI Q&A, BI | `dikmen_master.db` only |
| Call back to Belajar.id API (need UUIDs) | Join `master.fact_*` to `scraped.satpen_dikmen`/`yayasan` via NPSN/NPYP for UUIDs |
| Geographic analysis at kecamatan/desa-Permendagri-code level | `scraped.dikmen.db` (need `kode_kecamatan` 6-digit Permendagri) |
| Distinguish PDF ULYA vs SPM ULYA niche bentuk | `scraped.dikmen.db` (`bentuk_pendidikan_group` field) — though master also has the raw `bentuk_pendidikan` |
| Identify parent-cabang yayasan hierarchy | `scraped.yayasan.db` (`parent_yayasan_id`, `jenis_yayasan`) |

**Joining example** — get yayasan UUID for backend API calls:

```sql
ATTACH DATABASE './scraped/yayasan.db' AS s;
SELECT y.npyp, y.judul, s.yayasan_id, s.jenis_yayasan
FROM fact_yayasan y JOIN s.yayasan s ON y.npyp = s.npyp
LIMIT 5;
DETACH DATABASE s;
```

---

## Wilayah codes — two systems

Confusingly, Indonesian admin codes come in TWO competing systems:

| System | Width | Pattern | Used by |
|---|---|---|---|
| **BPS sensus** | 2 digit | `"32"` = Jawa Barat | `dim_province.province_kd` + all `province_kd` columns in master DB |
| **Permendagri** | 6 digit | `"020000"` = Jawa Barat | `kode_provinsi` / `kode_wilayah` in scraped DBs (raw from Belajar.id API) |

**They're DIFFERENT numbers.** Permendagri `"32"` = Papua Barat in BPS sensus. Always disambiguate by checking which DB / column you're reading.

For most apps, **stick to BPS 2-digit via `province_kd`** — that's what `dim_province` indexes on.

---

## Identifiers cheat sheet

| Code | Format | Example | Used as PK in |
|---|---|---|---|
| `province_kd` | 2-digit BPS | `"32"` | `dim_province` |
| `npsn` | 8 digit (mostly) | `"70062083"` | `fact_satpen_dikmen` |
| `npyp` | 2 letters + 4 digits | `"AX4713"` | `fact_yayasan` |
| `table_code` | dotted | `"1.1.2"` | `dim_table_catalog` (composite with `kind`) |
| `yayasan_id` (UUID) | UUID v4 | `"7b0636c4-...-b7f7c385ac1d"` | (UUID, primary key for Belajar.id API; in `scraped/yayasan.db`) |
| `satuan_pendidikan_id` (UUID) | UUID v4 | same | (UUID, primary key for Belajar.id API; in `scraped/dikmen.db`) |
| `kode_wilayah` | 6-digit Permendagri | `"020100"` | not a PK; lookup-only |

---

Lihat [QUERIES.md](./QUERIES.md) untuk contoh penggunaan, [DATA-NOTES.md](./DATA-NOTES.md) untuk caveat data quality.
