# Pilpres 2019 & 2024 — Kecamatan-Level Vote Data

Hasil perolehan suara Pemilihan Presiden Indonesia 2019 dan 2024 di tingkat kecamatan, dengan kode wilayah BPS (Kepmendagri No. 300.2.2-2430 Tahun 2025) sebagai primary key untuk join.

Dibuat khusus untuk vibe-coding — semua file punya schema yang bersih, ada SQLite DB siap pakai dengan view yang sudah men-handle quirk data.

---

## Files

| File | Apa isinya |
|---|---|
| `pilpres_2019_kecamatan.csv` | 2019 Pilpres (Jokowi-Ma'ruf vs Prabowo-Sandi), 7,101 baris |
| `pilpres_2024_kecamatan.csv` | 2024 Pilpres (Anies-Muhaimin vs Prabowo-Gibran vs Ganjar-Mahfud), 7,277 baris |
| `wilayah_master.csv` | Master 7,285 kecamatan × kab/kota × provinsi (Kepmendagri 300.2.2-2430/2025) |
| `pilpres_kecamatan.sqlite` | SQLite DB gabungan ketiga tabel + 2 view dengan persentase pre-computed |
| `pilpres_2019_kecamatan_audit.csv` | Versi 2019 audit (kolom tambahan `kp_kec_names` — nama kecamatan asli KawalPemilu 2019) |
| `README.md` | File ini |

---

## Sumber Data

### 2019 — high quality, KPU certified ✅

- **Sumber**: `kawalpemilu/kawalpemilu2019-extract` (KawalPemilu Pro Data, 91,540 file JSON, tree hierarchical depth 0–4)
- **Tipe**: Final certified KPU dari field `kpu` per node — bukan crowdsource KawalPemilu, melainkan SITUNG/Berita Acara KPU resmi yang di-mirror oleh KawalPemilu
- **Validasi**: total nasional cocok dengan official KPU dalam delta luar negeri:
  - Jokowi-Ma'ruf: 83,721,243 (data ini, **excl. LN**) vs 85,607,362 (KPU, **incl. LN**), Δ ≈ 1.9 juta = luar negeri ✓
  - Prabowo-Sandi: 67,997,709 (excl. LN) vs 68,650,239 (incl. LN), Δ ≈ 650 ribu = luar negeri ✓
- **Coverage**: 100% kecamatan dalam negeri, 7,116 raw rows → 7,101 unik setelah merge 14 kasus (kecamatan yang dipecah/digabung antara 2019 dan 2025)
- **Catatan**: data luar negeri tidak ada di file ini (per scope kecamatan)

### 2024 — partial coverage, SIREKAP TPS-level dump ⚠️

- **Sumber**: `abdshomad/pilpres2024` (SIREKAP scrape, 28 Feb – 2 Mar 2024 snapshot)
- **Tipe**: Hasil OCR formulir C1 TPS per KPU SIREKAP, ter-aggregate per kecamatan dengan menjumlahkan suara dari TPS yang ter-OCR
- **Coverage**:
  - Total nasional: Anies 28.6 juta (69.7% official), Prabowo 69.5 juta (72.2%), Ganjar 19.8 juta (73.3%)
  - **Margin Prabowo vs Anies = 58.9% (data ini) vs 57.4% (official KPU)** → **proporsional sangat akurat**, walau angka absolutnya partial
  - 50% kecamatan punya ≥80% TPS coverage; 24% punya ≥95% coverage; 8% no_data
- **Kenapa partial?** SIREKAP publik dibekukan KPU akhir Feb 2024 setelah kontroversi OCR. Data final certified ada di Berita Acara DA1-PPWP/DB1-PPWP/DC1-PPWP (PDF tanda tangan tersegel) yang tidak ada di KPU public API.
- **Untuk hasil resmi**: rujuk Keputusan KPU No. 360/2024 dan SK terkait.

---

## Schema

### Table `wilayah` (7,285 rows)

| kolom | tipe | contoh |
|---|---|---|
| `kode_kec`  | TEXT PK | `317101` |
| `nama_kec`  | TEXT    | `Gambir` |
| `kode_kab`  | TEXT    | `3171` |
| `nama_kab`  | TEXT    | `Kota Administrasi Jakarta Pusat` |
| `kode_prov` | TEXT    | `31` |
| `nama_prov` | TEXT    | `Daerah Khusus Ibukota Jakarta` |

### Table `pilpres_2019` (7,101 rows)

| kolom | tipe | catatan |
|---|---|---|
| `kode_kec` | TEXT PK | join ke `wilayah.kode_kec` |
| `votes_jokowi`     | INT | Paslon 01 Jokowi-Ma'ruf |
| `votes_prabowo`    | INT | Paslon 02 Prabowo-Sandi |
| `suara_sah`        | INT | total suara sah |
| `suara_tidak_sah`  | INT | suara tidak sah |
| `suara_total`      | INT | jumlah suara masuk |

### Table `pilpres_2024` (7,277 rows)

| kolom | tipe | catatan |
|---|---|---|
| `kode_kec` | TEXT PK | join ke `wilayah.kode_kec` (24 kode tidak ada di master karena dibuat post-snapshot) |
| `votes_anies`       | INT | Paslon 01 Anies-Muhaimin |
| `votes_prabowo`     | INT | Paslon 02 Prabowo-Gibran |
| `votes_ganjar`      | INT | Paslon 03 Ganjar-Mahfud |
| `suara_sah`         | INT | total suara sah; **sering lebih rendah dari** `votes_anies+votes_prabowo+votes_ganjar` karena admin section C1 lebih sering OCR-error daripada angka paslon. Pakai sum paslon kalau butuh denominator persentase. |
| `suara_tidak_sah`   | INT | suara tidak sah (partial coverage) |
| `jumlah_tps`        | INT | total TPS di kecamatan (denominator coverage) |
| `tps_dengan_data`   | INT | TPS yang ter-OCR dengan chart non-null |
| `tps_coverage_pct`  | REAL | persentase coverage TPS (filter ini, mis. `>= 80`) |

### Views (SQLite)

```sql
v_2019_pct  -- includes nama_kec, total_votes, pct_jokowi, pct_prabowo
v_2024_pct  -- includes nama_kec, total_votes, pct_anies, pct_prabowo, pct_ganjar, tps_coverage_pct
```

Persentase di view **menggunakan sum paslon votes**, bukan `suara_sah`, untuk menghindari issue admin-section OCR di 2024.

---

## Quick Use

### Filter analitik standar (recommended)

```sql
-- 2024: only use kecamatan dengan coverage cukup
SELECT * FROM v_2024_pct WHERE tps_coverage_pct >= 80 AND total_votes >= 5000;

-- Swing analysis 2019 -> 2024
SELECT v19.nama_prov, v19.nama_kab, v19.nama_kec,
       v19.pct_prabowo AS pct_prabowo_2019,
       v24.pct_prabowo AS pct_prabowo_2024,
       v24.pct_prabowo - v19.pct_prabowo AS swing_pp,
       v24.tps_coverage_pct
FROM v_2019_pct v19 JOIN v_2024_pct v24 USING (kode_kec)
WHERE v24.tps_coverage_pct >= 80 AND v24.total_votes >= 5000
ORDER BY swing_pp DESC;
```

### Pandas

```python
import pandas as pd
df19 = pd.read_csv('pilpres_2019_kecamatan.csv', dtype={'kode_kec':str,'kode_kab':str,'kode_prov':str})
df24 = pd.read_csv('pilpres_2024_kecamatan.csv', dtype={'kode_kec':str,'kode_kab':str,'kode_prov':str})

# Always filter on coverage for 2024
df24_clean = df24[df24['tps_coverage_pct'] >= 80].copy()

# Join
merged = df19.merge(df24_clean, on='kode_kec', suffixes=('_19','_24'))
```

### DuckDB

```sql
ATTACH 'pilpres_kecamatan.sqlite' AS db (TYPE SQLITE);
SELECT * FROM db.v_2024_pct LIMIT 10;
```

---

## Known limitations

1. **2024 angka absolut bukan official.** Kalau Pak butuh angka resmi untuk publikasi/cite, gunakan SK KPU No. 360/2024 sebagai sumber. Data ini ditujukan untuk **analisis pola spasial dan relatif**.
2. **Mapping kecamatan 2019 → 2025 master**: 14 kecamatan dari 2019 di-merge ke 1 kecamatan 2025 (pemekaran-balik / penataan ulang). Untuk kecamatan ini, vote 2019 disumkan. Audit lengkap di file `_audit.csv` (kolom `kp_kec_names`).
3. **Provinsi pemekaran Papua (93–96)**: data 2019 KawalPemilu masih di provinsi induk Papua (91) dan Papua Barat (92), tapi sudah ter-redistribute ke 6 provinsi (91/92/93/94/95/96) via kode kecamatan BPS 2025.
4. **Pilpres 2024 di Papua Pegunungan (95)**: coverage SIREKAP hanya 0.1% — basically tidak ada data usable.
5. **Luar negeri tidak masuk** (kecamatan-scope only).

---

## Methodology summary

1. **Wilayah master** dibuild dari `cahyadsn/wilayah` (`db/wilayah.sql`, Kepmendagri 300.2.2-2430/2025).
2. **2019 extract** dari KawalPemilu Pro Data tree:
   - Walk depth=0 (national) → depth=1 (provinsi) → depth=2 (kabupaten)
   - Kabupaten node punya `kpu` dict keyed by integer KawalPemilu kecamatan id, value = `{pas1, pas2, sah, tSah, jum}`
   - Map KawalPemilu kec name → BPS code via fuzzy match (difflib SequenceMatcher) + manual override table untuk 20 kasus naming change 2019→2025
3. **2024 aggregate** dari `abdshomad/pilpres2024/hasil-tps/`:
   - Sparse-checkout per provinsi (38 batch)
   - Loop semua file JSON 13-digit (TPS), parse `chart` (vote per paslon ID 100025/100026/100027) dan `administrasi`
   - Agregasi sum per kode kecamatan (TPS code first 6 digit)
   - Compute coverage = TPS_dengan_chart / TPS_total

Script-script-nya ada di repo terkait — `build_2019.py`, `build_2024.py`, `parse_wilayah.py`, `build_sqlite.py`.

---

*Generated 25 May 2026.*
