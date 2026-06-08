# AI Prompt Library — Sekber Dikmen 2025

> **Single source of truth** untuk semua system prompt. Edit di `apps/dashboard/lib/prompts.ts`,
> bukan inline di route handlers.

---

## 🎯 Filosofi Tiering

| Tier | Model | Tujuan | Token Budget | Temperature |
| --- | --- | --- | --- | --- |
| **Haiku** | `claude-haiku-4-5-20251001` | Routing, NL→SQL, klasifikasi | ≤ 256 | 0–0.1 |
| **Sonnet** | `claude-sonnet-4-6` | Insights, ask-AI, actionable | 2048–3000 | 0.3–0.4 |
| **Opus** | `claude-opus-4-7` | Policy briefs, simulasi | 4096+ | 0.3–0.4 |

**Aturan:** kalau output JSON terstruktur dibutuhkan, **selalu** spesifikasikan format di system prompt dan minta model output JSON saja (no fence, no preamble). Parser di route handler akan strip `\`\`\`json` defensif.

---

## 📚 Inventarisasi Prompt

### 1. `SCHEMA_BRIEF`
Cuplikan skema DB injected ke semua prompt yang butuh grounding. Update kalau skema berubah.

### 2. `ASK_AI_SYSTEM_ID` / `ASK_AI_SYSTEM_EN`
Untuk halaman **Tanya AI**. Dua varian:
- **_ID** — Bahasa Indonesia, gaya executive briefing
- **_EN** — English, identical structure

Auto-injection di route handler:
```ts
system += `\n\nCONTEXT SNAPSHOT: KPI=${kpi} TOP_10=${top10}`;
```
Sehingga model punya angka anchoring tanpa perlu tool calls.

### 3. `SQL_GENERATOR_SYSTEM`
Mengubah NL → SQLite SELECT yang aman. Strictly read-only, auto-LIMIT 100.

**Cara pakai dari kode:**
```ts
const sql = await ask([{ role: "user", content: "berapa SMK negeri di Bali" }], {
  tier: "haiku",
  system: SQL_GENERATOR_SYSTEM,
  maxTokens: 200,
  temperature: 0,
});
const result = safeReadOnlyQuery(sql);
```

### 4. `INSIGHTS_SYSTEM`
Sonnet tier. Output: JSON array 5–8 insight, format McKinsey action-title.

**Severity bucket:**
- `info` — observasi netral
- `warning` — ketimpangan signifikan, perlu attention
- `critical` — kesenjangan akut, butuh intervensi segera

### 5. `ACTIONABLE_SYSTEM`
Sonnet tier. Input: array insights → output: array actionable steps dengan fields {what, who, when, kpi}.

**Konvensi "when":**
- `Quick win` — < 90 hari
- `Q1 2026`, `Q2 2026`, ... — kuartal spesifik
- `Strategic` — > 12 bulan, lintas-RPJMN

### 6. `POLICY_SYSTEM`
Opus tier. Output: Markdown brief dengan struktur:
- Executive Summary
- Kondisi Saat Ini
- Akar Masalah
- Rekomendasi Strategis (REK-1, REK-2, ...)
- Risiko & Mitigasi
- KPI Pengukuran

Cocok untuk Eselon I / Pimpinan K/L.

### 7. `SIMULATION_SYSTEM`
Opus tier. Output: JSON simulation result. Required keys:
- `scenario_summary`, `assumptions[]`, `baseline_metrics`, `projected_metrics`
- `delta`, `winners[]`, `losers[]`, `risks[]`
- `investment_estimate_idr`, `confidence`, `narrative`

**Confidence calibration:**
- `low` — banyak asumsi yang tidak ada di data
- `medium` — beberapa ekstrapolasi reasonable
- `high` — semua angka derivable dari baseline + asumsi standar

---

## 🔄 Cara Edit & Test

### Edit prompt
```bash
code apps/dashboard/lib/prompts.ts
```

### Test cepat (di dashboard yang lagi running)

1. **Ask AI**: buka `/tanya-ai`, ketik pertanyaan, lihat output langsung.
2. **Insights**: `/insights` → pilih scope → Generate. Cek format JSON valid.
3. **Policy**: `/rekomendasi` → ketik skenario → Generate Brief. Cek Markdown render.
4. **Simulasi**: `/simulasi` → pilih template → Run. Cek delta logic.

### Test programmatic (curl)

```bash
# Insights
curl -s "http://localhost:3000/api/insights?scope=akreditasi" | jq .

# Simulasi
curl -s -X POST http://localhost:3000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{"scenario":"Bangun 100 SMK baru di Sulawesi","mode":"simulate"}' | jq .

# Chat
curl -N -X POST http://localhost:3000/api/claude \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Top 3 provinsi paling timpang"}],"tier":"sonnet"}'
```

---

## ⚠️ No-Hallucination Guardrails

Setiap prompt **harus** mengandung:

1. **Schema grounding** — sertakan `SCHEMA_BRIEF` atau snapshot data konkret di system message.
2. **Anti-fabrication clause** — eksplisit minta "jika tidak yakin, sebut data tidak tersedia".
3. **Citation requirement** — minta model sebutkan table_code/col_index yang dijadikan basis.
4. **Bound output format** — JSON schema atau Markdown skeleton untuk mencegah meandering.

Contoh anti-fabrication clause yang efektif:

```
JANGAN MENGARANG ANGKA. Jika data tidak ada di context yang di-attach, jawab:
"Data spesifik untuk [topik] tidak tersedia di dataset yang dikonsolidasi.
Sumber yang relevan kemungkinan: [referensi eksternal]."
```

---

## 🌱 Menambahkan Prompt Baru

1. Tambahkan konstanta ekspor di `prompts.ts`
2. Tambahkan/edit route handler di `app/api/*/route.ts`
3. Tambahkan UI trigger di halaman terkait
4. **Test** di 3 mode: success path, parse error, API error
5. Dokumentasikan di file ini dengan tier + budget yang sesuai

---

## 📊 Cost Monitoring (Quick Math)

Dengan asumsi pricing Claude API 2026 dan profil user Pijar:
- **Haiku** — ~$0.001 per query NL→SQL (target volume tinggi, ratusan/hari)
- **Sonnet** — ~$0.02 per insight pack (target medium, 10–50/hari)
- **Opus** — ~$0.15 per policy brief / simulasi (target rendah, 5–20/hari)

Estimasi monthly burn untuk 1 tim policy researcher aktif: ~$200–$500.

> Cek `https://docs.claude.com/en/docs/about-claude/pricing` untuk angka terkini.
