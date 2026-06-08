// One-shot: ingest pilpres CSVs into Turso master DB.
// Usage: pnpm dlx tsx scripts/seed-pilpres.mjs  (or `node` if no TS imports)
//   reads .env.local for TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
//   reads CSVs from ../../pilpres_dataset/

import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Load .env.local
const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(resolve(__dirname, "..", ".env.local"), "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2];
}

const PILPRES_DIR = resolve(__dirname, "..", "..", "..", "pilpres_dataset");

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ─── Helpers ──────────────────────────────────────────────────────

// Normalize kab/kota name to match satpen's kab_norm column (see scripts/05_build_database.py).
function normKab(s) {
  if (!s) return null;
  let t = String(s).trim();
  for (const prefix of ["Kabupaten ", "Kab. ", "Kab ", "Kota Administrasi ", "Kota "]) {
    if (t.startsWith(prefix)) {
      t = t.slice(prefix.length);
      break;
    }
  }
  return t.toUpperCase().trim();
}

function parseCsv(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  const headers = lines[0].split(",");
  return lines.slice(1).map(line => {
    // simple CSV parser — handles double-quoted fields with commas inside
    const out = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur);
    return Object.fromEntries(headers.map((h, i) => [h, out[i] ?? ""]));
  });
}

async function batchInsert(sql, rows, batchSize = 200) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const stmts = batch.map(args => ({ sql, args }));
    await client.batch(stmts, "write");
    inserted += batch.length;
    process.stdout.write(`\r  inserted ${inserted.toLocaleString()}/${rows.length.toLocaleString()}`);
  }
  process.stdout.write("\n");
}

// ─── Step 1: schema ───────────────────────────────────────────────

console.log("[1/5] Creating pilpres tables + indexes…");
await client.execute("DROP TABLE IF EXISTS pilpres_wilayah");
await client.execute("DROP TABLE IF EXISTS pilpres_2019");
await client.execute("DROP TABLE IF EXISTS pilpres_2024");

await client.execute(`
  CREATE TABLE pilpres_wilayah (
    kode_kec  TEXT PRIMARY KEY,
    nama_kec  TEXT NOT NULL,
    kode_kab  TEXT NOT NULL,
    nama_kab  TEXT NOT NULL,
    kab_norm  TEXT NOT NULL,
    kode_prov TEXT NOT NULL,
    nama_prov TEXT NOT NULL
  )
`);
await client.execute("CREATE INDEX idx_pw_kab ON pilpres_wilayah(kode_kab)");
await client.execute("CREATE INDEX idx_pw_kabnorm ON pilpres_wilayah(kab_norm)");
await client.execute("CREATE INDEX idx_pw_prov ON pilpres_wilayah(kode_prov)");

await client.execute(`
  CREATE TABLE pilpres_2019 (
    kode_kec        TEXT PRIMARY KEY,
    votes_jokowi    INTEGER NOT NULL,
    votes_prabowo   INTEGER NOT NULL,
    suara_sah       INTEGER NOT NULL,
    suara_tidak_sah INTEGER NOT NULL,
    suara_total     INTEGER NOT NULL
  )
`);

await client.execute(`
  CREATE TABLE pilpres_2024 (
    kode_kec         TEXT PRIMARY KEY,
    votes_anies      INTEGER NOT NULL,
    votes_prabowo    INTEGER NOT NULL,
    votes_ganjar     INTEGER NOT NULL,
    suara_sah        INTEGER NOT NULL,
    suara_tidak_sah  INTEGER NOT NULL,
    jumlah_tps       INTEGER NOT NULL,
    tps_dengan_data  INTEGER NOT NULL,
    tps_coverage_pct REAL    NOT NULL
  )
`);

// ─── Step 2: wilayah ──────────────────────────────────────────────

console.log("[2/5] Ingesting wilayah_master.csv…");
{
  const rows = parseCsv(readFileSync(resolve(PILPRES_DIR, "wilayah_master.csv"), "utf-8"));
  const args = rows.map(r => [
    r.kode_kec, r.nama_kec, r.kode_kab, r.nama_kab,
    normKab(r.nama_kab),
    r.kode_prov, r.nama_prov,
  ]);
  await batchInsert(
    "INSERT OR REPLACE INTO pilpres_wilayah(kode_kec,nama_kec,kode_kab,nama_kab,kab_norm,kode_prov,nama_prov) VALUES (?,?,?,?,?,?,?)",
    args
  );
}

// ─── Step 3: 2019 ─────────────────────────────────────────────────

console.log("[3/5] Ingesting pilpres_2019_kecamatan.csv…");
{
  const rows = parseCsv(readFileSync(resolve(PILPRES_DIR, "pilpres_2019_kecamatan.csv"), "utf-8"));
  const args = rows.map(r => [
    r.kode_kec,
    parseInt(r.votes_jokowi, 10) || 0,
    parseInt(r.votes_prabowo, 10) || 0,
    parseInt(r.suara_sah, 10) || 0,
    parseInt(r.suara_tidak_sah, 10) || 0,
    parseInt(r.suara_total, 10) || 0,
  ]);
  await batchInsert(
    "INSERT OR REPLACE INTO pilpres_2019(kode_kec,votes_jokowi,votes_prabowo,suara_sah,suara_tidak_sah,suara_total) VALUES (?,?,?,?,?,?)",
    args
  );
}

// ─── Step 4: 2024 ─────────────────────────────────────────────────

console.log("[4/5] Ingesting pilpres_2024_kecamatan.csv…");
{
  const rows = parseCsv(readFileSync(resolve(PILPRES_DIR, "pilpres_2024_kecamatan.csv"), "utf-8"));
  const args = rows.map(r => [
    r.kode_kec,
    parseInt(r.votes_anies, 10) || 0,
    parseInt(r.votes_prabowo, 10) || 0,
    parseInt(r.votes_ganjar, 10) || 0,
    parseInt(r.suara_sah, 10) || 0,
    parseInt(r.suara_tidak_sah, 10) || 0,
    parseInt(r.jumlah_tps, 10) || 0,
    parseInt(r.tps_dengan_data, 10) || 0,
    parseFloat(r.tps_coverage_pct) || 0,
  ]);
  await batchInsert(
    "INSERT OR REPLACE INTO pilpres_2024(kode_kec,votes_anies,votes_prabowo,votes_ganjar,suara_sah,suara_tidak_sah,jumlah_tps,tps_dengan_data,tps_coverage_pct) VALUES (?,?,?,?,?,?,?,?,?)",
    args
  );
}

// ─── Step 5: views ────────────────────────────────────────────────

console.log("[5/5] Creating aggregation views…");
await client.execute("DROP VIEW IF EXISTS v_pilpres_kab");
await client.execute(`
  CREATE VIEW v_pilpres_kab AS
  SELECT
    w.kode_kab, w.nama_kab, w.kab_norm, w.kode_prov, w.nama_prov,
    -- 2019
    SUM(COALESCE(p19.votes_jokowi, 0))   AS sum19_jokowi,
    SUM(COALESCE(p19.votes_prabowo, 0))  AS sum19_prabowo,
    SUM(COALESCE(p19.suara_sah, 0))      AS sum19_sah,
    -- 2024 (use sum-of-paslon as denominator, per data quality notes)
    SUM(COALESCE(p24.votes_anies, 0))    AS sum24_anies,
    SUM(COALESCE(p24.votes_prabowo, 0))  AS sum24_prabowo,
    SUM(COALESCE(p24.votes_ganjar, 0))   AS sum24_ganjar,
    SUM(COALESCE(p24.jumlah_tps, 0))     AS sum24_tps_total,
    SUM(COALESCE(p24.tps_dengan_data, 0)) AS sum24_tps_covered
  FROM pilpres_wilayah w
  LEFT JOIN pilpres_2019 p19 ON p19.kode_kec = w.kode_kec
  LEFT JOIN pilpres_2024 p24 ON p24.kode_kec = w.kode_kec
  GROUP BY w.kode_kab
`);

console.log("\n✓ Done. Verifying counts…");
const counts = await client.execute(`
  SELECT 'wilayah' AS t, COUNT(*) n FROM pilpres_wilayah
  UNION ALL SELECT '2019', COUNT(*) FROM pilpres_2019
  UNION ALL SELECT '2024', COUNT(*) FROM pilpres_2024
  UNION ALL SELECT 'v_kab', COUNT(*) FROM v_pilpres_kab
`);
console.table(counts.rows.map(r => ({ table: r.t, rows: r.n })));

console.log("\n[*] Sample Prabowo dominance check:");
const sample = await client.execute(`
  SELECT nama_kab, nama_prov,
    sum24_prabowo,
    sum24_anies + sum24_prabowo + sum24_ganjar AS total,
    ROUND(100.0 * sum24_prabowo / NULLIF(sum24_anies + sum24_prabowo + sum24_ganjar, 0), 1) AS pct_prabowo_24
  FROM v_pilpres_kab
  WHERE sum24_anies + sum24_prabowo + sum24_ganjar > 50000
  ORDER BY pct_prabowo_24 DESC
  LIMIT 5
`);
console.table(sample.rows.map(r => ({
  kab: r.nama_kab, prov: r.nama_prov, pct_prabowo_24: r.pct_prabowo_24,
})));

await client.close();
