// Create dim_koramil table on Turso and ingest from data/koramil.json
// (produced by convert-koramil-xlsx.py). Matches each xlsx row to its
// parent dim_kodim by 4-digit kodim code (e.g. xlsx "KODIM 0203/LANGKAT"
// → dim_kodim "Kodim 0203/..." → KODIM-NNN).
//
// Usage:  node apps/belneg/scripts/migrate-koramil.mjs
//         node apps/belneg/scripts/migrate-koramil.mjs --reset   (DROP + recreate)

import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(resolve(__dirname, "..", ".env.local"), "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2];
}

const RESET = process.argv.includes("--reset");
const JSON_PATH = resolve(__dirname, "..", "data", "koramil.json");

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function retry(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      const status = e?.cause?.status ?? e?.status;
      if (!(status && status >= 500 && status < 600)) throw e;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}
const batchRetry = (stmts, mode) => retry(() => db.batch(stmts, mode));

// ─── Schema ───
if (RESET) {
  console.log("[reset] dropping dim_koramil …");
  await db.execute(`DROP TABLE IF EXISTS dim_koramil`);
}
console.log("[1/4] creating dim_koramil if not exists …");
await db.execute(`
  CREATE TABLE IF NOT EXISTS dim_koramil (
    koramil_id TEXT PRIMARY KEY,
    kodim_id   TEXT,
    korem_id   TEXT,
    kodam_id   TEXT NOT NULL,
    name       TEXT NOT NULL,
    short_name TEXT,
    address    TEXT,
    danramil_name TEXT,
    pangkat       TEXT,
    phone_office  TEXT,
    phone_mobile  TEXT,
    bentuk_wilayah TEXT,
    raw_kodim_name TEXT,
    raw_korem_name TEXT,
    raw_kodam_name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
await db.execute(`CREATE INDEX IF NOT EXISTS idx_koramil_kodim ON dim_koramil(kodim_id)`);
await db.execute(`CREATE INDEX IF NOT EXISTS idx_koramil_korem ON dim_koramil(korem_id)`);
await db.execute(`CREATE INDEX IF NOT EXISTS idx_koramil_kodam ON dim_koramil(kodam_id)`);

// ─── Lookup map: kodim 4-digit code → kodim_id ───
console.log("[2/4] building kodim/korem/kodam lookup maps …");
const kodimRows = await db.execute(`SELECT kodim_id, korem_id, kodam_id, name FROM dim_kodim`);
const koremRows = await db.execute(`SELECT korem_id, kodam_id, name FROM dim_korem`);
const kodamRows = await db.execute(`SELECT kodam_id, name FROM dim_kodam`);

// Extract 4-digit code from name like "Kodim 0203/Aceh Jaya"
const kodimByCode = new Map();
for (const r of kodimRows.rows) {
  const m = String(r.name).match(/\b(\d{4})\b/);
  if (m) kodimByCode.set(m[1], { kodim_id: r.kodim_id, korem_id: r.korem_id, kodam_id: r.kodam_id });
}

// Korem normalization (xlsx "KOREM 022/PT" → match by 3-digit code)
const koremByCode = new Map();
for (const r of koremRows.rows) {
  const m = String(r.name).match(/\b(\d{3})\b/);
  if (m) koremByCode.set(m[1], { korem_id: r.korem_id, kodam_id: r.kodam_id });
}

// Kodam (Roman numeral I/II/III/... or ISKANDAR MUDA / JAYAKARTA names)
// Build by normalizing on the part after "KODAM "
const norm = s => String(s || "").replace(/^KODAM\s+/i, "").replace(/\s+/g, " ").trim().toUpperCase();
const kodamByNorm = new Map();
for (const r of kodamRows.rows) kodamByNorm.set(norm(r.name), r.kodam_id);

console.log(`  kodim codes: ${kodimByCode.size} · korem codes: ${koremByCode.size} · kodam norm: ${kodamByNorm.size}`);

// ─── Load + transform JSON ───
console.log("[3/4] loading koramil.json + matching FKs …");
const raw = JSON.parse(readFileSync(JSON_PATH, "utf-8"));
console.log(`  ${raw.length} koramil rows in JSON`);

let matchedKodim = 0, matchedKorem = 0, matchedKodam = 0, unmatched = 0;
const inserts = [];
const unmatchedSamples = [];

for (const r of raw) {
  // Match kodim by 4-digit code
  const kodimCode = String(r.kodim_name).match(/\b(\d{4})\b/)?.[1];
  const kodim = kodimCode ? kodimByCode.get(kodimCode) : null;
  if (kodim) matchedKodim++;

  // Match korem by 3-digit code
  const koremCode = String(r.korem_name).match(/\b(\d{3})\b/)?.[1];
  const korem = koremCode ? koremByCode.get(koremCode) : null;
  if (korem) matchedKorem++;

  // Match kodam by normalized name
  const kodam_id = kodamByNorm.get(norm(r.kodam_name)) || kodim?.kodam_id || korem?.kodam_id || null;
  if (kodam_id) matchedKodam++;

  if (!kodam_id) {
    unmatched++;
    if (unmatchedSamples.length < 5) unmatchedSamples.push(r);
    continue;
  }

  const koramilId = `KMRL-${String(r.no).padStart(5, "0")}`;
  // Extract short name like "01/BK" from "KORAMIL 01/BK"
  const shortName = String(r.koramil_name).replace(/^KORAMIL\s*-?\s*/i, "").trim();

  inserts.push({
    sql: `INSERT OR REPLACE INTO dim_koramil
            (koramil_id, kodim_id, korem_id, kodam_id, name, short_name, address,
             danramil_name, pangkat, phone_office, phone_mobile, bentuk_wilayah,
             raw_kodim_name, raw_korem_name, raw_kodam_name)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      koramilId,
      kodim?.kodim_id || null,
      korem?.korem_id || kodim?.korem_id || null,
      kodam_id,
      r.koramil_name,
      shortName,
      r.alamat,
      r.danramil_name,
      r.pangkat,
      r.phone_office,
      r.phone_mobile,
      r.bentuk,
      r.kodim_name,
      r.korem_name,
      r.kodam_name,
    ],
  });
}

console.log(`  matched: ${matchedKodim}/${raw.length} kodim · ${matchedKorem}/${raw.length} korem · ${matchedKodam}/${raw.length} kodam`);
console.log(`  unmatched (kodam): ${unmatched}`);
if (unmatchedSamples.length > 0) {
  console.log("  unmatched samples:");
  for (const s of unmatchedSamples) console.log(`    ${s.kodam_name} → ${s.kodim_name} → ${s.koramil_name}`);
}

// ─── Insert ───
console.log(`[4/4] bulk inserting ${inserts.length} rows …`);
for (let i = 0; i < inserts.length; i += 100) {
  await batchRetry(inserts.slice(i, i + 100), "write");
  process.stdout.write(`\r  ${Math.min(i + 100, inserts.length)}/${inserts.length}`);
}
console.log("");

// ─── Verify ───
const total = await db.execute(`SELECT COUNT(*) AS n FROM dim_koramil`);
const withKodim = await db.execute(`SELECT COUNT(*) AS n FROM dim_koramil WHERE kodim_id IS NOT NULL`);
const byKodam = await db.execute(`
  SELECT k.name AS kodam, COUNT(*) AS n
  FROM dim_koramil km JOIN dim_kodam k ON k.kodam_id = km.kodam_id
  GROUP BY km.kodam_id ORDER BY n DESC LIMIT 5
`);
console.log(`\n✓ dim_koramil total: ${total.rows[0].n} · with parent kodim FK: ${withKodim.rows[0].n}`);
console.log("Top 5 KODAMs by # koramil:");
console.table(byKodam.rows);
await db.close();
