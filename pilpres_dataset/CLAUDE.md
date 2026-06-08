# CLAUDE.md — Pilpres Kecamatan Dataset

> Context file untuk Claude Code (VS Code) saat vibe-coding analisis Pilpres 2019 & 2024 di kecamatan-level. Baca file ini **dulu** sebelum membuka data file lain.

## TL;DR untuk agent

- **2 dataset Pilpres** (2019 & 2024) di tingkat kecamatan, joined via BPS code 6-digit (`kode_kec`).
- **Primary file untuk query**: `pilpres_kecamatan.sqlite` — SQLite dengan 3 table + 2 view.
- **Primary key untuk join lintas tahun**: `kode_kec` (TEXT, 6-digit, contoh `'317101'` = Gambir, DKI Jakarta).
- **Untuk persentase di 2024, JANGAN pakai `suara_sah` sebagai denominator** — pakai sum-of-paslon-votes (sudah ada di view `v_2024_pct`). Detail di section "Gotchas".
- **Untuk 2024, SELALU filter `tps_coverage_pct >= 80`** sebelum analisis statistik. Data adalah SIREKAP partial (~70% nasional), bukan official KPU certified.
- **2019 adalah final certified KPU data**, total cocok dengan KPU dalam delta luar negeri saja.

## File inventory

| File | Bentuk | Ukuran | Untuk apa |
|---|---|---|---|
| `pilpres_kecamatan.sqlite` | SQLite DB | 1.5 MB | **PRIMARY** — 3 table + 2 view, sudah ready untuk join |
| `pilpres_2019_kecamatan.csv` | CSV | 0.6 MB | 2019 only, flat file |
| `pilpres_2024_kecamatan.csv` | CSV | 0.7 MB | 2024 only, flat file (dengan coverage metrics) |
| `wilayah_master.csv` | CSV | 0.4 MB | Master 7,285 kecamatan × kab × prov (Kepmendagri 2025) |
| `pilpres_2019_kecamatan_audit.csv` | CSV | 0.7 MB | Audit trail 2019 dengan kolom `kp_kec_names` (nama KawalPemilu asli) |
| `README.md` | Markdown | — | Human-readable docs |
| `CLAUDE.md` | Markdown | — | File ini (untuk AI agent) |

## Schema reference

### `wilayah` (7,285 rows) — master crosswalk

```
kode_kec   TEXT PRIMARY KEY  -- 6-digit BPS, contoh '317101'
nama_kec   TEXT              -- contoh 'Gambir'
kode_kab   TEXT              -- 4-digit, contoh '3171'
nama_kab   TEXT              -- contoh 'Kota Administrasi Jakarta Pusat'
kode_prov  TEXT              -- 2-digit, contoh '31'
nama_prov  TEXT              -- contoh 'Daerah Khusus Ibukota Jakarta'
```

Sumber: Kepmendagri No. 300.2.2-2430 Tahun 2025 via `cahyadsn/wilayah`.

### `pilpres_2019` (7,101 rows)

```
kode_kec         TEXT PK         -- join ke wilayah.kode_kec
votes_jokowi     INT             -- Paslon 01 (Jokowi-Ma'ruf)
votes_prabowo    INT             -- Paslon 02 (Prabowo-Sandi)
suara_sah        INT             -- ✅ RELIABLE di 2019 (data certified)
suara_tidak_sah  INT
suara_total      INT             -- = suara_sah + suara_tidak_sah
```

Untuk persentase 2019: pakai `suara_sah` atau `(votes_jokowi + votes_prabowo)` — keduanya equivalent (data certified, sum match suara_sah).

### `pilpres_2024` (7,277 rows)

```
kode_kec         TEXT PK         -- join ke wilayah.kode_kec
votes_anies      INT             -- Paslon 01 (Anies-Muhaimin)
votes_prabowo    INT             -- Paslon 02 (Prabowo-Gibran)
votes_ganjar     INT             -- Paslon 03 (Ganjar-Mahfud)
suara_sah        INT             -- ⚠️ TIDAK RELIABLE (SIREKAP admin section OCR-error)
suara_tidak_sah  INT             -- ⚠️ TIDAK RELIABLE
jumlah_tps       INT             -- total TPS di kecamatan ini
tps_dengan_data  INT             -- TPS dengan vote count non-null
tps_coverage_pct REAL            -- = tps_dengan_data / jumlah_tps * 100
```

**Untuk persentase 2024: pakai `(votes_anies + votes_prabowo + votes_ganjar)` sebagai denominator, JANGAN `suara_sah`**.

### Views

```sql
-- v_2019_pct: pilpres_2019 + wilayah + sudah pre-compute pct_jokowi, pct_prabowo, total_votes
-- v_2024_pct: pilpres_2024 + wilayah + sudah pre-compute pct_anies, pct_prabowo, pct_ganjar, total_votes
```

**Pakai view ini sebagai default** — sudah handle issue suara_sah dan sudah include nama wilayah.

## Cara connect

### Python (sqlite3)
```python
import sqlite3
con = sqlite3.connect('pilpres_kecamatan.sqlite')
con.row_factory = sqlite3.Row  # untuk akses kolom by name
for r in con.execute("SELECT * FROM v_2024_pct WHERE nama_prov='Daerah Khusus Ibukota Jakarta' LIMIT 5"):
    print(dict(r))
```

### Python (pandas)
```python
import pandas as pd, sqlite3
con = sqlite3.connect('pilpres_kecamatan.sqlite')
df = pd.read_sql("SELECT * FROM v_2024_pct WHERE tps_coverage_pct >= 80", con)
```

### DuckDB (recommended untuk analytics besar)
```python
import duckdb
con = duckdb.connect()
con.execute("ATTACH 'pilpres_kecamatan.sqlite' AS db (TYPE SQLITE)")
df = con.execute("SELECT * FROM db.v_2024_pct LIMIT 10").df()
```

### TypeScript / Node (better-sqlite3)
```typescript
import Database from 'better-sqlite3';
const db = new Database('pilpres_kecamatan.sqlite', { readonly: true });
const rows = db.prepare('SELECT * FROM v_2024_pct WHERE tps_coverage_pct >= 80').all();
```

### CSV langsung (kalau gak mau pakai SQLite)
```python
import pandas as pd
df19 = pd.read_csv('pilpres_2019_kecamatan.csv',
                    dtype={'kode_kec':str,'kode_kab':str,'kode_prov':str})
df24 = pd.read_csv('pilpres_2024_kecamatan.csv',
                    dtype={'kode_kec':str,'kode_kab':str,'kode_prov':str})
# WAJIB dtype string — pandas default akan parse "0317101" jadi int dan kehilangan leading zero
```

## Query patterns siap pakai

### 1. Swing analysis Prabowo 2019 vs 2024

```sql
SELECT v19.kode_kec, v19.nama_prov, v19.nama_kab, v19.nama_kec,
       v19.pct_prabowo AS pct_prabowo_2019,
       v24.pct_prabowo AS pct_prabowo_2024,
       v24.pct_prabowo - v19.pct_prabowo AS swing_pp,
       v24.tps_coverage_pct
FROM v_2019_pct v19
JOIN v_2024_pct v24 USING (kode_kec)
WHERE v24.tps_coverage_pct >= 80
  AND v24.total_votes >= 5000
  AND v19.total_votes >= 5000
ORDER BY swing_pp DESC;
```

### 2. Basis Anies 2024 (kecamatan dengan Anies > 50%)

```sql
SELECT nama_prov, nama_kab, nama_kec, total_votes, pct_anies, tps_coverage_pct
FROM v_2024_pct
WHERE pct_anies > 50 AND tps_coverage_pct >= 80
ORDER BY pct_anies DESC;
```

### 3. Agregasi per kabupaten 2024 (catatan: suara_sah unreliable — pakai sum paslon)

```sql
SELECT w.kode_prov, w.nama_prov, w.kode_kab, w.nama_kab,
       SUM(p.votes_anies)   AS sum_anies,
       SUM(p.votes_prabowo) AS sum_prabowo,
       SUM(p.votes_ganjar)  AS sum_ganjar,
       SUM(p.votes_anies + p.votes_prabowo + p.votes_ganjar) AS total,
       SUM(p.tps_dengan_data) * 100.0 / SUM(p.jumlah_tps) AS coverage_pct
FROM pilpres_2024 p JOIN wilayah w USING (kode_kec)
GROUP BY w.kode_kab
ORDER BY coverage_pct DESC;
```

### 4. Agregasi per provinsi 2019 (data certified, suara_sah reliable)

```sql
SELECT w.kode_prov, w.nama_prov,
       SUM(p.votes_jokowi)  AS sum_jokowi,
       SUM(p.votes_prabowo) AS sum_prabowo,
       SUM(p.suara_sah)     AS total_sah,
       ROUND(100.0 * SUM(p.votes_jokowi) / SUM(p.suara_sah), 2) AS pct_jokowi
FROM pilpres_2019 p JOIN wilayah w USING (kode_kec)
GROUP BY w.kode_prov
ORDER BY pct_jokowi DESC;
```

### 5. Anies vs (Prabowo+Ganjar) head-to-head proxy 2024

```sql
-- Asumsi: koalisi Prabowo dan Ganjar lebih dekat satu sama lain daripada ke Anies
SELECT nama_prov, nama_kab, nama_kec,
       votes_anies, votes_prabowo + votes_ganjar AS votes_oposisi_anies,
       ROUND(100.0 * votes_anies / total_votes, 2) AS pct_anies
FROM v_2024_pct
WHERE tps_coverage_pct >= 80 AND total_votes > 5000
ORDER BY pct_anies DESC LIMIT 50;
```

### 6. Cari kecamatan tertentu fuzzy

```sql
-- Cari "Gambir" dimanapun
SELECT * FROM wilayah WHERE nama_kec LIKE '%Gambir%';

-- Semua kecamatan di Kota Bogor
SELECT * FROM wilayah WHERE nama_kab LIKE '%Kota Bogor%';

-- Get vote data sekaligus
SELECT w.*, p24.votes_anies, p24.votes_prabowo, p24.votes_ganjar, p24.tps_coverage_pct
FROM wilayah w LEFT JOIN pilpres_2024 p24 USING (kode_kec)
WHERE w.nama_kab LIKE '%Yogyakarta%';
```

### 7. Validate national totals

```sql
-- 2019: should be Jokowi=83,721,243, Prabowo=67,997,709 (excl. luar negeri)
SELECT SUM(votes_jokowi), SUM(votes_prabowo) FROM pilpres_2019;

-- 2024: Anies ~28.6M, Prabowo ~69.5M, Ganjar ~19.8M (partial SIREKAP)
-- Official: Anies 40.97M, Prabowo 96.21M, Ganjar 27.04M (incl. luar negeri)
SELECT SUM(votes_anies), SUM(votes_prabowo), SUM(votes_ganjar) FROM pilpres_2024;
```

## Gotchas — baca ini sebelum coding

1. **`suara_sah` di 2024 tidak reliable.** SIREKAP OCR pisah antara field "chart" (vote per paslon) dan "administrasi" (DPT, suara_sah dll). Admin section sering null padahal chart ada datanya. Akibatnya `suara_sah < votes_anies + votes_prabowo + votes_ganjar` di banyak kecamatan. **Selalu pakai `total_votes = votes_anies + votes_prabowo + votes_ganjar`** sebagai denominator. Sudah di-handle di `v_2024_pct.total_votes`.

2. **`kode_kec` adalah STRING dengan leading zeros.** Pandas default parse jadi int dan kehilangan leading zero (contoh `'010101'` jadi `10101`). **Selalu `dtype={'kode_kec':str, 'kode_kab':str, 'kode_prov':str}`** saat `pd.read_csv`. Sama untuk excel/json export — make sure string type.

3. **2024 punya 24 `kode_kec` yang tidak ada di `wilayah` master.** Semua di provinsi 96 (Papua Barat Daya), kecamatan yang dibuat post-snapshot. Vote count-nya kecil dan akan jadi NULL di join. Filter via `JOIN` (inner) kalau mau drop.

4. **2024 coverage tidak merata.** Papua Pegunungan (kode 95): coverage 0.1% — effectively no data. Bali: 48.8%. Jateng/DIY/Bengkulu/Lampung: >85%. **Selalu cek `tps_coverage_pct` per provinsi** sebelum bikin claim.

5. **Pemekaran provinsi Papua 2022.** Data 2019 KawalPemilu ada di Papua induk (91) dan Papua Barat (92). Saya sudah re-distribute via BPS code 2025, jadi sekarang ada di 91/92/93/94/95/96. Tapi data 2019 itu **sebelum pemekaran**, jadi statistic provinsi 2019 untuk Papua Tengah/Selatan/Pegunungan/Barat Daya itu effectively "imputed" via kab boundaries.

6. **14 kecamatan 2019 di-merge ke 1 kecamatan 2025.** Contoh: "Seberang Ulu I" + "Seberang Ulu II" (Palembang, 2019) → "Seberang Ulu Dua" (2025) — vote totals saya sumkan. Lihat audit file `pilpres_2019_kecamatan_audit.csv` kolom `kp_kec_names` (delimited dengan `; `).

7. **Tidak ada data luar negeri.** Scope file ini kecamatan domestic only. Total nasional 2019 file ini = official KPU minus ~2.5 juta suara LN.

8. **Untuk angka official 2024 yang citable**, file ini bukan source-of-truth. Refer ke Keputusan KPU No. 360/2024 atau Berita Acara DA1/DB1/DC1 PPWP. Use file ini untuk analisis **pola spasial dan relatif**.

## Data lineage

```
2019: pemilu2019.kpu.go.id (SITUNG, sekarang offline)
       ↓ mirror by kawalpemilu/kawalpemilu2019-extract (GitHub, 1GB JSON tree)
       ↓ extract via build_2019.py (walk depth=2 kabupaten nodes, read .kpu field)
       ↓ fuzzy match nama_kec → BPS code (Kepmendagri 2025) + 20 manual overrides
       → pilpres_2019_kecamatan.csv

2024: pemilu2024.kpu.go.id SIREKAP API
       ↓ scrape by abdshomad/pilpres2024 (28 Feb – 2 Mar 2024 snapshot, GitHub)
       ↓ aggregate via build_2024.py (sparse-checkout per provinsi, sum TPS JSON)
       → pilpres_2024_kecamatan.csv
```

Master wilayah: `cahyadsn/wilayah` (Kepmendagri 300.2.2-2430/2025, parsed via `parse_wilayah.py`).

## Tips untuk extending

- **Tambah variable demografi/sosioek per kecamatan**: join dari BPS publikasi (Kecamatan Dalam Angka) atau Podes via `kode_kec`. Format BPS code untuk Podes biasanya `kode_prov + '.' + ...` — strip dots dulu.
- **Tambah data 2014**: pakai `kawalpemilu/kawalpemilu2014` (mirip struktur 2019).
- **Tambah Pileg/DPRD**: KPU SIREKAP punya endpoint terpisah `/pemilu/hhcw/pdpr/...`, `/pdprd/...`. abdshomad repo punya scrapper-nya.
- **Aggregasi ke level lain**: gunakan `kode_kab` (kabupaten) atau `kode_prov` (provinsi) — bisa langsung GROUP BY.

## Validasi cepat (smoke test)

```sql
-- 1. Row counts
SELECT 'wilayah', COUNT(*) FROM wilayah
UNION ALL SELECT '2019', COUNT(*) FROM pilpres_2019
UNION ALL SELECT '2024', COUNT(*) FROM pilpres_2024;
-- Expected: wilayah 7285, 2019 7101, 2024 7277

-- 2. Coverage tidak ada NULL/negatif
SELECT MIN(votes_anies), MAX(votes_anies), MIN(tps_coverage_pct), MAX(tps_coverage_pct)
FROM pilpres_2024;
-- Expected: 0, <50000, 0, 100

-- 3. Province totals 2019 ranking (Prabowo ≥ Jokowi)
SELECT w.nama_prov,
       SUM(p.votes_jokowi)  AS j,
       SUM(p.votes_prabowo) AS p,
       CASE WHEN SUM(p.votes_prabowo) > SUM(p.votes_jokowi) THEN 'PRABOWO' ELSE 'JOKOWI' END AS winner
FROM pilpres_2019 p JOIN wilayah w USING (kode_kec)
GROUP BY w.kode_prov
ORDER BY w.kode_prov;
-- Expected: Aceh, Sumbar, Sumut, Riau, Kepri, Banten, Jabar, NTB,
--           Sulsel, Maluku Utara WIN to Prabowo; rest Jokowi.
```

## Kontak / source

- Generated: 25 May 2026
- Methodology: `build_2019.py`, `build_2024.py`, `parse_wilayah.py`, `build_sqlite.py` (sources di delivery zip)
- License: data dari KPU & KawalPemilu di domain publik; script MIT-style use as you wish.
- Issues / questions: hubungi tim yang generate dataset ini.
