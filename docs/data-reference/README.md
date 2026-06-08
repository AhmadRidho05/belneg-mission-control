# SEKBER DIKMEN 2025 — Data Reference for Downstream Apps

> Bundel referensi untuk aplikasi turunan yang menggunakan data SEKBER DIKMEN. Baca file ini dulu, lalu rujuk SCHEMA / QUERIES / DATA-NOTES sesuai kebutuhan.

## Apa yang kamu pegang

Tiga file SQLite + 4 markdown reference (ini):

| File | Ukuran | Isi |
|---|---|---|
| `dikmen_master.db` (atau `dikmen_master_YYYYMMDD.db`) | ~120 MB | DB konsolidasi star-schema. **Sumber kebenaran utama untuk aplikasi konsumen.** |
| `scraped/yayasan.db` | ~80 MB | Raw scraper output yayasan + extra fields (UUID, kode wilayah granular) yang tidak ada di master |
| `scraped/dikmen.db` | ~30 MB | Raw scraper output satpen + extra fields (UUID, kode wilayah granular, RT/RW) yang tidak ada di master |
| `docs/SCHEMA.md` | — | Setiap tabel & kolom di 3 DB, plus relasi |
| `docs/QUERIES.md` | — | Cookbook query umum (SQL + contoh kode Node/Python) |
| `docs/DATA-NOTES.md` | — | Caveat data quality, source-of-truth guide, outlier handling |

> **Untuk 90% kasus, cukup `dikmen_master.db`.** Pakai `scraped/*.db` hanya kalau aplikasi butuh UUID atau kode wilayah 6-digit Permendagri (lihat SCHEMA → bagian "Master vs Scraped").

## Headline counts (snapshot May 2026)

| Tabel | Rows | Sumber |
|---|---:|---|
| `dim_province` | 39 | hard-coded (38 prov BPS + Luar Negeri) |
| `dim_table_catalog` | 248 | dari 248 PDF tables (122 SMA + 126 SMK) |
| `fact_stat_long` | 138,316 | long-format pivot dari PDF cells |
| `fact_satpen_dikmen` | 34,011 | satpen SMA/SMK/MA (data.kemendikdasmen.go.id API) |
| `fact_yayasan` | 139,662 | yayasan pendidikan |
| `fact_yayasan_naungan` | 180,722 | relasi yayasan↔sekolah |

## 30-second quickstart

### Node.js (better-sqlite3)

```bash
npm install better-sqlite3
```

```ts
import Database from "better-sqlite3";

const db = new Database("./dikmen_master.db", { readonly: true, fileMustExist: true });
db.pragma("cache_size = -64000");   // 64MB cache
db.pragma("query_only = ON");

const top10 = db
  .prepare(`
    SELECT province_name, total_satpen, total_negeri, total_swasta
    FROM vw_province_satpen_summary
    ORDER BY total_satpen DESC
    LIMIT 10
  `)
  .all();

console.log(top10);
```

### Python (stdlib `sqlite3`)

```python
import sqlite3

con = sqlite3.connect("file:./dikmen_master.db?mode=ro", uri=True)
con.row_factory = sqlite3.Row

for r in con.execute("""
    SELECT province_name, total_satpen
    FROM vw_province_satpen_summary
    ORDER BY total_satpen DESC LIMIT 10
"""):
    print(r["province_name"], r["total_satpen"])
```

### Browser (sql.js / sqlite-wasm)

DB is ~120 MB — too big for direct browser load over network. Either (a) serve a slice via API, (b) chunk-load via [sql.js Range queries](https://github.com/sql-js/sql.js), or (c) use [SQLite WASM persistent FS](https://sqlite.org/wasm/).

## Key relationships (star schema)

```
                   dim_province (province_kd)
                          ▲
                          │
       ┌──────────────────┼──────────────────┐
       │                  │                  │
fact_satpen_dikmen   fact_yayasan    fact_yayasan_naungan
       (NPSN)          (NPYP)         (NPYP+NPSN bridge)
       │                  │                  │
       └──── NPYP ───────┴── NPYP ─────────┘
       └──── NPSN ──────────────────────────┘

fact_stat_long ──┬── (kind, table_code) → dim_table_catalog
                 └── province_kd          → dim_province
```

| Join | SQL pattern |
|---|---|
| Sekolah dengan info yayasan-nya | `fact_satpen_dikmen s LEFT JOIN fact_yayasan y ON s.npyp = y.npyp` (ada view `vw_satpen_with_yayasan` siap pakai) |
| Sekolah-sekolah di bawah yayasan tertentu | `fact_yayasan_naungan WHERE npyp = ?` |
| Statistik PDF table tertentu per provinsi | `fact_stat_long WHERE kind='sma' AND table_code='1.1.2'` (pivot via `col_index`) |
| Decode nama kolom statistik | Join `dim_table_catalog` — `column_names` adalah JSON array `[col_1_name, col_2_name, ...]` |

Detail lengkap di [SCHEMA.md](./SCHEMA.md).

## Citation policy (penting untuk dashboard / AI / report)

Master DB punya dua sumber data sekolah yang **tidak persis sama**:

| Pertanyaan | Sumber | Catatan |
|---|---|---|
| "Berapa SMA di Jawa Barat?" | **PDF aggregate** via `fact_stat_long table_code='1.1.2'` | Resmi, ground truth Kemdikbud |
| "List SMA di Kecamatan X" | **Scraped registry** via `fact_satpen_dikmen` | Satu-satunya sumber dengan detail per-sekolah |
| Counts berbeda antara dua sumber | ~11-18% gap | Lihat [DATA-NOTES.md](./DATA-NOTES.md) §1 |

## Provenance

- Source: Kemendikdasmen / BPS, statistik Sekolah Menengah Tahun Ajaran 2025/2026
- API backend: `https://api.data.belajar.id/data-portal-backend` (Belajar.id portal)
- Original pipeline repo: `github.com/ferro-del/sekber-dikmen-2025` (private)
- Snapshot date: lihat suffix filename `dikmen_master_YYYYMMDD.db` atau cek `MAX(scraped_at)` di `fact_satpen_dikmen`

## Lisensi data

Data publik dari Kemendikdasmen. Verifikasi penggunaan ulang dengan kebijakan publikasi resmi.

---

**Selanjutnya**: [SCHEMA.md](./SCHEMA.md) untuk reference lengkap, [QUERIES.md](./QUERIES.md) untuk cookbook, [DATA-NOTES.md](./DATA-NOTES.md) untuk caveat.
