# SEKBER DIKMEN 2025 — File Manifest

Snapshot package contents.

## Repository tree

```
sekber-dikmen-2025/
├── README.md                              Quickstart bilingual + arsitektur
├── MANIFEST.md                            (file ini)
├── package.json                           Monorepo root + pnpm scripts
├── pnpm-workspace.yaml
├── .gitignore
│
├── scripts/                               Data pipeline (Python)
│   ├── requirements.txt
│   ├── 01_scrape_dikmen.py               Tindakan 1: ±43k satuan pendidikan
│   ├── 02_scrape_yayasan.py              Tindakan 2: ±149k yayasan
│   ├── 03_04_extract_pdf_tables.py       Tindakan 3+4: 248 tabel statistik
│   ├── 05_build_database.py              Consolidator → SQLite master
│   └── 06_export_to_xlsx.py              Helper: SQLite → multi-sheet XLSX
│
├── database/
│   └── dikmen_master.db                   12 MB | 138,316 fact rows + 248 catalog
│
├── data/
│   └── extracted/
│       ├── sma/ ............................. 122 CSV files
│       ├── smk/ ............................. 126 CSV files
│       └── manifest.json
│
├── docs/
│   ├── EXCEL_GET_DATA_GUIDE.md           Connect Excel ke SQLite via ODBC
│   ├── AI_PROMPT_LIBRARY.md              Inventory prompt + tier strategy
│   ├── SCHEMA.md                         ERD + reference & audit queries
│   └── VIBE_CODING_PLAYBOOK.md           30-session vibe coding guide
│
└── apps/
    └── dashboard/                         Next.js 14 App Router
        ├── package.json
        ├── tsconfig.json
        ├── tailwind.config.ts
        ├── next.config.mjs
        ├── postcss.config.mjs
        ├── .env.example
        ├── app/
        │   ├── layout.tsx                Sidebar nav (8 routes)
        │   ├── page.tsx                  Overview + 8 KPI cards
        │   ├── globals.css
        │   ├── peta/                     Leaflet map (38 provinces)
        │   ├── statistik/                Browse 248 PDF tables
        │   │   └── [kind]/[code]/        Pivoted detail view
        │   ├── jelajah/                  Cross-tab + filter heatmap
        │   ├── tanya-ai/                 Streaming chat (Claude API)
        │   ├── insights/                 Auto-generated insights
        │   ├── rekomendasi/              Policy brief generator (Opus)
        │   ├── simulasi/                 What-if scenario (Opus)
        │   └── api/
        │       ├── data/                 Unified data endpoint
        │       ├── claude/                Streaming chat + safe SQL
        │       ├── insights/              Insights generator
        │       └── simulate/              Simulation/policy generator
        ├── components/
        │   ├── ui/                       Button, Card, Form, Select, Input, Textarea, Label, Badge
        │   ├── charts/                   Recharts components
        │   └── filters/                  AllFieldFilters (cascading)
        └── lib/
            ├── db.ts                     better-sqlite3 + typed queries
            ├── claude.ts                  Anthropic SDK wrapper (tier routing)
            ├── prompts.ts                 Centralized prompt library
            └── utils.ts                   formatNumber, cn, dll.
```

## Status build

| Komponen | Status | Catatan |
|---|---|---|
| Pipeline Tindakan 1 (scraper dikmen) | ✅ Built, ⚠️ untested live | 12-30h job, jalankan overnight |
| Pipeline Tindakan 2 (scraper yayasan) | ✅ Built, ⚠️ untested live | 8-14h job |
| Pipeline Tindakan 3+4 (PDF extractor) | ✅ Validated | 248 CSVs, 39 rows each |
| Master DB consolidator | ✅ Validated | 138,316 fact rows produced |
| XLSX export helper | ✅ Validated | Multi-sheet output works |
| Dashboard 8 pages | ✅ Coded | Belum di-run `pnpm dev` di env Ferro |
| 4 API routes | ✅ Coded | Streaming chat + safe SQL guards |
| Bilingual docs | ✅ Complete | README + 4 docs |
| Vibe coding playbook | ✅ Complete | 30 sesi terstruktur |

## Cara mulai (operator)

```bash
cd sekber-dikmen-2025
pnpm install
cd apps/dashboard
cp .env.example .env.local
# edit .env.local → isi ANTHROPIC_API_KEY
pnpm dev
# buka http://localhost:3000
```

Dashboard sudah punya 248 tabel statistik + 39 provinsi siap pakai.
Untuk Tindakan 1+2 (scraping), lihat `docs/VIBE_CODING_PLAYBOOK.md` Sesi 4-5.
