# Panduan Membuka Database dari Excel (Get Data)

> **Tujuan:** menghubungkan `data/dikmen_master.db` ke Excel sebagai *live data source* via ODBC.

---

## Pilihan Driver

| Platform     | Driver Rekomendasi                                                         | Catatan                                  |
| ------------ | -------------------------------------------------------------------------- | ---------------------------------------- |
| **Windows**  | [SQLite ODBC Driver by Christian Werner](http://www.ch-werner.de/sqliteodbc/) | Standar de-facto, gratis, 64-bit         |
| **macOS**    | [Actual ODBC SQLite Driver](https://www.actualtech.com/) atau `unixODBC` + `libsqliteodbc` via Homebrew | Trial 30 hari atau install via Homebrew  |
| **Lintas**   | Konversi ke `.xlsx` langsung (lihat **Alternatif** di bawah)              | Snapshot, bukan live                     |

---

## 🪟 Windows — Step by Step

### 1. Install Driver

1. Buka http://www.ch-werner.de/sqliteodbc/
2. Download `sqliteodbc_w64.exe` (untuk Excel 64-bit) atau `sqliteodbc.exe` (untuk Excel 32-bit)
3. Jalankan installer, klik **Next** sampai selesai. Driver akan terdaftar di ODBC Data Source Administrator.

### 2. Daftarkan DSN (Opsional, tapi recommended)

1. Tekan **Win + R**, ketik `odbcad32` (untuk 64-bit) atau `odbcad32_32` (32-bit), Enter.
2. Tab **User DSN** atau **System DSN** → klik **Add...**
3. Pilih **SQLite3 ODBC Driver** → klik **Finish**
4. Isi:
   - **Data Source Name:** `SEKBER_DIKMEN`
   - **Database Name:** klik **Browse**, pilih `data/dikmen_master.db`
   - Biarkan opsi lain default
5. **OK** → DSN tersimpan.

### 3. Connect dari Excel

1. Buka Excel
2. **Data** → **Get Data** → **From Other Sources** → **From ODBC**
3. Pilih DSN `SEKBER_DIKMEN` dari dropdown → **OK**
4. Di **Navigator**, pilih:
   - `fact_satpen_dikmen` (data sekolah dari Tindakan 1)
   - `fact_yayasan` (data yayasan dari Tindakan 2)
   - `fact_yayasan_naungan` (relasi yayasan ↔ sekolah)
   - `fact_stat_long` (data statistik PDF, long format)
   - `vw_province_satpen_summary` (rollup per provinsi, **paling berguna**)
   - `vw_satpen_with_yayasan` (sekolah dengan info yayasannya)
   - `dim_table_catalog` (lookup metadata tabel statistik)
   - `dim_province` (lookup provinsi)
5. Klik **Load** (langsung muat) atau **Transform Data** (pre-process di Power Query)

### 4. Refresh

Setelah pipeline scraping di-rerun:
- Excel: **Data** → **Refresh All**
- Atau set auto-refresh: **Query Properties** → tick **Refresh every N minutes**

---

## 🍎 macOS — Quick Path

### Via Homebrew + unixODBC

```bash
brew install unixodbc sqliteodbc

# Cari path driver
find /opt/homebrew /usr/local -name "libsqlite3odbc*" 2>/dev/null
# Contoh output: /opt/homebrew/lib/libsqlite3odbc.dylib
```

Edit `~/.odbcinst.ini`:

```ini
[SQLite3 Driver]
Description = SQLite3 ODBC Driver
Driver = /opt/homebrew/lib/libsqlite3odbc.dylib
Setup = /opt/homebrew/lib/libsqlite3odbc.dylib
```

Edit `~/.odbc.ini`:

```ini
[SEKBER_DIKMEN]
Description = Sekber Dikmen Master DB
Driver = SQLite3 Driver
Database = /path/lengkap/ke/sekber-dikmen-2025/data/dikmen_master.db
```

Test:
```bash
isql -v SEKBER_DIKMEN
# Di prompt: SELECT COUNT(*) FROM fact_stat_long; quit
```

Lalu Excel macOS → **Data** → **Get Data** → **From Database (Microsoft Query)** → pilih DSN.

> **Catatan:** Excel for Mac tidak punya menu ODBC selengkap Windows. Jika kesulitan, lihat **Alternatif** di bawah.

---

## 📦 Alternatif — Export Snapshot ke Excel

Jika ODBC terlalu ribet, gunakan script ekspor (jalankan dari root project):

```bash
python3 -c "
import sqlite3
import csv
from pathlib import Path

conn = sqlite3.connect('data/dikmen_master.db')
conn.row_factory = sqlite3.Row
out_dir = Path('data/exports')
out_dir.mkdir(exist_ok=True)

tables = ['fact_satpen_dikmen', 'fact_yayasan', 'fact_yayasan_naungan',
          'fact_stat_long', 'vw_province_satpen_summary',
          'vw_satpen_with_yayasan', 'dim_table_catalog', 'dim_province']

for t in tables:
    rows = list(conn.execute(f'SELECT * FROM {t}'))
    if not rows:
        continue
    with open(out_dir / f'{t}.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(rows[0].keys())
        w.writerows(rows)
    print(f'[OK] {t}: {len(rows)} rows')
"
```

Hasilnya di `data/exports/*.csv`, lalu di Excel: **Data** → **From Text/CSV**.

Atau gunakan `xlsxwriter` untuk satu file `.xlsx` multi-sheet:

```bash
pip install xlsxwriter
python3 scripts/export_to_xlsx.py    # (script optional; tambahkan jika perlu)
```

---

## 🔍 Query Patterns yang Berguna di Excel

Setelah connect via ODBC, gunakan **Transform Data** → **Advanced Editor** untuk SQL custom:

```sql
-- Sekolah dengan akreditasi A di Jawa Barat
SELECT npsn, nama, kab_kota, akreditasi
FROM fact_satpen_dikmen
WHERE provinsi = 'Jawa Barat' AND akreditasi = 'A';

-- Top 10 yayasan dengan sekolah naungan terbanyak
SELECT y.nama, COUNT(n.npsn) AS n_sekolah
FROM fact_yayasan y
JOIN fact_yayasan_naungan n ON n.npyp = y.npyp
GROUP BY y.npyp ORDER BY n_sekolah DESC LIMIT 10;

-- Distribusi SMK Negeri per provinsi
SELECT p.province_name, value AS jumlah
FROM fact_stat_long f
JOIN dim_province p ON p.province_kd = f.province_kd
WHERE f.kind='smk' AND f.table_code='1.1.2' AND f.col_index=1
ORDER BY value DESC;
```

---

## ⚠️ Troubleshooting

| Gejala                                  | Solusi                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| "Driver not found"                      | Pastikan bit-ness Excel (32/64) cocok dengan driver. Reinstall driver yang tepat. |
| Excel hang saat load tabel besar        | Gunakan **Transform Data** → **Keep Top N Rows** untuk filter sebelum load.       |
| Decimal `lintang`/`bujur` muncul aneh   | Set kolom ke type `Decimal Number` di Power Query.                                |
| Refresh gagal setelah file dipindahkan  | Edit DSN, point ulang ke path baru.                                               |
| File DB locked                          | Tutup koneksi lain (DB Browser, dashboard yang lagi running).                     |

---

## 🛠️ Tool Tambahan untuk Eksplorasi

- **[DB Browser for SQLite](https://sqlitebrowser.org/)** — GUI gratis untuk browse & query DB
- **[DBeaver Community](https://dbeaver.io/)** — Universal DB client, support SQLite
- **VS Code extension "SQLite Viewer"** — Inline preview di editor

Untuk vibe-coding, rekomendasi: DB Browser untuk quick checks, DBeaver untuk SQL development serius.
