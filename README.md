# SEKBER DIKMEN 2025

> **Sistem Intelijen Pendidikan Menengah Indonesia**
> SMA · SMK · MA · Yayasan · Statistik Nasional 2025/2026
>
> _Pijar Foundation × Kemenko PMK · No-Hallucination Data Policy_

---

## 🎯 Apa Ini? / What Is This?

**ID** — Sebuah platform end-to-end untuk konsolidasi data pendidikan menengah Indonesia: ~43.144 satuan pendidikan (SMA/SMK/MA), ~148.693 yayasan pendidikan, dan 248 tabel statistik resmi KEMENDIKDASMEN, dirakit menjadi satu *relational database* SQLite yang bisa dibuka langsung dari Excel + sebuah dashboard interaktif berbasis Claude AI.

**EN** — An end-to-end platform consolidating Indonesia's secondary education data: ~43,144 schools (SMA/SMK/MA), ~148,693 education foundations, and 248 official statistical tables from KEMENDIKDASMEN — packaged into a single SQLite database accessible from Excel + a Claude-powered interactive dashboard.

---

## 🏗️ Arsitektur

```
┌─────────────────────────────────────────────────────────────────┐
│  DATA SOURCES                                                   │
│  ──────────────                                                 │
│  ① referensi.data.kemendikdasmen.go.id  →  43,144 satpen        │
│  ② data.kemendikdasmen.go.id/yayasan    →  148,693 yayasan      │
│  ③ Statistik SMA 2025/2026 PDF          →  122 tabel            │
│  ④ Statistik SMK 2025/2026 PDF          →  126 tabel            │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  PYTHON PIPELINE (scripts/)                                     │
│  • 01_scrape_dikmen.py   — async, resume-able, ~12–30h          │
│  • 02_scrape_yayasan.py  — async, resume-able, ~15–40h          │
│  • 03_04_extract_pdf_tables.py — poppler + regex, 5 min         │
│  • 05_build_database.py  — star-schema consolidator             │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  data/dikmen_master.db  (SQLite, ~600MB after full scrape)      │
│                                                                 │
│  dim_province (39)                                              │
│  dim_table_catalog (248)                                        │
│  fact_satpen_dikmen (43,144)                                    │
│  fact_yayasan (148,693)                                         │
│  fact_yayasan_naungan (1-N bridge)                              │
│  fact_stat_long (138,316 rows long-format stats)                │
│  vw_satpen_with_yayasan, vw_province_satpen_summary             │
└─────────────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┴─────────────────┐
        ▼                                   ▼
┌──────────────────┐              ┌──────────────────────────┐
│ Excel Get Data   │              │ Next.js Dashboard        │
│ (ODBC SQLite)    │              │ (Claude AI · Haiku/      │
│                  │              │  Sonnet/Opus tiered)     │
└──────────────────┘              └──────────────────────────┘
```

---

## 🚀 Quick Start

### 0. Prasyarat / Prerequisites

```bash
# System packages
sudo apt-get install python3 python3-pip poppler-utils   # Ubuntu
# OR
brew install python poppler                              # macOS

# Node + pnpm (untuk dashboard)
nvm install 20 && npm install -g pnpm

# Python deps
pip install -r scripts/requirements.txt
```

### 1. Jalankan Pipeline Data

```bash
# OPSI A — pipeline lengkap (4 tindakan + DB)
# Total runtime: ~30–70 jam tergantung jaringan untuk scraping
pnpm pipeline:full

# OPSI B — hanya offline (PDF + DB), tanpa scraping
# Total runtime: ~5 menit
pnpm pipeline:offline

# OPSI C — jalankan satu per satu
pnpm scrape:dikmen      # Tindakan 1 (~12–30h)
pnpm scrape:yayasan     # Tindakan 2 (~15–40h)
pnpm extract:pdf        # Tindakan 3 & 4 (~5 min)
pnpm build:db           # Konsolidasi
```

### 2. Buka Database dari Excel

Lihat panduan lengkap di **[`docs/EXCEL_GET_DATA_GUIDE.md`](docs/EXCEL_GET_DATA_GUIDE.md)**.

Singkatnya:
1. Install [SQLite ODBC Driver](http://www.ch-werner.de/sqliteodbc/)
2. Excel → Data → Get Data → From Other Sources → From ODBC
3. Pilih driver SQLite3, point ke `data/dikmen_master.db`
4. Pilih tabel atau view, klik Load

### 3. Jalankan Dashboard

```bash
cd apps/dashboard
cp .env.example .env.local
# Edit .env.local — minimal: ANTHROPIC_API_KEY

pnpm install
pnpm dev
```

Buka http://localhost:3000

---

## 🧭 Halaman Dashboard

| Route             | Fungsi                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------- |
| `/`               | **Ringkasan** — 8 KPI utama + chart Top 15 provinsi + donut Negeri/Swasta              |
| `/peta`           | **Peta Sebaran** — Leaflet choropleth, klik provinsi untuk KPI detail                  |
| `/statistik`      | **Statistik Tabel** — Browser 248 tabel resmi, klik untuk drill-down per provinsi      |
| `/jelajah`        | **Jelajah Data** — All-field filter + cross-tab heatmap (9 dimensi × 9 dimensi)        |
| `/tanya-ai`       | **Tanya AI** — Chat streaming dengan context auto-injection (Haiku/Sonnet/Opus)        |
| `/insights`       | **Insights** — 5–8 temuan AI per lensa (Overview/Akreditasi/Wilayah/Yayasan)           |
| `/rekomendasi`    | **Rekomendasi** — Brief kebijakan executive-grade (Opus tier)                          |
| `/simulasi`       | **Simulasi** — What-if scenario dengan delta proyeksi (Opus tier)                      |

---

## 🤖 Claude AI Tier Strategy

Tiering mengikuti pola standar Pijar Foundation: cheap for routing, expensive for synthesis.

| Tier   | Model              | Use Case                                  | Cost Profile |
| ------ | ------------------ | ----------------------------------------- | ------------ |
| Haiku  | `claude-haiku-4-5` | Intent routing, NL→SQL, quick lookups     | $            |
| Sonnet | `claude-sonnet-4-6`| Insights, Ask AI default, actionable steps| $$           |
| Opus   | `claude-opus-4-7`  | Policy briefs, simulations, deep synthesis| $$$          |

Edit `apps/dashboard/lib/prompts.ts` untuk men-tweak prompt; tier per-feature di-route di `app/api/*/route.ts`.

---

## 📦 Repository Layout

```
sekber-dikmen-2025/
├── scripts/                          # Python data pipeline
│   ├── 01_scrape_dikmen.py          # Tindakan 1
│   ├── 02_scrape_yayasan.py         # Tindakan 2
│   ├── 03_04_extract_pdf_tables.py  # Tindakan 3 & 4
│   ├── 05_build_database.py         # Konsolidasi
│   └── requirements.txt
├── apps/dashboard/                   # Next.js 14 app
│   ├── app/                         # 8 pages + 4 API routes
│   ├── components/                  # UI + filters + charts
│   ├── lib/                         # db, claude, prompts, utils
│   └── public/
├── data/                            # Generated artifacts (gitignored)
│   ├── extracted/sma/               # 122 CSVs from PDF #1
│   ├── extracted/smk/               # 126 CSVs from PDF #2
│   ├── scraped/                     # Intermediate SQLite stores
│   └── dikmen_master.db             # FINAL relational DB
└── docs/                            # User-facing documentation
    ├── EXCEL_GET_DATA_GUIDE.md
    ├── AI_PROMPT_LIBRARY.md
    └── VIBE_CODING_PLAYBOOK.md
```

---

## ⚠️ No-Hallucination Data Policy

Sesuai standar Pijar Foundation:

1. **PDF extractor** validasi setiap baris terhadap KD provinsi resmi BPS. Baris yang tidak dikenali di-quarantine, bukan di-coerce.
2. **Scraper** menggunakan `INSERT OR REPLACE` dengan idempoten PK (NPSN/NPYP); tidak ada baris duplikat.
3. **AI feature** menyertakan source table + column dalam respons; jika tidak yakin, sistem menjawab "data tidak tersedia" bukan mengarang.
4. **Ask AI** boleh menjalankan SQL, tetapi hanya `SELECT` / `WITH` — dengan regex blacklist untuk write ops.

---

## 📚 Dokumentasi Lanjutan

- **[VIBE_CODING_PLAYBOOK.md](docs/VIBE_CODING_PLAYBOOK.md)** — Panduan session-by-session untuk lanjutan/perbaikan
- **[EXCEL_GET_DATA_GUIDE.md](docs/EXCEL_GET_DATA_GUIDE.md)** — Setup Excel ODBC SQLite step-by-step
- **[AI_PROMPT_LIBRARY.md](docs/AI_PROMPT_LIBRARY.md)** — Semua system prompt + rationale
- **[SCHEMA.md](docs/SCHEMA.md)** — ERD + reference query patterns

---

## 🏷️ Lisensi & Atribusi

Sumber data:
- **referensi.data.kemendikdasmen.go.id** — Dapodik / KEMENDIKDASMEN RI
- **data.kemendikdasmen.go.id** — KEMENDIKDASMEN RI
- **Statistik Sekolah Menengah 2025/2026** — KEMENDIKDASMEN RI

Pipeline & dashboard code: © 2026 Pijar Foundation. Untuk penggunaan internal Kemenko PMK + mitra Pijar.

---

_Built with Claude Code in VS Code · vibe-coded by Ferro (Pijar Foundation)_
