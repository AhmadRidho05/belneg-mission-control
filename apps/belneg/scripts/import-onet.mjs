// Bulk-import O*NET reference data into Turso.
//
// Prereq: Download O*NET 28.0+ "Database Files (text)" from
//   https://www.onetcenter.org/database.html
// and extract into: <repo-root>/data/onet/
//   You should see Occupation Data.txt, Skills.txt, Knowledge.txt,
//   Interests.txt at minimum.
//
// Usage: node apps/belneg/scripts/import-onet.mjs [--data-dir <path>]
//
// Idempotent: TRUNCATEs (DELETE FROM) the four onet_* tables before
// re-inserting, since this is reference data (one source of truth per
// release of O*NET).

import { createClient } from "@libsql/client";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────
let dataDir = resolve(__dirname, "..", "..", "..", "data", "onet");
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--data-dir" && process.argv[i + 1]) {
    dataDir = resolve(process.argv[++i]);
  }
}

if (!existsSync(dataDir)) {
  console.error(`✗ Data dir not found: ${dataDir}`);
  console.error(`  Drop O*NET text files there first.`);
  console.error(`  Download: https://www.onetcenter.org/database.html`);
  process.exit(1);
}

// O*NET zips extract into a nested folder like `db_30_3_text/`. If the
// dataDir contains exactly one such subdirectory and no .txt files at the
// top level, descend into it transparently.
const topLevel = readdirSync(dataDir);
const topTxts = topLevel.filter(f => f.toLowerCase().endsWith(".txt"));
const nestedDbDirs = topLevel.filter(f =>
  /^db_\d+_\d+_text$/i.test(f) && existsSync(join(dataDir, f, "Occupation Data.txt"))
);
if (topTxts.length === 0 && nestedDbDirs.length === 1) {
  dataDir = join(dataDir, nestedDbDirs[0]);
  console.log(`↳ descended into nested O*NET dir: ${nestedDbDirs[0]}`);
}

// ─────────────────────────────────────────────────────────────
// Env + DB
// ─────────────────────────────────────────────────────────────
const envFile = readFileSync(resolve(__dirname, "..", ".env.local"), "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2];
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ─────────────────────────────────────────────────────────────
// TSV parser (O*NET files are tab-separated, header in row 1,
// values may include quoted strings with embedded tabs — handle simply)
// ─────────────────────────────────────────────────────────────
function findFile(dir, candidates) {
  const files = readdirSync(dir);
  for (const c of candidates) {
    const hit = files.find(f => f.toLowerCase() === c.toLowerCase());
    if (hit) return join(dir, hit);
  }
  return null;
}

function parseTsv(path) {
  const raw = readFileSync(path, "utf-8");
  const lines = raw.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split("\t");
  const rows = lines.slice(1).map(l => {
    const cells = l.split("\t");
    const o = {};
    for (let i = 0; i < headers.length; i++) o[headers[i]] = cells[i] ?? "";
    return o;
  });
  return { headers, rows };
}

// ─────────────────────────────────────────────────────────────
// Category derivation from O*NET Content Model element_id prefix
// (See O*NET 28 Content Model Reference)
// ─────────────────────────────────────────────────────────────
function skillCategory(elementId) {
  if (elementId.startsWith("2.A.1")) return "Basic Skills — Content";
  if (elementId.startsWith("2.A.2")) return "Basic Skills — Process";
  if (elementId.startsWith("2.B.1")) return "Social Skills";
  if (elementId.startsWith("2.B.2")) return "Complex Problem Solving Skills";
  if (elementId.startsWith("2.B.3")) return "Technical Skills";
  if (elementId.startsWith("2.B.4")) return "Systems Skills";
  if (elementId.startsWith("2.B.5")) return "Resource Management Skills";
  return null;
}

function knowledgeCategory(elementId) {
  const map = {
    "2.C.1":  "Business and Management",
    "2.C.2":  "Manufacturing and Production",
    "2.C.3":  "Engineering and Technology",
    "2.C.4":  "Mathematics and Science",
    "2.C.5":  "Health Services",
    "2.C.6":  "Education and Training",
    "2.C.7":  "Arts and Humanities",
    "2.C.8":  "Law and Public Safety",
    "2.C.9":  "Communications",
    "2.C.10": "Transportation",
  };
  for (const [prefix, name] of Object.entries(map)) {
    if (elementId.startsWith(prefix + ".") || elementId === prefix) return name;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Batch insert helper
// ─────────────────────────────────────────────────────────────
const BATCH_SIZE = 200;
async function batchInsert(label, sql, rows) {
  if (rows.length === 0) {
    console.log(`  ${label}: 0 rows — skipped`);
    return;
  }
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE);
    const stmts = slice.map(args => ({ sql, args }));
    await client.batch(stmts, "write");
    done += slice.length;
    process.stdout.write(`\r  ${label}: ${done}/${rows.length}`);
  }
  console.log("");
}

// ─────────────────────────────────────────────────────────────
// Imports
// ─────────────────────────────────────────────────────────────
console.log(`✓ Data dir: ${dataDir}\n`);

// 1. Occupations
console.log("[1/4] onet_occupations …");
const occPath = findFile(dataDir, ["Occupation Data.txt", "OccupationData.txt"]);
if (!occPath) throw new Error("Missing 'Occupation Data.txt' in data dir");
const { rows: occRows } = parseTsv(occPath);

await client.execute(`DELETE FROM onet_occupations`);
await batchInsert(
  "  insert",
  `INSERT INTO onet_occupations (onet_soc_code, title, description) VALUES (?, ?, ?)`,
  occRows.map(r => [r["O*NET-SOC Code"], r["Title"], r["Description"]]),
);

// 2. Skills (both unique skills + occupation × skill rows from same file).
// O*NET 28 had a single Skills.txt; O*NET 30+ split it into:
//   Essential Skills.txt (2.A.* basic content/process skills)
//   Transferable Skills.txt (2.B.* social/problem-solving/technical/etc)
// Schema columns are identical — we just concatenate the two.
console.log("\n[2/4] onet_skills + onet_occupation_skills …");
const skillFiles = [
  findFile(dataDir, ["Skills.txt"]),                                                      // O*NET 28 single
  findFile(dataDir, ["Essential Skills.txt"]),                                            // O*NET 30+ basic
  findFile(dataDir, ["Transferable Skills.txt"]),                                         // O*NET 30+ cross-functional
].filter(Boolean);
if (skillFiles.length === 0) {
  throw new Error("Missing skills file — expected 'Skills.txt' (O*NET 28) or 'Essential Skills.txt'+'Transferable Skills.txt' (O*NET 30+)");
}
const skillRows = skillFiles.flatMap(p => {
  console.log(`  ↳ reading ${p.split("/").pop()}`);
  return parseTsv(p).rows;
});

// Aggregate by (soc, element_id): importance from IM rows, level from LV rows
const occSkillsAgg = new Map(); // key: `${soc}::${eid}` -> {importance, level}
const skillNames = new Map();   // eid -> name
for (const r of skillRows) {
  const soc = r["O*NET-SOC Code"];
  const eid = r["Element ID"];
  const ename = r["Element Name"];
  const scale = r["Scale ID"];
  const val = parseFloat(r["Data Value"]);
  if (!soc || !eid || isNaN(val)) continue;
  skillNames.set(eid, ename);
  const key = `${soc}::${eid}`;
  const cur = occSkillsAgg.get(key) || { importance: null, level: null };
  if (scale === "IM") cur.importance = val;
  else if (scale === "LV") cur.level = val;
  occSkillsAgg.set(key, cur);
}

await client.execute(`DELETE FROM onet_skills`);
await batchInsert(
  "  onet_skills",
  `INSERT INTO onet_skills (element_id, element_name, category) VALUES (?, ?, ?)`,
  Array.from(skillNames.entries()).map(([eid, name]) => [eid, name, skillCategory(eid)]),
);

await client.execute(`DELETE FROM onet_occupation_skills`);
await batchInsert(
  "  onet_occupation_skills",
  `INSERT INTO onet_occupation_skills (onet_soc_code, element_id, importance, level) VALUES (?, ?, ?, ?)`,
  Array.from(occSkillsAgg.entries()).map(([key, v]) => {
    const [soc, eid] = key.split("::");
    return [soc, eid, v.importance, v.level];
  }),
);

// 3. Knowledge (same structure as Skills)
console.log("\n[3/4] onet_knowledge + onet_occupation_knowledge …");
const knowPath = findFile(dataDir, ["Knowledge.txt"]);
if (!knowPath) throw new Error("Missing 'Knowledge.txt' in data dir");
const { rows: knowRows } = parseTsv(knowPath);

const occKnowAgg = new Map();
const knowNames = new Map();
for (const r of knowRows) {
  const soc = r["O*NET-SOC Code"];
  const eid = r["Element ID"];
  const ename = r["Element Name"];
  const scale = r["Scale ID"];
  const val = parseFloat(r["Data Value"]);
  if (!soc || !eid || isNaN(val)) continue;
  knowNames.set(eid, ename);
  const key = `${soc}::${eid}`;
  const cur = occKnowAgg.get(key) || { importance: null, level: null };
  if (scale === "IM") cur.importance = val;
  else if (scale === "LV") cur.level = val;
  occKnowAgg.set(key, cur);
}

await client.execute(`DELETE FROM onet_knowledge`);
await batchInsert(
  "  onet_knowledge",
  `INSERT INTO onet_knowledge (element_id, element_name, category) VALUES (?, ?, ?)`,
  Array.from(knowNames.entries()).map(([eid, name]) => [eid, name, knowledgeCategory(eid)]),
);

await client.execute(`DELETE FROM onet_occupation_knowledge`);
await batchInsert(
  "  onet_occupation_knowledge",
  `INSERT INTO onet_occupation_knowledge (onet_soc_code, element_id, importance, level) VALUES (?, ?, ?, ?)`,
  Array.from(occKnowAgg.entries()).map(([key, v]) => {
    const [soc, eid] = key.split("::");
    return [soc, eid, v.importance, v.level];
  }),
);

// 4. Interests (RIASEC dim scores per occupation).
// O*NET 28: Interests.txt. O*NET 30+: Career Interest Types.txt.
// Both have Scale ID 'OI' (Occupational Interest, 1–7) with Element Name =
// one of the 6 RIASEC dims for the rows we care about.
console.log("\n[4/4] onet_interests …");
const intPath = findFile(dataDir, ["Interests.txt", "Career Interest Types.txt"]);
if (!intPath) throw new Error("Missing interests file — expected 'Interests.txt' (O*NET 28) or 'Career Interest Types.txt' (O*NET 30+)");
console.log(`  ↳ reading ${intPath.split("/").pop()}`);
const { rows: intRows } = parseTsv(intPath);

const RIASEC_DIMS = new Set(["Realistic","Investigative","Artistic","Social","Enterprising","Conventional"]);
const interestsRows = [];
for (const r of intRows) {
  const soc = r["O*NET-SOC Code"];
  const ename = r["Element Name"];
  const scale = r["Scale ID"];
  const val = parseFloat(r["Data Value"]);
  if (!soc || !ename || isNaN(val)) continue;
  if (!RIASEC_DIMS.has(ename)) continue;
  // O*NET uses OI (Occupational Interest, 1–7 scale) for the 6 RIASEC dims.
  if (scale !== "OI") continue;
  interestsRows.push([soc, ename, val]);
}

await client.execute(`DELETE FROM onet_interests`);
await batchInsert(
  "  onet_interests",
  `INSERT INTO onet_interests (onet_soc_code, riasec_dim, score) VALUES (?, ?, ?)`,
  interestsRows,
);

// ─────────────────────────────────────────────────────────────
// Final verification
// ─────────────────────────────────────────────────────────────
console.log("\n✓ Done. Counts:");
const counts = await Promise.all([
  client.execute(`SELECT COUNT(*) AS n FROM onet_occupations`),
  client.execute(`SELECT COUNT(*) AS n FROM onet_skills`),
  client.execute(`SELECT COUNT(*) AS n FROM onet_knowledge`),
  client.execute(`SELECT COUNT(*) AS n FROM onet_interests`),
  client.execute(`SELECT COUNT(*) AS n FROM onet_occupation_skills`),
  client.execute(`SELECT COUNT(*) AS n FROM onet_occupation_knowledge`),
]);
console.table([
  { table: "onet_occupations",          rows: counts[0].rows[0].n, expected: "~923 (O*NET 28)" },
  { table: "onet_skills",               rows: counts[1].rows[0].n, expected: "35" },
  { table: "onet_knowledge",            rows: counts[2].rows[0].n, expected: "33" },
  { table: "onet_interests",            rows: counts[3].rows[0].n, expected: "~5538 (923×6)" },
  { table: "onet_occupation_skills",    rows: counts[4].rows[0].n, expected: "~32k" },
  { table: "onet_occupation_knowledge", rows: counts[5].rows[0].n, expected: "~30k" },
]);

await client.close();
