// Seed ~500 dummy siswa across 20 schools, with synthesized RIASEC scores,
// career picks, self-assessment gaps, partial learning paths + course
// progress, and 30 days of activity log. Marked with email pattern
// "*.demo@siswa.kkri" for easy cleanup.
//
// Usage:  node apps/belneg/scripts/seed-demo-siswa.mjs [--count 500]
//         node apps/belneg/scripts/seed-demo-siswa.mjs --clean    # remove all demo siswa
//
// Idempotent: cleans existing *.demo@siswa.kkri users first, then re-seeds.

import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(resolve(__dirname, "..", ".env.local"), "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2];
}

// CLI args
let CLEAN_ONLY = false;
let COUNT = 500;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--clean") CLEAN_ONLY = true;
  if (process.argv[i] === "--count" && process.argv[i + 1]) COUNT = parseInt(process.argv[++i], 10);
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Wraps db.batch in retry. Use everywhere instead of db.batch() directly.
const batchRetry = (stmts, mode) => retry(() => db.batch(stmts, mode));

const newId = (prefix) => `${prefix}_${randomBytes(8).toString("base64url")}`;
const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const randBool = (p = 0.5) => Math.random() < p;
const DIMS = ["R", "I", "A", "S", "E", "C"];

// ─────────────────────────────────────────────────────────────────────────
// Realistic RIASEC sampling
//
// Real Indonesian SMA cohorts don't produce uniform RIASEC distributions —
// students cluster around archetypes (the "tech kid" scores high I+R+C,
// the "arts kid" high A+S, etc.). We model 8 archetypes with target dim
// profiles and weights adjusted by gender, class, and school type
// (SMA tilts academic; SMK tilts vocational). Each dim then gets Gaussian-
// ish noise. The result: spiky individual radars and lumpy aggregate
// distributions instead of flat ~60/60/60/60/60/60.
// ─────────────────────────────────────────────────────────────────────────
const ARCHETYPES = [
  { name: "tech_scientist",   weight: 0.16, profile: { R: 58, I: 80, A: 35, S: 32, E: 30, C: 65 }, std: 12,
    genderBias:  { L: 1.5, P: 0.7 },
    classBias:   { "10": 0.8, "11": 1.0, "12": 1.2 },
    bentukBias:  { SMA: 1.4, SMK: 1.2, MA: 0.5, MAK: 0.4 } },
  { name: "creative_artist",  weight: 0.13, profile: { R: 28, I: 48, A: 82, S: 56, E: 42, C: 35 }, std: 14,
    genderBias:  { L: 0.7, P: 1.4 },
    bentukBias:  { SMA: 1.2, SMK: 1.0, MA: 0.9, MAK: 0.9 } },
  { name: "helper_educator",  weight: 0.17, profile: { R: 32, I: 55, A: 55, S: 82, E: 48, C: 56 }, std: 12,
    genderBias:  { L: 0.6, P: 1.5 },
    bentukBias:  { SMA: 1.0, SMK: 0.9, MA: 1.6, MAK: 1.4 } },
  { name: "business_leader",  weight: 0.11, profile: { R: 35, I: 42, A: 45, S: 55, E: 80, C: 62 }, std: 12,
    genderBias:  { L: 1.2, P: 0.8 },
    classBias:   { "10": 0.7, "11": 1.0, "12": 1.4 } },
  { name: "practical_trades", weight: 0.10, profile: { R: 82, I: 52, A: 30, S: 35, E: 42, C: 58 }, std: 13,
    genderBias:  { L: 1.7, P: 0.4 },
    bentukBias:  { SMA: 0.3, SMK: 2.2, MA: 0.3, MAK: 1.6 } },
  { name: "investigator",     weight: 0.09, profile: { R: 45, I: 76, A: 62, S: 42, E: 30, C: 50 }, std: 13,
    bentukBias:  { SMA: 1.3, SMK: 0.7, MA: 1.1, MAK: 0.9 } },
  { name: "entrepreneur",     weight: 0.07, profile: { R: 42, I: 50, A: 62, S: 50, E: 76, C: 52 }, std: 14,
    genderBias:  { L: 1.1, P: 0.9 },
    classBias:   { "10": 0.6, "11": 1.0, "12": 1.5 } },
  { name: "generalist",       weight: 0.17, profile: { R: 50, I: 50, A: 50, S: 50, E: 50, C: 50 }, std: 18 },
];

function pickArchetype(gender, schoolClass, bentuk) {
  const weights = ARCHETYPES.map(a => {
    let w = a.weight;
    if (a.genderBias?.[gender])     w *= a.genderBias[gender];
    if (a.classBias?.[schoolClass]) w *= a.classBias[schoolClass];
    if (a.bentukBias?.[bentuk])     w *= a.bentukBias[bentuk];
    return w;
  });
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < ARCHETYPES.length; i++) {
    r -= weights[i];
    if (r <= 0) return ARCHETYPES[i];
  }
  return ARCHETYPES[ARCHETYPES.length - 1];
}

function sampleScore(target, std) {
  // Sum of 3 uniforms approximates normal — gives nicer tails than single uniform.
  const z = (Math.random() + Math.random() + Math.random()) / 3 - 0.5;
  return Math.max(0, Math.min(100, Math.round(target + z * 2 * std)));
}

function sampleRiasecForUser(gender, schoolClass, bentuk) {
  const arch = pickArchetype(gender, schoolClass, bentuk);
  const scores = {};
  for (const d of DIMS) scores[d] = sampleScore(arch.profile[d], arch.std);
  return { scores, archetype: arch.name };
}

// Exponential-ish: most signups in the last 30 days, long thin tail to 90.
// (mean ≈ 25 days, capped at 90.)
function sampleSignupDaysAgo() {
  return Math.min(90, Math.floor(-Math.log(Math.random() + 0.01) * 22));
}

// Tiny retry wrapper for transient Turso 5xx (the previous run crashed at
// user 250 with a 502). 3 attempts with linear backoff.
async function retry(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      const status = e?.cause?.status ?? e?.status;
      const retryable = status && status >= 500 && status < 600;
      if (!retryable) throw e;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

// batchRetry is defined further down once `db` exists (see line after
// createClient). Forward declaration kept as a hint.

const FIRST_NAMES = [
  "Adi","Agus","Ahmad","Aisyah","Andi","Anita","Arif","Asep","Bagus","Bayu",
  "Budi","Citra","Dani","Dewi","Dimas","Dina","Doni","Eka","Elsa","Eko",
  "Faisal","Fajar","Farhan","Fatimah","Fitri","Galih","Gita","Hadi","Hana","Hendra",
  "Ika","Indah","Iqbal","Irfan","Joko","Kartika","Lestari","Lukman","Lutfi","Mira",
  "Naufal","Nia","Nisa","Putri","Rama","Rizki","Rina","Sari","Siti","Yusuf",
];
const LAST_NAMES = [
  "Pratama","Saputra","Wijaya","Hidayat","Setiawan","Kurniawan","Rahmawati","Lestari",
  "Permata","Sari","Halim","Nugroho","Maulana","Putra","Putri","Hartono","Suryani",
  "Wibowo","Anggraini","Susanto",
];

function pickName() { return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`; }

// ─── Clean up ───
console.log("\n[clean] Removing existing demo siswa (*.demo@siswa.kkri) …");
const existing = await db.execute(`SELECT id FROM siswa_users WHERE email LIKE '%.demo@siswa.kkri'`);
console.log(`  found ${existing.rows.length} existing demo users to clean`);
for (const r of existing.rows) {
  await batchRetry([
    { sql: `DELETE FROM siswa_assessment_answers WHERE assessment_id IN (SELECT id FROM siswa_assessments WHERE user_id = ?)`, args: [r.id] },
    { sql: `DELETE FROM siswa_assessments      WHERE user_id = ?`, args: [r.id] },
    { sql: `DELETE FROM siswa_self_assessments WHERE user_id = ?`, args: [r.id] },
    { sql: `DELETE FROM siswa_course_progress  WHERE user_id = ?`, args: [r.id] },
    { sql: `DELETE FROM siswa_learning_phases  WHERE path_id IN (SELECT id FROM siswa_learning_paths WHERE user_id = ?)`, args: [r.id] },
    { sql: `DELETE FROM siswa_learning_paths   WHERE user_id = ?`, args: [r.id] },
    { sql: `DELETE FROM siswa_badges           WHERE user_id = ?`, args: [r.id] },
    { sql: `DELETE FROM siswa_activity_log     WHERE user_id = ?`, args: [r.id] },
    { sql: `DELETE FROM siswa_users            WHERE id = ?`,      args: [r.id] },
  ], "write");
}
console.log(`  ✓ cleaned ${existing.rows.length} users`);

if (CLEAN_ONLY) {
  console.log("\n--clean specified, exiting.");
  await db.close();
  process.exit(0);
}

// ─── Pick 20 SMA-family schools from fact_satpen_dikmen ───
console.log("\n[1/5] Picking 20 schools …");
// Diversify by sampling 4 schools each from 5 different provinces
const provinces = await db.execute(`
  SELECT DISTINCT provinsi FROM fact_satpen_dikmen
  WHERE bentuk_pendidikan IN ('SMA','SMK','MA','MAK')
  ORDER BY RANDOM() LIMIT 5
`);
const SCHOOLS = [];
for (const p of provinces.rows) {
  const sample = await db.execute({
    sql: `SELECT npsn, nama, provinsi, kab_kota FROM fact_satpen_dikmen
          WHERE bentuk_pendidikan IN ('SMA','SMK','MA','MAK') AND provinsi = ?
          ORDER BY RANDOM() LIMIT 4`,
    args: [p.provinsi],
  });
  SCHOOLS.push(...sample.rows);
}
console.log(`  ✓ ${SCHOOLS.length} schools across ${provinces.rows.length} provinces`);

// ─── Pull O*NET reference for realistic data ───
console.log("\n[2/5] Loading O*NET reference …");
const careersRes = await db.execute(`
  WITH occ AS (
    SELECT o.onet_soc_code, o.title,
      MAX(CASE WHEN oi.riasec_dim = 'Realistic'     THEN oi.score END) AS r,
      MAX(CASE WHEN oi.riasec_dim = 'Investigative' THEN oi.score END) AS i,
      MAX(CASE WHEN oi.riasec_dim = 'Artistic'      THEN oi.score END) AS a,
      MAX(CASE WHEN oi.riasec_dim = 'Social'        THEN oi.score END) AS s,
      MAX(CASE WHEN oi.riasec_dim = 'Enterprising'  THEN oi.score END) AS e,
      MAX(CASE WHEN oi.riasec_dim = 'Conventional'  THEN oi.score END) AS c
    FROM onet_occupations o JOIN onet_interests oi ON oi.onet_soc_code = o.onet_soc_code
    GROUP BY o.onet_soc_code
    HAVING r IS NOT NULL AND i IS NOT NULL AND a IS NOT NULL
       AND s IS NOT NULL AND e IS NOT NULL AND c IS NOT NULL
  ) SELECT * FROM occ
`);
const CAREERS = careersRes.rows;
console.log(`  ✓ ${CAREERS.length} careers with full RIASEC profile`);

const skillsRes = await db.execute(`SELECT element_id, element_name FROM onet_skills UNION ALL SELECT element_id, element_name FROM onet_knowledge`);
const ALL_ELEMENTS = skillsRes.rows;
console.log(`  ✓ ${ALL_ELEMENTS.length} skill/knowledge elements`);

const coursesRes = await db.execute(`SELECT id, title FROM course_catalog WHERE active = 1 ORDER BY RANDOM() LIMIT 200`);
const COURSES = coursesRes.rows;
console.log(`  ✓ ${COURSES.length} courses available`);

// ─── Generate siswa ───
console.log(`\n[3/5] Generating ${COUNT} demo siswa …`);
const usersToInsert = [];
for (let i = 0; i < COUNT; i++) {
  const school = pick(SCHOOLS);
  const id = newId("sis");
  const slug = `s${i}.${randomBytes(3).toString("hex")}`;
  const email = `${slug}.demo@siswa.kkri`;
  const fullName = pickName();
  const birthYear = 2026 - (15 + rand(4));  // ages 15..18
  // Slightly more girls in the dataset (matches SMA enrolment skew).
  const gender = Math.random() < 0.53 ? "P" : "L";
  // Class 11 most common (mid of SMA), 10 + 12 a bit less.
  const schoolClass = Math.random() < 0.4 ? "11" : (Math.random() < 0.5 ? "10" : "12");

  // Archetype-driven RIASEC sampling — replaces uniform 30+rand(60) which
  // produced a perfectly-balanced radar across the cohort.
  const { scores, archetype } = sampleRiasecForUser(gender, schoolClass, school.bentuk_pendidikan);
  // top_code = top 3 dims
  const topCode = DIMS.slice().sort((a,b)=> (scores[b]-scores[a]) || a.localeCompare(b)).slice(0,3).join("");

  // Pick primary career from top-5 cosine matches
  const u = scores;
  const userNorm = Math.sqrt(u.R*u.R + u.I*u.I + u.A*u.A + u.S*u.S + u.E*u.E + u.C*u.C);
  const top5 = CAREERS
    .map(c => {
      const dot = u.R*c.r + u.I*c.i + u.A*c.a + u.S*c.s + u.E*c.e + u.C*c.c;
      const norm = Math.sqrt(c.r*c.r + c.i*c.i + c.a*c.a + c.s*c.s + c.e*c.e + c.c*c.c);
      return { ...c, sim: dot / (userNorm * norm || 1) };
    })
    .sort((a,b)=>b.sim-a.sim).slice(0,5);
  const primaryCareer = pick(top5);

  // Exponential signup-age — most users signed up recently
  const createdDaysAgo = sampleSignupDaysAgo();
  const createdAt = new Date(Date.now() - createdDaysAgo * 86400000).toISOString().slice(0, 19).replace("T", " ");

  usersToInsert.push({
    id, email, fullName, birthYear, gender, schoolClass, school,
    scores, archetype, topCode, primaryCareer, createdAt, createdDaysAgo, top5,
  });
}

// Per-archetype distribution diagnostic
const archCounts = {};
for (const u of usersToInsert) archCounts[u.archetype] = (archCounts[u.archetype] || 0) + 1;
console.log("  archetype distribution:");
for (const [n, c] of Object.entries(archCounts).sort((a,b)=>b[1]-a[1])) console.log(`    ${n.padEnd(20)} ${c}`);

// Bulk INSERT users
console.log("  inserting siswa_users …");
for (let i = 0; i < usersToInsert.length; i += 50) {
  const slice = usersToInsert.slice(i, i + 50);
  await batchRetry(
    slice.map(u => ({
      sql: `INSERT INTO siswa_users (id, email, full_name, birth_year, gender, school_npsn, school_class, primary_career_onet, riasec_top_code, is_active, created_at, last_active_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      args: [u.id, u.email, u.fullName, u.birthYear, u.gender, u.school.npsn, u.schoolClass, u.primaryCareer.onet_soc_code, u.topCode, u.createdAt, u.createdAt],
    })),
    "write"
  );
  process.stdout.write(`\r  ${Math.min(i+50, COUNT)}/${COUNT}`);
}
console.log("");

// ─── Assessments + answers ───
console.log("\n[4/5] Assessments + self-assessments + paths + progress + activity …");
let assessmentsInserted = 0, selfAssessRows = 0, pathsInserted = 0, progressRows = 0, activityRows = 0;

for (const u of usersToInsert) {
  // Activity log helper
  const acts = [];
  const addAct = (type, ref, daysAgo) => {
    const ts = new Date(Date.now() - daysAgo * 86400000 - rand(86400) * 1000).toISOString().slice(0,19).replace("T"," ");
    acts.push({ id: newId("act"), user_id: u.id, activity_type: type, ref_id: ref, created_at: ts });
  };
  // signup + login
  addAct("signup", null, u.createdDaysAgo);
  for (let d = u.createdDaysAgo - 1; d > 0; d--) {
    if (Math.random() < 0.25) addAct("login", null, d);  // ~25% of days active
  }

  // Assessment (90% of users)
  let assessmentId = null;
  if (Math.random() < 0.90) {
    assessmentId = newId("ass");
    await db.execute({
      sql: `INSERT INTO siswa_assessments (id, user_id, riasec_realistic, riasec_investigative, riasec_artistic, riasec_social, riasec_enterprising, riasec_conventional, top_code, submitted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [assessmentId, u.id, u.scores.R, u.scores.I, u.scores.A, u.scores.S, u.scores.E, u.scores.C, u.topCode, u.createdAt],
    });
    assessmentsInserted++;
    addAct("assessment_done", assessmentId, Math.max(0, u.createdDaysAgo - 1));

    // Career selected (70% of those with assessment)
    if (Math.random() < 0.70) {
      addAct("career_selected", u.primaryCareer.onet_soc_code, Math.max(0, u.createdDaysAgo - 2));
    } else {
      // Clear primary_career_onet for the 30% who haven't picked
      await db.execute({ sql: `UPDATE siswa_users SET primary_career_onet = NULL WHERE id = ?`, args: [u.id] });
    }

    // Self-assessment (60% of those with assessment)
    if (Math.random() < 0.60) {
      // Pick 10 random skill/knowledge elements
      const picked = [...ALL_ELEMENTS].sort(() => Math.random() - 0.5).slice(0, 10);
      const saInserts = picked.map(el => {
        const current = 1 + rand(3);   // 1..3
        const target  = 3 + rand(3);   // 3..5
        const gap = target - current;
        const cat = gap >= 3 ? "critical" : (gap === 2 ? "moderate" : "minimal");
        return {
          sql: `INSERT INTO siswa_self_assessments (id, user_id, onet_skill_id, current_level, target_level, gap_category, rated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [newId("sass"), u.id, el.element_id, current, target, cat, u.createdAt],
        };
      });
      if (saInserts.length > 0) await batchRetry(saInserts, "write");
      selfAssessRows += saInserts.length;
      addAct("self_assessment_done", null, Math.max(0, u.createdDaysAgo - 3));

      // Learning path (75% of those with self-assess)
      if (Math.random() < 0.75) {
        const pathId = newId("path");
        await db.execute({
          sql: `INSERT INTO siswa_learning_paths (id, user_id, target_career_onet, ai_prompt_tokens, ai_completion_tokens, full_json, generated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [pathId, u.id, u.primaryCareer.onet_soc_code, 5000, 3000, JSON.stringify({demo:true}), u.createdAt],
        });
        pathsInserted++;
        addAct("learning_path_generated", pathId, Math.max(0, u.createdDaysAgo - 4));

        // 3 phases × 4–8 courses each
        const phaseInserts = [];
        const progInserts = [];
        for (let ph = 1; ph <= 3; ph++) {
          const phaseId = newId("phase");
          const phCourses = [...COURSES].sort(() => Math.random() - 0.5).slice(0, 4 + rand(5));
          phaseInserts.push({
            sql: `INSERT INTO siswa_learning_phases (id, path_id, phase_number, title, estimated_weeks, description, skill_targets, project_suggestion, social_accounts)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [phaseId, pathId, ph,
              ph===1?"Fondasi": ph===2?"Pendalaman":"Spesialisasi",
              8 + rand(8), "Demo phase description.",
              JSON.stringify([]), JSON.stringify({title:"Project demo"}), JSON.stringify([]),
            ],
          });
          // Course progress
          for (const c of phCourses) {
            const roll = Math.random();
            let status;
            if (ph === 1)      status = roll < 0.30 ? "selesai" : roll < 0.55 ? "berproses" : roll < 0.90 ? "belum" : "lompati";
            else if (ph === 2) status = roll < 0.10 ? "selesai" : roll < 0.25 ? "berproses" : "belum";
            else               status = roll < 0.05 ? "berproses" : "belum";

            let started_at = null, completed_at = null;
            if (status === "berproses" || status === "selesai") {
              const daysAgo = Math.max(0, u.createdDaysAgo - 5 - rand(20));
              started_at = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0,19).replace("T"," ");
              addAct("course_started", c.id, daysAgo);
            }
            if (status === "selesai") {
              const completedDays = Math.max(0, u.createdDaysAgo - 20 + rand(15));
              completed_at = new Date(Date.now() - completedDays * 86400000).toISOString().slice(0,19).replace("T"," ");
              addAct("course_completed", c.id, completedDays);
            }
            progInserts.push({
              sql: `INSERT OR IGNORE INTO siswa_course_progress (user_id, course_id, phase_id, status, started_at, completed_at)
                    VALUES (?, ?, ?, ?, ?, ?)`,
              args: [u.id, c.id, phaseId, status, started_at, completed_at],
            });
          }
        }
        // Batch insert phases + progress
        for (let bi = 0; bi < phaseInserts.length; bi += 50) await batchRetry(phaseInserts.slice(bi, bi + 50), "write");
        for (let bi = 0; bi < progInserts.length; bi += 50)  await batchRetry(progInserts.slice(bi, bi + 50), "write");
        progressRows += progInserts.length;
      }
    }
  }

  // Insert all activity rows
  for (let bi = 0; bi < acts.length; bi += 50) {
    await batchRetry(acts.slice(bi, bi + 50).map(a => ({
      sql: `INSERT INTO siswa_activity_log (id, user_id, activity_type, ref_id, created_at) VALUES (?,?,?,?,?)`,
      args: [a.id, a.user_id, a.activity_type, a.ref_id, a.created_at],
    })), "write");
  }
  activityRows += acts.length;

  if ((usersToInsert.indexOf(u) + 1) % 50 === 0) {
    process.stdout.write(`\r  ${usersToInsert.indexOf(u) + 1}/${COUNT} users seeded`);
  }
}
console.log("");

// ─── Award demo badges (subset) ───
console.log("\n[5/5] Awarding demo badges …");
let badgesInserted = 0;
for (const u of usersToInsert) {
  const badgesToGive = [];
  // first_assess if assessment done
  badgesToGive.push("first_assess");
  // first_self_assess maybe
  if (Math.random() < 0.55) badgesToGive.push("first_self_assess");
  if (Math.random() < 0.40) badgesToGive.push("path_generated");
  if (Math.random() < 0.30) badgesToGive.push("course_first");
  if (Math.random() < 0.10) badgesToGive.push("course_10");
  if (Math.random() < 0.20) badgesToGive.push("streak_3");
  if (Math.random() < 0.05) badgesToGive.push("streak_7");
  for (const b of badgesToGive) {
    try {
      await db.execute({
        sql: `INSERT INTO siswa_badges (id, user_id, badge_code, meta) VALUES (?,?,?,?)`,
        args: [newId("bdg"), u.id, b, "{}"],
      });
      badgesInserted++;
    } catch {}
  }
}

// ─── Summary ───
console.log("\n✓ Done.");
console.log(`  siswa_users:            ${COUNT}`);
console.log(`  siswa_assessments:      ${assessmentsInserted}`);
console.log(`  siswa_self_assessments: ${selfAssessRows}`);
console.log(`  siswa_learning_paths:   ${pathsInserted}`);
console.log(`  siswa_course_progress:  ${progressRows}`);
console.log(`  siswa_activity_log:     ${activityRows}`);
console.log(`  siswa_badges:           ${badgesInserted}`);
await db.close();
