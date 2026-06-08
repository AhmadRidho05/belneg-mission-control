// CRITICAL FIX: re-normalize kab_norm to preserve KOTA/KAB prefix.
//
// Before: "Kota Bandung" → "BANDUNG"  AND  "Kab. Bandung" → "BANDUNG"
//         → false-positive join: 219 + 343 = 562 schools BOTH attributed to
//           KODIM-025 (Kota) AND KODIM-036 (Kab).
//
// After:  "Kota Bandung" → "KOTA BANDUNG"  AND  "Kab. Bandung" → "KAB BANDUNG"
//         → correct disambiguation; each kodim gets its own subset.
//
// Tables affected:
//   - fact_satpen_dikmen.kab_norm
//   - dim_kodim.kabupaten_norm
//   - pilpres_wilayah.kab_norm
//
// Run once. Idempotent (re-running just re-normalizes).

import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dirname, "..", ".env.local"), "utf-8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2];
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Single source of truth normalization
function normKab(raw) {
  if (!raw) return null;
  const t = raw.trim().toUpperCase();
  // Prefix order matters: longer prefixes first
  for (const [prefix, replacement] of [
    ["KOTA ADMINISTRASI ", "KOTA "],
    ["KOTA ADM. ",         "KOTA "],
    ["KOTA ",              "KOTA "],
    ["KABUPATEN ",         "KAB "],
    ["KAB. ",              "KAB "],
    ["KAB ",               "KAB "],
  ]) {
    if (t.startsWith(prefix)) return replacement + t.slice(prefix.length).trim();
  }
  return t;  // no prefix found — keep as-is
}

async function batchUpdate(sql, args, batchSize = 200) {
  let done = 0;
  for (let i = 0; i < args.length; i += batchSize) {
    const batch = args.slice(i, i + batchSize).map(a => ({ sql, args: a }));
    await client.batch(batch, "write");
    done += batch.length;
    process.stdout.write(`\r  updated ${done.toLocaleString()}/${args.length.toLocaleString()}`);
  }
  process.stdout.write("\n");
}

// ─── 1. fact_satpen_dikmen ───
console.log("[1/3] Re-normalizing fact_satpen_dikmen.kab_norm …");
{
  const r = await client.execute("SELECT npsn, kab_kota FROM fact_satpen_dikmen WHERE kab_kota IS NOT NULL");
  const args = r.rows
    .map(row => [normKab(row.kab_kota), row.npsn])
    .filter(([n]) => n !== null);
  await batchUpdate("UPDATE fact_satpen_dikmen SET kab_norm = ? WHERE npsn = ?", args);
}

// ─── 2. dim_kodim ───
console.log("[2/3] Re-normalizing dim_kodim.kabupaten_norm …");
{
  const r = await client.execute("SELECT kodim_id, kabupaten_kota FROM dim_kodim WHERE kabupaten_kota IS NOT NULL");
  const args = r.rows
    .map(row => [normKab(row.kabupaten_kota), row.kodim_id])
    .filter(([n]) => n !== null);
  await batchUpdate("UPDATE dim_kodim SET kabupaten_norm = ? WHERE kodim_id = ?", args);
}

// ─── 3. pilpres_wilayah (if exists) ───
console.log("[3/3] Re-normalizing pilpres_wilayah.kab_norm …");
try {
  const r = await client.execute("SELECT kode_kec, nama_kab FROM pilpres_wilayah WHERE nama_kab IS NOT NULL");
  const args = r.rows
    .map(row => [normKab(row.nama_kab), row.kode_kec])
    .filter(([n]) => n !== null);
  await batchUpdate("UPDATE pilpres_wilayah SET kab_norm = ? WHERE kode_kec = ?", args);
} catch (e) {
  console.log("  (skipped — pilpres_wilayah not found)");
}

// ─── Verify ───
console.log("\n✓ Done. Verifying disambiguation for BANDUNG …");
const verify = await client.execute(`
  SELECT kab_norm, COUNT(*) AS n
  FROM fact_satpen_dikmen
  WHERE kab_norm LIKE '%BANDUNG'
  GROUP BY kab_norm
  ORDER BY kab_norm
`);
console.table(verify.rows.map(r => ({ kab_norm: r.kab_norm, schools: r.n })));

const verify2 = await client.execute(`
  SELECT kodim_id, name, kabupaten_kota, kabupaten_norm
  FROM dim_kodim
  WHERE kabupaten_norm LIKE '%BANDUNG'
  ORDER BY kabupaten_norm
`);
console.table(verify2.rows);

await client.close();
