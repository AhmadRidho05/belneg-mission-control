# SEKBER DIKMEN 2025 — Data Quality Notes

> Generated from Sesi 9 deep-dive audit (2026-05-25). Sesi 5 confirmed baseline integrity (A1-A6 all pass). This file documents anomalies, cross-source gaps, and distribution observations that downstream consumers (dashboard, AI assistant, policy briefs) should be aware of.

---

## 1. Cross-Source Gap: scrape vs PDF (most important)

The scraped satpen count (Tindakan 1, `fact_satpen_dikmen`) is **lower** than the PDF national totals (Tindakan 3+4, `tabel_1_1_1.csv` row 1 "Satuan Pendidikan").

| Kind | PDF national total | Scraped (from API) | Δ | % |
|---|---:|---:|---:|---:|
| SMA | 14,822 | 13,184 | **−1,638** | **−11.1%** |
| SMK | 14,186 | 11,589 | **−2,597** | **−18.3%** |

**What's the source-of-truth gap?** Both sources cover 2025/2026 academic year, but they come from different snapshots:
- **PDF** = BPS / Kemdikbud aggregated statistical publication (year-end snapshot, possibly cumulative through 2025/2026)
- **API scrape** = live `api.data.belajar.id/data-portal-backend/v2/master-data/satuan-pendidikan/daftar-data-induk` as of 2026-05-25 (current active satpen registry)

**Likely contributing factors** (not validated, hypotheses):
1. PDF totals may include schools that closed/merged between the PDF snapshot and our scrape
2. Our client-side filter `bentukPendidikanGroup ∈ {"SMA SEDERAJAT", "SMK SEDERAJAT"}` may miss some legit dikmen bentuk that the PDF includes under SMA/SMK
3. API's `daftar-data-induk` endpoint may exclude pending/inactive satpen that the PDF includes
4. MA (Madrasah Aliyah, under Kemenag) may be counted differently — the SMA PDF appears to include only Kemdikbud schools; MA shows up in our scrape (8,541 records) but might be under a separate Kemenag PDF

**Recommendation for dashboard/AI**:
- When reporting "jumlah SMA per provinsi" or "jumlah SMK", **be explicit about source**. The two sources answer slightly different questions.
- For policy briefs / official references, **prefer PDF totals** (regulatory ground truth).
- For school-level analysis (per-NPSN drill-down), **only the scrape works** (PDFs are aggregate only).

---

## 2. Geographic Coordinates (D6)

| Metric | Value |
|---|---|
| Satpen with non-zero coords | 31,046 / 34,011 (91.3%) |
| Outside Indonesia bounding box (lat -11..6, lon 95..141) and not LUAR NEGERI | **143** |

**The 143 outliers cluster around (0.0, 0.0)** — classic "coordinates not set" data-entry artifact. Plus a few schools with valid Jakarta coords (~6.35, ~106.9) that technically sit just north of lat 6 (which is borderline; my bbox cutoff was conservative).

**Dashboard handling**: filter out `(lintang, bujur) = (0, 0)` and near-zero values when rendering map markers, otherwise you'll get a huge fake "school cluster" in the Gulf of Guinea.

```sql
-- Recommended map-marker filter
SELECT * FROM fact_satpen_dikmen
WHERE lintang IS NOT NULL AND bujur IS NOT NULL
  AND ABS(lintang) > 0.5 AND ABS(bujur) > 90;
```

---

## 3. `luas_tanah` Outliers (D8)

**212 satpen claim land area > 1,000,000 m² (= 100 hectares = 1 km²).** Schools that big are extremely rare in reality. Likely causes: unit confusion (hectares entered as m²) or trailing-zero typos.

**Dashboard handling**: cap or flag values > ~500,000 m² in any "average land per school" or "facility size" metric.

---

## 4. Yayasan-naungan Distribution (D5)

| Bucket | Count | % |
|---|---:|---:|
| 0 schools | 39,105 | 28.0% |
| Exactly 1 | 78,901 | 56.5% |
| 2–5 | 19,716 | 14.1% |
| 6–10 | 1,124 | 0.8% |
| 11–50 | 605 | 0.4% |
| **51+** | **211** | **0.2%** |

**The 0-school 28% bracket** = either yayasan that operate PAUD/SD/SMP only (not dikmen, so not in our scrape's school table), or pending/inactive foundations. Not a defect — just non-dikmen entities.

**Top 5 mega-foundations** (run a lot of schools):
| NPYP | Naungan | Foundation |
|---|---:|---|
| AJ2216 | 952 | YAYASAN GMIM DS.A.Z.R.WENAS |
| AI5406 | 872 | PKK KABUPATEN LAMONGAN |
| AE3550 | 826 | YAYASAN PENDIDIKAN MUSLIMAT NU BINA BAKTI WANITA PERWAKILAN |
| AA0760 | 682 | YAYASAN KEMALA BHAYANGKARI |
| AO5416 | 516 | PIMPINAN DAERAH MUHAMMADIYAH (PDM) KAB. KLATEN |

**Dashboard use case**: a "yayasan power-ranking" page would slice this nicely. Pin GMIM, PKK, NU, Bhayangkari, Muhammadiyah as named entities.

---

## 5. Bentuk × Status Crosstab (D4)

| Bentuk | Negeri | Swasta | Swasta share |
|---|---:|---:|---:|
| SMA | 6,584 | 6,600 | 50% |
| SMK | 3,365 | 8,224 | **71%** |
| MA | 637 | 7,904 | **93%** |
| MAK | 3 | 6 | — |
| SMAK | 2 | 73 | — |
| SMTK | 6 | 145 | — |
| SPK SMA | 0 | 130 | — |
| SPM ULYA | 0 | 215 | — |
| PDF ULYA | 0 | 68 | — |
| SMAG.K | 3 | 45 | — |
| UTTAMA DHAMMASEKHA | 0 | 1 | — |

**Observations**:
- SMA is the only group with near-parity negeri/swasta. SMK and especially MA are dominated by swasta (private/religious-foundation-run).
- The "niche" groups (SMAK, SMTK, SPK, ULYA, DHAMMASEKHA) confirm we captured the full SMA/SMK SEDERAJAT group — these are Christian/Catholic high schools (SMAK), Theological (SMTK), International/Bilingual (SPK), Madrasah Aliyah Ulya (ULYA), and Buddhist (DHAMMASEKHA).

---

## 6. Akreditasi Distribution per Province (D3, top 10 only — full data in DB)

| Province | Total | A | A% | B | C | other/null |
|---|---:|---:|---:|---:|---:|---:|
| Jawa Barat | 4,885 | 2,078 | 43% | 2,146 | 422 | 239 |
| Jawa Timur | 4,634 | 1,388 | 30% | 2,228 | 854 | 164 |
| Jawa Tengah | 2,483 | 901 | 36% | 1,046 | 408 | 128 |
| Sumatera Utara | 1,977 | 699 | 35% | 958 | 208 | 112 |
| Banten | 1,690 | 493 | 29% | 686 | 433 | 78 |
| Sulawesi Selatan | 1,528 | 444 | 29% | 720 | 305 | 59 |
| Lampung | 1,247 | 268 | 21% | 617 | 348 | 14 |
| **DKI Jakarta** | **1,195** | **752** | **63%** | 379 | 29 | 35 |
| Sumatera Selatan | 1,158 | 355 | 31% | 470 | 289 | 44 |
| Nusa Tenggara Barat | 1,125 | 219 | 19% | 460 | 349 | 97 |

**Headlines**:
- **DKI Jakarta has the highest A-share by far (63%)** — expected for the capital.
- **NTB has the lowest A-share (19%)** of the top-10 by volume — worth flagging in the dashboard's "equity" view.
- Lampung has the cleanest data (only 1% missing/other akreditasi) — possibly a recent re-accreditation drive.

---

## 7. Data Completeness — Field Coverage (D7)

### `fact_satpen_dikmen` (n=34,011)
| Field | Coverage |
|---|---|
| `lintang` | 99.0% |
| `akreditasi` | 95.5% |
| `email` | 70.1% |
| `telepon` | 62.4% |
| `website` | 48.3% |
| `npyp` | **45.0%** ← only swasta + naungan-affiliated schools have NPYP |
| `operator` | **0%** ← API gap, documented |
| `file_sk_operasional_url` | **0%** ← API gap, documented |

### `fact_yayasan` (n=139,662)
| Field | Coverage |
|---|---|
| `pimpinan` | 99.4% |
| `no_pendirian` | 81.9% |
| `email` | 59.7% |
| `no_sk_badan_hukum` | 40.2% |
| `no_pengesahan_pn_ln` | 33.9% |
| `operator` | **0%** ← API gap, documented |

**Note on `operator` / `file_sk_operasional_url`**: confirmed API-irrecoverable in Sesi 4-v2 sprint after probing all `/v1` and `/v2` sub-endpoints. See [memory/scrapers-v2-backlog.md](../.claude/projects/-Users-pijarmac1-Projects-sekber-dikmen-2025/memory/scrapers-v2-backlog.md).

---

## 8. Date-Range Sanity (D8)

`fact_yayasan.tgl_pendirian`:
- **Earliest**: 1902-06-01 (PAUD YOBEL, AB6780) — plausible for pre-independence religious foundations
- **Latest**: 2026-05-11 — recent registrations, current with scrape date (2026-05-25)

No invalid email formats (0 yayasan with `email NOT LIKE '%@%'`).

---

## 9. What to Cite vs Not Cite

For dashboard text, AI responses, or policy briefs:

| Question | Cite |
|---|---|
| "Berapa jumlah SMA di Jawa Barat?" | **PDF aggregate** (`fact_stat_long` table 1.1.2) — official |
| "List SMA di Kecamatan X" | **Scraped registry** (`fact_satpen_dikmen`) — only source with school-level detail |
| "Yayasan terbesar di Indonesia" | **Scraped registry** (`fact_yayasan` ORDER BY `n_sekolah_naungan`) |
| "Persentase akreditasi A nasional" | **Scraped registry** with explicit caveat that it's based on currently-registered schools, not 2025/2026 academic-year snapshot |
| "Posisi geografis sekolah" | **Scraped registry** with `lintang/bujur > 0.5` filter applied |
| Anything PRE-2010 about a yayasan | Treat with caution — pre-internet record completeness varies |

---

## 10. Re-running this audit

```bash
.venv/bin/python3 - <<'PY'
# (the script in this audit can be re-run from git history at commit c9433e5+)
PY
```

Or update this file by re-running the inline audit script from the Sesi 9 transcript.

**Generated**: 2026-05-25 by Sesi 9 deep-dive audit (Claude Opus 4.7 + Ferro).
