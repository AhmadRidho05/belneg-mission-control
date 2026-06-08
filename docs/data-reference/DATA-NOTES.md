# DATA NOTES — SEKBER DIKMEN 2025

Caveats, known data quality issues, and source-of-truth guidance. Read this **before** building any dashboard, AI assistant, or report that quotes specific numbers from this dataset.

For schema details: [SCHEMA.md](./SCHEMA.md). For query recipes: [QUERIES.md](./QUERIES.md).

---

## 1. Cross-source gap — PDF aggregate vs API scrape (most important)

Two sources of "how many SMA/SMK exist" — they don't match.

| Kind | PDF national total | API scrape count | Δ |
|---|---:|---:|---:|
| SMA | 14,822 | 13,184 | **−1,638 (−11.1%)** |
| SMK | 14,186 | 11,589 | **−2,597 (−18.3%)** |

Both are 2025/2026 academic year. Different snapshots & scopes:

- **PDF** (`fact_stat_long` table_code `'1.1.2'`) = Kemdikbud/BPS official statistical publication. Likely includes schools that closed/merged mid-year or pending status.
- **API scrape** (`fact_satpen_dikmen` COUNT(*)) = live `api.data.belajar.id/data-portal-backend/v2/master-data/satuan-pendidikan/daftar-data-induk` as of May 2026 — active registry only.

### Citation guide for downstream apps

| User question | Best source | Code reference |
|---|---|---|
| "Berapa SMA negeri di Jawa Barat?" (official-sounding) | **PDF aggregate** | `fact_stat_long WHERE kind='sma' AND table_code='1.1.2' AND province_kd='32' AND col_index=1` |
| "List sekolah-sekolah di kecamatan X" | **API scrape** (only source with per-school detail) | `fact_satpen_dikmen WHERE kecamatan = '...'` |
| Anything that touches NPSN, lat/lng, accreditation per school | **API scrape** | `fact_satpen_dikmen` |
| KPI per province (negeri/swasta share, akreditasi distribution) | **API scrape** via `vw_province_satpen_summary` (with caveat: numbers ~10% lower than PDF totals) | view |
| Policy brief / formal report | **PDF aggregate** + explicitly cite "Statistik Sekolah Menengah TA 2025/2026 KEMENDIKDASMEN" | |

**Recommendation**: in your app, when both sources are present, **tag every quoted number with its source** (e.g. "13,184 SMA — sumber: registrasi aktif Belajar.id, Mei 2026" vs "14,822 SMA — sumber: Statistik SMA 2025/2026 KEMENDIKDASMEN").

---

## 2. Geographic coordinates — many are (0, 0)

`fact_satpen_dikmen.lintang` / `bujur` are populated for 31,046 / 34,011 (~91%) of rows. But ~9% have `(0, 0)` or near-zero values — classic "coordinates not set" data entry artifact.

### Symptom

Without filtering, a map shows a huge fake cluster of Indonesian schools in the Gulf of Guinea.

### Fix (use this filter for ALL map queries)

```sql
WHERE lintang IS NOT NULL AND bujur IS NOT NULL
  AND ABS(lintang) > 0.5
  AND ABS(bujur) > 90
```

Indonesia true bbox is roughly lat −11..6, lon 95..141. The `ABS > 0.5` cutoff is conservative — it'll exclude maybe 5 legitimate equator-crossing schools in Riau/Sumut but catches all the (0,0) noise.

143 satpen also have coordinates outside Indonesia bbox (but non-zero) — most are mis-entered or legitimate but mis-attributed; safe to also exclude.

---

## 3. `luas_tanah` outliers — 212 schools claim >1 km²

212 satpen have `luas_tanah > 1,000,000 m²` (=100 hectares = 1 km²). For context: even large pesantren are rarely >50 hectares.

Likely causes: unit confusion (entered hectares as m²) or trailing-zero typos. **Do not naively average or sum `luas_tanah`** in dashboard metrics without capping or filtering.

### Recommended treatment

```sql
-- Cap at 500,000 m² (50 hectares) — generous for boarding schools
SELECT npsn, nama,
       MIN(luas_tanah, 500000) AS luas_tanah_safe
FROM fact_satpen_dikmen
WHERE luas_tanah > 0;

-- Or flag outliers for human review
SELECT npsn, nama, provinsi, luas_tanah
FROM fact_satpen_dikmen
WHERE luas_tanah > 1000000
ORDER BY luas_tanah DESC;
```

---

## 4. Yayasan with zero sekolah (28%)

~39,105 yayasan (28% of 139,662) have `n_sekolah_naungan = 0`. They're not bugs — most are:

- Foundations that operate **non-dikmen** schools only (PAUD, SD, SMP) — these don't appear in `fact_satpen_dikmen` (which is SMA/SMK/MA-only) so the bridge table `fact_yayasan_naungan` has no rows for them. But the yayasan entity still exists.
- Pending/inactive foundations awaiting school registration

If your app shows yayasan listings, consider filtering `n_sekolah_naungan > 0` for "yayasan pendidikan menengah aktif" displays.

---

## 5. Bentuk skew — MA 93% swasta, SMK 71%, SMA 50%

| Bentuk | Negeri | Swasta | Swasta share |
|---|---:|---:|---:|
| SMA | 6,584 | 6,600 | 50% |
| SMK | 3,365 | 8,224 | **71%** |
| MA (Madrasah Aliyah) | 637 | 7,904 | **93%** |

MA is mostly run by yayasan religious foundations under Kemenag, hence the heavy swasta tilt. Plus niche bentuk groups for completeness:

| Bentuk | Notes |
|---|---|
| `SMAK` (75) | Sekolah Menengah Atas Katolik / Christian |
| `SMTK` (151) | Sekolah Menengah Teologi Kristen |
| `MAK` (9) | Madrasah Aliyah Kejuruan |
| `SPK SMA` (130) | Satuan Pendidikan Kerjasama (intl/bilingual schools) |
| `SPM ULYA` (215) | Satuan Pendidikan Muadalah Ulya (Islamic) |
| `PDF ULYA` (68) | Pendidikan Diniyah Formal Ulya |
| `UTTAMA DHAMMASEKHA` (1) | Buddhist secondary |
| `SMAG.K` (48) | uncommon |

When your dashboard says "Total SMA = X", consider whether to include MA / niche groups under "Pendidikan Menengah" umbrella or split them explicitly.

---

## 6. API-irrecoverable NULL fields (will never have values)

The following fields are in the schema but **always NULL** because the Belajar.id JSON API doesn't expose them. They came from the old HTML-scraped detail pages that no longer exist.

### `fact_satpen_dikmen`
- `operator` — name of operator/data-entry person (Kontak tab in old UI)
- `file_sk_operasional_url` — direct URL to SK file (Dokumen tab)
- `tgl_upload_sk_op` — upload datetime of SK file

### `fact_yayasan`
- `operator` — name of operator

If your app needs these fields, options:
1. Source from Kemdikdasmen via partner agreement (not via public API)
2. HTML-scrape `referensi.data.kemendikdasmen.go.id/pendidikan/profil/<npsn>` if any server-rendered variant still works (unlikely — it became SPA)
3. Document as "not available from public source" in your UI

---

## 7. Field coverage at-a-glance

### `fact_satpen_dikmen` (n=34,011)

| Field | Populated | Notes |
|---|---|---|
| `lintang` / `bujur` | 99% | But ~9% are (0,0) — filter |
| `akreditasi` | 96% | |
| `email` | 70% | |
| `telepon` | 62% | |
| `website` | 48% | |
| `npyp` | 45% | NULL for negeri schools (no yayasan) — by design |
| `operator`, `file_sk_operasional_url` | 0% | API gap |

### `fact_yayasan` (n=139,662)

| Field | Populated | Notes |
|---|---|---|
| `pimpinan` | 99.4% | |
| `tgl_pendirian` | 96% | |
| `no_pendirian` | 82% | |
| `tgl_sk_pengesahan` | 74% | |
| `email` | 60% | |
| `no_sk_badan_hukum` | 40% | |
| `no_pengesahan_pn_ln` | 34% | |
| `operator` | 0% | API gap |

---

## 8. Date semantics

- `scraped_at` / `detail_fetched_at` — ISO 8601 with timezone (`"2026-05-25T17:18:42.538733+00:00"`). Useful for snapshot age.
- `tgl_pendirian`, `tgl_sk_pengesahan`, `tgl_sk_pendirian`, `tgl_sk_operasional` — ISO date `"YYYY-MM-DD"` only (no time component).
- Earliest `tgl_pendirian` is 1902-06-01 (plausible — pre-independence Muhammadiyah / Christian missions). No invalid dates detected.
- Latest is whatever your snapshot day is.

---

## 9. Wilayah naming inconsistency

The data has **two naming conventions** for province:

| Source | Format | Examples |
|---|---|---|
| `dim_province.province_name` | Short | `"Jawa Barat"`, `"DKI Jakarta"`, `"DI Yogyakarta"` |
| `fact_satpen_dikmen.provinsi`, `fact_yayasan.nama_provinsi`, `fact_yayasan_naungan.provinsi` | API form | `"PROV. JAWA BARAT"`, `"PROV. D.K.I. JAKARTA"`, `"PROV. D.I. YOGYAKARTA"`, `"LUAR NEGERI"` |

`build_database.py` does a name normalization to populate `province_kd` (BPS 2-digit) on all fact tables — **always join via `province_kd`, never via the name strings**, to avoid case/punctuation mismatches.

```sql
-- Wrong (won't match):
SELECT * FROM fact_satpen_dikmen s JOIN dim_province d
  ON s.provinsi = d.province_name;  -- "PROV. JAWA BARAT" ≠ "Jawa Barat"

-- Right:
SELECT * FROM fact_satpen_dikmen s JOIN dim_province d
  ON s.province_kd = d.province_kd;
```

Same for kabupaten: API form is `"KAB. JAYAPURA"` / `"KOTA SURABAYA"`. There's no equivalent dim_kabupaten table — use the raw string form directly.

---

## 10. Two different wilayah code systems (recap)

This is the #1 source of "wait, those don't match" confusion:

| System | Width | Used in master DB | Used in scraped DB |
|---|---|---|---|
| BPS sensus | 2-digit | `dim_province.province_kd`, all `province_kd` columns on fact tables | only in derived joins |
| Permendagri | 6-digit | not present | `scraped.satpen_dikmen.kode_provinsi`, `kode_kabupaten`, `kode_kecamatan`, `kode_wilayah` |

**They are completely different numbers.** `"32"` in BPS = Jawa Barat. `"32"` (as prefix of 6-digit) in Permendagri = Papua Barat.

When in doubt, use BPS via `dim_province` joins. Touch the Permendagri codes only if you're calling Belajar.id API endpoints directly (which expect Permendagri).

---

## 11. Source / lineage

- Pipeline: scraping + PDF extraction → SQLite consolidation, run by `scripts/01_scrape_dikmen.py` + `02_scrape_yayasan.py` + `03_04_extract_pdf_tables.py` + `05_build_database.py` in the source repo (`github.com/ferro-del/sekber-dikmen-2025`, private).
- Scrape API: `https://api.data.belajar.id/data-portal-backend/v2/master-data/{satuan-pendidikan,yayasan}/daftar-data-induk/{wilayah}` (Belajar.id portal — Kemendikdasmen backend)
- PDF source: 2 BPS publications, "Statistik Sekolah Menengah Atas / Kejuruan Tahun 2025-2026" (~25 MB + ~56 MB PDF files)
- Snapshot date: see `MAX(scraped_at)` in `fact_satpen_dikmen`, or the filename suffix on dated backup `dikmen_master_YYYYMMDD.db`
- LLM-named columns: `dim_table_catalog.column_names` generated by Claude Sonnet 4.6 (May 2026 run) with structured outputs; semantic snake_case per col_N

---

## TL;DR for AI assistants citing this data

If you're an AI assistant answering user questions backed by this DB:

1. **Always tag a number with its source** — PDF official vs API live registry.
2. **Use `province_kd` for joins**, never province name strings.
3. **Apply the coord filter** for map markers (`ABS(lintang)>0.5 AND ABS(bujur)>90`).
4. **Cap `luas_tanah`** in aggregations or flag outliers.
5. **`operator` / `file_sk_url` / `tgl_upload_sk_op` are always NULL** — don't hallucinate values.
6. **For "Pendidikan Menengah" totals**, decide whether to include MA / niche bentuk. Document the choice.
7. **For yayasan questions**, remember 28% have 0 dikmen sekolah (they run PAUD/SD/SMP).
