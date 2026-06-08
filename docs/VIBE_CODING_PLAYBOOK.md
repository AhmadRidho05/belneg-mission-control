# SEKBER DIKMEN 2025 — Vibe Coding Playbook

> **Audience**: Tim vibe coding (4 orang) menggunakan VS Code + Claude Code (terminal).
> **Goal**: Membangun ulang / mengoperasikan / mengembangkan SEKBER DIKMEN 2025 dari nol hingga production, dalam ±30 sesi terstruktur.
> **Filosofi**: Setiap sesi punya deliverable konkret yang bisa di-commit. Tidak ada sesi yang gantung. Setiap sesi diakhiri dengan _smoke test_ supaya bug ketahuan lebih awal.

---

## Cara Membaca Playbook Ini

Setiap **Sesi** punya struktur:
- **🎯 Tujuan** — apa yang akan selesai
- **⏱ Estimasi** — durasi kasar (asumsi 1 vibe coder)
- **📥 Input** — file/data/state sebelumnya yang dibutuhkan
- **🛠 Langkah** — prompt utama yang dilemparkan ke Claude Code + intervensi manual
- **✅ Definition of Done** — bagaimana tahu sesi selesai
- **🧪 Smoke Test** — perintah cepat untuk verifikasi

Catatan: estimasi adalah _wall-clock_ untuk satu vibe coder. Karena 4 orang paralel, beberapa fase bisa dipangkas hingga 4×.

---

## Phase 0 — Setup Environment (Sesi 1–2)

### Sesi 1: Repo Bootstrap

- **🎯 Tujuan**: Working dir bersih + tooling siap pakai.
- **⏱ Estimasi**: 30 menit.
- **📥 Input**: VS Code, Node 20+, Python 3.11+, pnpm, Git, akun Anthropic Console (API key).
- **🛠 Langkah**:
  1. `git clone <repo>` lalu `cd sekber-dikmen-2025`
  2. `pnpm install` di root → resolve workspaces
  3. `python3 -m venv .venv && source .venv/bin/activate`
  4. `pip install -r scripts/requirements.txt`
  5. Install poppler-utils (untuk `pdftotext`):
     - macOS: `brew install poppler`
     - Ubuntu: `sudo apt install poppler-utils`
     - Windows: download Poppler binary → tambahkan ke PATH
  6. Copy env: `cp apps/dashboard/.env.example apps/dashboard/.env.local`
  7. Edit `apps/dashboard/.env.local`, isi `ANTHROPIC_API_KEY=sk-ant-...`
- **✅ DoD**: `pnpm -v`, `python3 --version`, dan `pdftotext -v` semua jalan.
- **🧪 Smoke**: `which pdftotext && python3 -c "import httpx, bs4, tenacity"`

### Sesi 2: Smoke Test Pipeline (Dry Run)

- **🎯 Tujuan**: Memastikan pipeline bisa _import_ tanpa error sebelum data benar-benar di-scrape.
- **⏱ Estimasi**: 20 menit.
- **🛠 Langkah**:
  1. `python3 scripts/03_04_extract_pdf_tables.py --help` → bantuan keluar
  2. `python3 scripts/05_build_database.py --help` → bantuan keluar
  3. Buka `apps/dashboard/lib/db.ts` dan baca komentar header
- **✅ DoD**: Tidak ada `ImportError` di semua script.
- **🧪 Smoke**:
  ```bash
  for f in scripts/*.py; do python3 -c "import ast; ast.parse(open('$f').read()); print('OK $f')"; done
  ```

---

## Phase 1 — Data Pipeline (Sesi 3–10)

### Sesi 3: Extract PDF Tables (Tindakan 3 & 4)

- **🎯 Tujuan**: Hasilkan ±248 CSV file (122 SMA + 126 SMK).
- **⏱ Estimasi**: 5 menit eksekusi + 30 menit verifikasi.
- **📥 Input**: 2 file PDF di root project.
- **🛠 Langkah**:
  ```bash
  python3 scripts/03_04_extract_pdf_tables.py \
    --sma  ./statistik-sekolah-menengah-atas-sma-tahun-2025-2026-2026-sma-ma-sederajat.pdf \
    --smk  ./statistik-sekolah-menengah-kejuruan-smk-tahun-2025-2026-2026-smk-mak-sederajat.pdf \
    --out  data/extracted
  ```
- **✅ DoD**:
  - `data/extracted/sma/` berisi ≥120 file CSV
  - `data/extracted/smk/` berisi ≥125 file CSV
  - Setiap CSV punya 39 row (1 per provinsi) — **tanpa** row "Indonesia"
  - `data/extracted/manifest.json` ada dan tidak kosong
- **🧪 Smoke**:
  ```bash
  ls data/extracted/sma/*.csv | wc -l   # ≥ 120
  ls data/extracted/smk/*.csv | wc -l   # ≥ 125
  head -1 data/extracted/sma/tabel_1_1_1.csv
  wc -l data/extracted/sma/tabel_1_1_1.csv  # 40 (header + 39 prov)
  ```
- **⚠️ Gotcha**: SMA section 2.1.1 sengaja di-skip karena strukturnya bukan per-provinsi. Ini bukan bug.

### Sesi 4: Fire-and-Forget Overnight Pipeline (Tindakan 1 + 2)

> **Filosofi sesi ini**: zero-touch. Jalankan **satu** perintah, tutup laptop / terminal / SSH, dan datang lagi 1–2 jam kemudian ke database yang sudah jadi. Tidak ada yang perlu ditunggui. Tidak ada konfirmasi yang muncul. Tidak ada `[y/N]` di mana pun.

- **🎯 Tujuan**: ±140k yayasan + ±34k satuan pendidikan SMA/SMK/MA ter-scrape via JSON API, master DB dan XLSX ter-build, semuanya tanpa intervensi manual.
- **⏱ Estimasi**: **~1–2 jam** wall-clock total. Listing phase ~45–60 min (dibatasi page-size 20 server-side), detail phase ~10–15 min, build DB <1 min.
- **📥 Input**:
  - PDF sudah di-extract di Sesi 3 (recommended — kalau missing, launcher skip build-DB dan tulis `.PIPELINE_PARTIAL`).
  - Venv siap di `.venv/` dengan deps terpasang (lihat Sesi 1). Launcher reject kalau `.venv/bin/python3` tidak ada.
- **🛠 Langkah** — _persis satu perintah, tidak lebih_:
  ```bash
  bash scripts/run_unattended.sh
  ```
  Script **self-daemonize**: fork ke background via `nohup setsid`, return ke prompt < 1 detik. Anda bisa tutup terminal, disconnect SSH, atau lupakan project ini sampai 1–2 jam lagi — proses tetap jalan.

  **Apa yang dilakukan launcher otomatis** (tanpa bertanya):
  1. Pre-flight cek: `.venv/bin/python3` exists, deps importable.
  2. Sleep prevention via `caffeinate` (macOS) / `systemd-inhibit` (Linux).
  3. Spawn yayasan scraper: `02_scrape_yayasan.py --resume --concurrency 4 --delay 0.1` → 39 provinsi listing + per-yayasan naungan.
  4. Spawn dikmen scraper: `01_scrape_dikmen.py --resume --concurrency 8 --province-concurrency 4 --delay 0.05` → 39 provinsi listing (filter client-side ke SMA/SMK SEDERAJAT) + per-NPSN detail.
  5. **Auto-restart per scraper** kalau crash (sleep 60s antar attempt, safety valve di attempt #200).
  6. Poll progress tiap 5 menit → `logs/unattended-<ts>/launcher.log`.
  7. Setelah dua scraper exit clean → `05_build_database.py` (args: `--sma-dir`/`--smk-dir`/`--dikmen-db`/`--yayasan-db`/`--out`) → `06_export_to_xlsx.py`.
  8. Tulis marker `.PIPELINE_COMPLETE` saat semua sukses.

- **✅ Definition of Done**:
  ```bash
  ls logs/unattended-*/.PIPELINE_COMPLETE 2>/dev/null && echo "DONE" || echo "MASIH JALAN / GAGAL"
  ```

- **🔍 Monitoring (opsional, read-only)**:
  ```bash
  bash scripts/check_progress.sh                       # snapshot, kapan saja
  tail -f logs/unattended-*/launcher.log               # follow launcher
  tail -f logs/unattended-*/dikmen-v2.log              # follow dikmen scraper
  tail -f logs/unattended-*/yayasan-v2.log             # follow yayasan scraper
  ```

- **🛑 Stop paksa**:
  ```bash
  bash scripts/stop_unattended.sh
  ```
  Kill semua proses tanpa konfirmasi. Resume dengan `bash scripts/run_unattended.sh` lagi — progress per-provinsi di SQLite (`yayasan_province_progress`, `dikmen_province_progress`, `dikmen_detail_progress`) persistent, pekerjaan tidak terulang dari nol.

- **💡 Catatan teknis penting** (lesson-learned dari run 2026-05):
  - **Source site sekarang Next.js SPA** (`data.kemendikdasmen.go.id`). Scraper HTML lama 0% berfungsi — silent fail dengan "queue empty". v2 scraper hit JSON backend langsung di `api.data.belajar.id/data-portal-backend`. Endpoint reference lengkap ada di memory `belajar-id-api-contract.md`.
  - **Page size hard-capped 20** server-side untuk satpen, regardless of requested limit. Throughput tercapai via paralelisasi antar-provinsi (`--province-concurrency 4`) di mana tiap provinsi punya loop pagination sequential. Jangan paralelisasi page-per-province — HTTP/2 multiplexing pada httpx menyebabkan deadlock wedge (0 active connections, 0 progress).
  - **Filter `bentukPendidikan` silently ignored** oleh server. Dikmen scraper iterasi semua satpen (~3.3M total termasuk PAUD/SD/SMP) lalu filter client-side ke `bentukPendidikanGroup ∈ {"SMA SEDERAJAT", "SMK SEDERAJAT"}` → menghasilkan ~34k SMA/SMK/MA.
  - **Use HTTP/1.1, not HTTP/2** di httpx untuk concurrent fetches. HTTP/2 multiplexes pada satu koneksi yang stall bareng-bareng kalau salah satu request hang di retry. HTTP/1.1 + `httpx.Limits(max_connections=N)` memberi koneksi terpisah per request.
  - **Launch dengan `python3 -u`** supaya stdout un-buffered. Tanpa `-u`, log file kelihatan kosong padahal scraper jalan (output ke-buffer berjam-jam).
  - **Field tidak terambil** dari JSON API (lihat `scrapers-v2-backlog.md`):
    - yayasan: pimpinan, operator, email, no_pendirian, tgl_pendirian, no_pengesahan_pn_ln, no_sk_badan_hukum, tgl_sk_pengesahan
    - dikmen: operator, file_sk_operasional_url, tgl_upload_sk_op
    Semua stored NULL. Recovery butuh endpoint discovery lanjutan (deferred ke v2 sprint).

- **🧪 Smoke test (setelah `.PIPELINE_COMPLETE` muncul)**:
  ```bash
  .venv/bin/python3 -c "
  import sqlite3
  con = sqlite3.connect('database/dikmen_master.db')
  for t in ['dim_province','dim_table_catalog','fact_stat_long','fact_satpen_dikmen','fact_yayasan','fact_yayasan_naungan']:
      n = con.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
      print(f'{t:25s}: {n:,}')
  "
  ```
  Ekspektasi (baseline May 2026): `39 / 248 / 138,316 / ~34,000 / ~140,000 / ~180,000`. Angka satpen jauh lebih rendah dari estimasi lama 43k karena API source-of-truth memang segitu untuk SMA+SMK+MA aktual.

### Sesi 5: Audit Data Quality (Setelah Pipeline Selesai)

> Sesi ini dijalankan **setelah** `.PIPELINE_COMPLETE` marker muncul dari Sesi 4. Sifatnya inspeksi, bukan eksekusi panjang.

- **🎯 Tujuan**: Konfirmasi data hasil scraping konsisten + tidak ada anomali parsing.
- **⏱ Estimasi**: 30 menit.
- **🛠 Langkah**: Jalankan 6 query audit di `docs/SCHEMA.md` Section 6 (A1–A6):
  ```bash
  python3 - <<'PY'
  import sqlite3
  con = sqlite3.connect('database/dikmen_master.db')

  # A1: province_kd invalid
  print("\n=== A1: province_kd integrity ===")
  for r in con.execute("""
    SELECT 'fact_stat_long', COUNT(*) FROM fact_stat_long
      WHERE province_kd NOT IN (SELECT province_kd FROM dim_province)
    UNION ALL
    SELECT 'fact_satpen_dikmen', COUNT(*) FROM fact_satpen_dikmen
      WHERE province_kd IS NULL OR province_kd NOT IN (SELECT province_kd FROM dim_province)
    UNION ALL
    SELECT 'fact_yayasan', COUNT(*) FROM fact_yayasan
      WHERE province_kd IS NULL OR province_kd NOT IN (SELECT province_kd FROM dim_province)
  """): print(r)

  # A2: NPSN duplikat
  print("\n=== A2: NPSN duplikat ===")
  dups = con.execute("SELECT npsn, COUNT(*) FROM fact_satpen_dikmen GROUP BY npsn HAVING COUNT(*)>1 LIMIT 5").fetchall()
  print(f"  Duplikat: {len(dups)} (ekspektasi 0)")

  # A3: yayasan tanpa naungan
  print("\n=== A3: yayasan tanpa satpen-naungan ===")
  n = con.execute("""
    SELECT COUNT(*) FROM fact_yayasan y
    WHERE NOT EXISTS (SELECT 1 FROM fact_yayasan_naungan yn WHERE yn.npyp = y.npyp)
  """).fetchone()[0]
  print(f"  Count: {n:,} (yayasan non-pendidikan formal, OK)")

  # A4: catalog
  print("\n=== A4: catalog ===")
  for r in con.execute("SELECT kind, COUNT(*) FROM dim_table_catalog GROUP BY kind"):
      print(f"  {r[0]}: {r[1]} (ekspektasi sma=122 smk=126)")

  # A5: fact_stat_long distribution
  print("\n=== A5: fact_stat_long distribution ===")
  for r in con.execute("""
    SELECT kind, COUNT(*), COUNT(DISTINCT table_code), COUNT(DISTINCT province_kd)
    FROM fact_stat_long GROUP BY kind
  """):
      print(f"  {r[0]}: {r[1]:,} rows, {r[2]} tables, {r[3]} provinces")

  # A6: anomali tabel
  print("\n=== A6: tabel dengan provinsi <39 ===")
  anom = con.execute("""
    SELECT kind, table_code, COUNT(DISTINCT province_kd)
    FROM fact_stat_long GROUP BY kind, table_code
    HAVING COUNT(DISTINCT province_kd) < 39
  """).fetchall()
  print(f"  Anomali: {len(anom)} (ekspektasi 0)")
  for a in anom[:5]: print(f"    {a}")
  PY
  ```
- **✅ DoD**:
  - A1: semua angka = 0
  - A2: 0 duplikat
  - A4: sma=122, smk=126
  - A5: sma ~66k rows, smk ~72k rows
  - A6: 0 anomali

- **🔧 Kalau ada anomali**: Lihat `docs/SCHEMA.md` Section 6 untuk troubleshooting per kasus. JANGAN re-scrape full — gunakan `--resume` dan pancing ulang queue yang error.

### Sesi 6: Bangun Master Database — _Manual Fallback_

> **📌 Catatan**: Step ini otomatis dijalankan oleh launcher di Sesi 4. Jalankan **manual** hanya kalau Anda men-skip launcher, atau perlu rebuild DB setelah PDF di-extract ulang.

- **🎯 Tujuan**: Satu file `database/dikmen_master.db` yang siap dipakai dashboard dan Excel.
- **⏱ Estimasi**: 2–5 menit.
- **🛠 Langkah**:
  ```bash
  python3 scripts/05_build_database.py \
    --extracted data/extracted \
    --dikmen    data/scraped/dikmen.db \
    --yayasan   data/scraped/yayasan.db \
    --out       database/dikmen_master.db
  ```
- **✅ DoD**: File DB ada + jumlah row sesuai.
- **🧪 Smoke**:
  ```bash
  sqlite3 database/dikmen_master.db <<SQL
  SELECT 'dim_province', COUNT(*) FROM dim_province
  UNION ALL SELECT 'dim_table_catalog', COUNT(*) FROM dim_table_catalog
  UNION ALL SELECT 'fact_stat_long', COUNT(*) FROM fact_stat_long
  UNION ALL SELECT 'fact_satpen_dikmen', COUNT(*) FROM fact_satpen_dikmen
  UNION ALL SELECT 'fact_yayasan', COUNT(*) FROM fact_yayasan;
  SQL
  ```

### Sesi 7: Export ke Excel — _Manual Fallback_

> **📌 Catatan**: Step ini otomatis dijalankan oleh launcher di Sesi 4. Jalankan **manual** hanya kalau Anda ingin regenerate XLSX dengan parameter berbeda atau setelah DB di-update.

- **🎯 Tujuan**: Versi `.xlsx` untuk konsumsi non-teknis.
- **⏱ Estimasi**: 1 menit.
- **🛠 Langkah**:
  ```bash
  python3 scripts/06_export_to_xlsx.py \
    --db  database/dikmen_master.db \
    --out database/dikmen_master.xlsx
  ```
- **✅ DoD**: File `.xlsx` ≥ 15MB dengan beberapa sheet.

### Sesi 8: Setup Excel Get Data (Manual)

- **🎯 Tujuan**: Excel di laptop tim BI bisa connect langsung ke SQLite.
- **⏱ Estimasi**: 30 menit per laptop.
- **🛠 Langkah**: Ikuti `docs/EXCEL_GET_DATA_GUIDE.md` step-by-step.
- **✅ DoD**: Pivot table di Excel menampilkan KPI dari `fact_stat_long`.

### Sesi 9: Data Quality Deep-Dive — _Optional_

> **📌 Catatan**: Sesi 5 sudah menjalankan audit dasar (A1–A6). Sesi 9 ini untuk inspeksi yang lebih dalam: cross-source consistency, distribution analysis, outlier detection.

- **🎯 Tujuan**: Investigasi mendalam dan dokumentasi anomali untuk dashboard.
- **⏱ Estimasi**: 1 jam.
- **🛠 Langkah**: Jalankan query audit lanjutan di `docs/SCHEMA.md` Section 6, plus cross-check antara data scraping (Tindakan 1) vs statistik PDF (Tindakan 3+4) per provinsi.
- **✅ DoD**: Dokumentasi anomali tertulis di `docs/DATA_NOTES.md` (kalau ada).

### Sesi 10: Backup & Versioning

- **🎯 Tujuan**: Snapshot DB hasil pipeline.
- **🛠 Langkah**:
  ```bash
  cp database/dikmen_master.db database/dikmen_master_$(date +%Y%m%d).db
  ```
- **✅ DoD**: Backup ada + di-gitignore (karena ukurannya besar).

---

## Phase 2 — Dashboard Foundation (Sesi 11–18)

### Sesi 11: First Render

- **🎯 Tujuan**: Lihat halaman `/` di browser.
- **⏱ Estimasi**: 15 menit.
- **🛠 Langkah**:
  ```bash
  cd apps/dashboard && pnpm dev
  # buka http://localhost:3000
  ```
- **✅ DoD**: Halaman overview muncul, 8 KPI cards terlihat.
- **⚠️ Jika error**: Cek `lib/db.ts` — path `DIKMEN_DB_PATH` di `.env.local` harus relatif terhadap `apps/dashboard/`.

### Sesi 12: Customize Layout & Branding

- **🎯 Tujuan**: Logo Pijar / Kemenko PMK di sidebar.
- **🛠 Prompt ke Claude Code**:
  > "Edit `app/layout.tsx` — tambahkan logo SVG di header sidebar di atas judul 'SEKBER DIKMEN'. Logo ukur 48px."
- **✅ DoD**: Logo render, palette navy/gold/paper tetap.

### Sesi 13: Map Page Polish

- **🎯 Tujuan**: Choropleth Indonesia (bukan cuma circle marker).
- **⏱ Estimasi**: 2 jam.
- **🛠 Langkah**:
  1. Download GeoJSON provinsi Indonesia (resolusi sedang, ±500KB):
     ```bash
     curl -L -o apps/dashboard/public/geojson/indonesia-provinces.geojson \
       https://raw.githubusercontent.com/superpikar/indonesia-geojson/master/indonesia-province.json
     ```
  2. Prompt ke Claude Code:
     > "Modifikasi `peta-client.tsx` — replace CircleMarker dengan `GeoJSON` layer dari `/geojson/indonesia-provinces.geojson`. Style fill color dengan d3-scale chroma berdasarkan negeri share. Tooltip on hover."
- **✅ DoD**: Choropleth render, hover menampilkan KPI per provinsi.

### Sesi 14: Statistik Page UX Polish

- **🎯 Tujuan**: Tabel pivoted lebih readable + ekspor CSV per tabel.
- **🛠 Prompt**:
  > "Di `app/statistik/[kind]/[code]/page.tsx`, tambahkan tombol 'Download CSV' yang generate file dari data current table. Tambahkan sticky header + zebra striping."
- **✅ DoD**: Klik download → file CSV ter-trigger.

### Sesi 15: Jelajah Page — Map Linkage

- **🎯 Tujuan**: Filter Jelajah → highlight di Peta (tab linkage).
- **🛠 Langkah**: Pakai URL search params untuk state sync.
- **✅ DoD**: Filter "Provinsi=Jawa Barat" → URL update `?prov=jabar`, peta auto-zoom.

### Sesi 16: Performance — Query Caching

- **🎯 Tujuan**: Halaman overview load < 800ms.
- **🛠 Langkah**: Tambah `unstable_cache` Next.js untuk `kpiSummary()` & `provinceSummary()` (revalidate 1 jam).
- **✅ DoD**: Lighthouse score performance ≥ 90.

### Sesi 17: Mobile Responsiveness

- **🎯 Tujuan**: Dashboard usable di tablet (iPad portrait).
- **🛠 Prompt**:
  > "Audit semua page — pastikan grid collapse ke 1 kolom di breakpoint `md:` dan sidebar jadi drawer di breakpoint `lg:` ke bawah."

### Sesi 18: Accessibility Pass

- **🎯 Tujuan**: WCAG AA — contrast, keyboard nav, ARIA labels.
- **🛠 Langkah**: Pakai axe DevTools, fix issues yang muncul.

---

## Phase 3 — AI Features (Sesi 19–24)

### Sesi 19: Tune Prompts — Insights

- **🎯 Tujuan**: Output Insights lebih actionable, bukan generic.
- **🛠 Langkah**: Edit `lib/prompts.ts`. Iterasi `INSIGHTS_SYSTEM_ID`. Test di halaman `/insights`.
- **✅ DoD**: 4 dari 5 insights yang dihasilkan punya angka spesifik dari DB (no hallucination).

### Sesi 20: Tune Prompts — Policy

- **🎯 Tujuan**: Policy brief dengan struktur McKinsey-style (situation → complication → resolution).
- **🛠 Langkah**: Edit `POLICY_SYSTEM` di `lib/prompts.ts`.

### Sesi 21: Tune Prompts — Simulation

- **🎯 Tujuan**: Simulasi keluarkan baseline → projected → delta numerik yang grounded.
- **🛠 Langkah**: Edit `SIMULATION_SYSTEM`. Tekankan: gunakan SAAT INI angka di context, jangan invent.

### Sesi 22: Ask AI — Tool Use

- **🎯 Tujuan**: Tanya AI bisa eksekusi SQL read-only sendiri (function calling).
- **⏱ Estimasi**: 4 jam.
- **🛠 Langkah**:
  1. Tambahkan tool definition `query_database` di `route.ts` (POST chat)
  2. Loop: jika model return `tool_use`, panggil `safeReadOnlyQuery`, kirim hasil sebagai `tool_result`.
- **✅ DoD**: User tanya "Berapa SMK Negeri di Jawa Tengah?" → AI eksekusi SQL → jawab dengan angka real.

### Sesi 23: Caching AI Responses

- **🎯 Tujuan**: Hemat biaya API untuk query yang sama.
- **🛠 Langkah**: Hash `(query, model, context_snapshot)` → simpan response di Supabase (atau SQLite cache table).
- **✅ DoD**: Query yang sama tidak hit Claude API.

### Sesi 24: Cost Dashboard

- **🎯 Tujuan**: Internal page `/admin/cost` menampilkan total token usage harian.
- **🛠 Langkah**: Log setiap call ke tabel `ai_usage_log`. Aggregate di page.

---

## Phase 4 — Polish & Deploy (Sesi 25–30)

### Sesi 25: Tests

- **🎯 Tujuan**: Smoke test untuk semua API routes.
- **🛠 Langkah**: Vitest + supertest. Mock Anthropic SDK untuk AI routes.

### Sesi 26: Error Boundaries

- **🛠 Prompt**:
  > "Tambahkan `error.tsx` di tiap route group. Tampilkan pesan ramah + tombol retry. Log error ke console."

### Sesi 27: Deploy Database

- **🎯 Tujuan**: DB SQLite ter-deploy bersama Next.js (Vercel) atau dipindah ke Supabase.
- **Path A (SQLite + Vercel)**: Letakkan DB di `apps/dashboard/database/`, include di Vercel build.
- **Path B (Supabase)**: Migrasi tabel ke Postgres. Update `lib/db.ts` untuk pakai pg client.
- **Rekomendasi**: Path B untuk produksi (multi-user concurrent reads + pgvector untuk AI search nanti).

### Sesi 28: Deploy Dashboard ke Vercel

- **🛠 Langkah**:
  ```bash
  cd apps/dashboard
  vercel link
  vercel env add ANTHROPIC_API_KEY
  vercel --prod
  ```

### Sesi 29: Auth (Optional)

- **🎯 Tujuan**: Hanya tim Pijar / Kemenko PMK yang bisa akses.
- **🛠 Langkah**: NextAuth + Supabase OTP — pattern yang sudah dipakai di SIAPP.

### Sesi 30: Documentation & Handover

- **🎯 Tujuan**: User guide untuk operator non-teknis.
- **🛠 Deliverable**:
  - `docs/USER_GUIDE.md` (bilingual)
  - Loom walkthrough 10 menit
  - FAQ

---

## Lampiran A — Common Issues & Fixes

| Gejala | Kemungkinan Penyebab | Fix |
|---|---|---|
| `Error: better-sqlite3 not found` | Native binding belum di-build | `cd apps/dashboard && pnpm rebuild better-sqlite3` |
| `pdftotext: command not found` | Poppler belum ke-install | Install poppler-utils sesuai OS |
| Scraper hang | Server target rate-limiting | Turunkan `--concurrency`, tambah delay |
| Map blank | GeoJSON 404 | Cek file ada di `public/geojson/` |
| AI response kosong | API key salah / habis kuota | Cek Console Anthropic |
| Halaman `/` 500 error | `DIKMEN_DB_PATH` salah | Pastikan path relatif benar dari `apps/dashboard/` |
| `fact_stat_long` ada SMA & SMK dengan PK conflict | Bug lama di `dim_table_catalog` | Composite PK `(table_code, kind)` — sudah di-fix |
| Launcher unattended tidak detach | Shell tidak support nohup/setsid | Cek output `bash scripts/run_unattended.sh` — kalau muncul "Daemon PID", aman tutup terminal |
| `.PIPELINE_COMPLETE` tidak muncul setelah 30 jam | Ada scraper macet di restart loop | Cek `logs/unattended-*/yayasan.log` atau `dikmen.log` — kalau attempt > 50, ada masalah persistent (network/DNS/rate-limit) |
| Mau resume tapi takut double-run | Queue di-persist via SQLite WAL | Cek dulu `bash scripts/check_progress.sh`. Kalau ada PID RUNNING, JANGAN run launcher lagi |
| Laptop sleep di tengah scraping | `systemd-inhibit` / `caffeinate` tidak ada di system | Tunggu laptop bangun, scraper akan resume otomatis. Untuk depend less on this, jalankan di VPS / server |

---

## Lampiran B — Prompt Templates untuk Vibe Coder

### Template: "Tambah Page Baru"
> "Buat page baru `app/<name>/page.tsx` yang [deskripsi fungsi]. Gunakan komponen dari `@/components/ui`. Ambil data dari `lib/db.ts` function `<fnName>`. Pastikan TypeScript strict pass."

### Template: "Refactor Query"
> "Di `lib/db.ts`, function `<fnName>` saat ini lambat. Optimasi: tambah index ke kolom `<col>`, pakai prepared statement, batasi result set 1000 row. Beri komentar JSDoc bilingual."

### Template: "Tune Prompt AI"
> "Di `lib/prompts.ts`, prompt `<NAME>` saat ini menghasilkan output yang [masalah]. Revisi supaya output [target]. Pertahankan klausa no-hallucination + bilingual instruction."

### Template: "Add Chart"
> "Tambah chart di page `<path>` yang menampilkan [metrik]. Pakai Recharts. Source data dari API `/api/data?op=<op>`. Tooltip custom dengan format `formatNumber()` dari `lib/utils.ts`."

---

## Lampiran C — Definition of Vibe Coding

Vibe coding = developer human + Claude Code (LLM) bekerja sama, di mana:
- **Human** menentukan _intent_, struktur arsitektur, dan QA akhir.
- **LLM** menulis kode produksi, ngurus boilerplate, mengusulkan implementasi.
- **Iterasi cepat**: kurang dari 5 menit per loop prompt→eksekusi→review.
- **Commit kecil**: 1 commit ≈ 1 sesi atau 1 sub-task.

**Anti-pattern yang harus dihindari**:
- ❌ Copy-paste 200 baris kode tanpa baca → bug menumpuk
- ❌ Skip smoke test → bug nyangkut sampai sesi berikutnya
- ❌ Prompt vague ("buat semuanya") → output generic, harus rework
- ❌ Tidak ada git commit per sesi → diff besar, sulit di-review

**Pro-pattern**:
- ✅ Prompt eksplisit: nama file, nama function, behavior expected
- ✅ Selalu sertakan _context_: "ini bagian dari project yang punya stack X, gunakan pattern dari file Y"
- ✅ Setelah Claude generate, baca dulu, baru commit
- ✅ Kalau ragu, minta Claude generate _smoke test command_ juga

---

**End of Playbook. Selamat membangun! 🚀**
