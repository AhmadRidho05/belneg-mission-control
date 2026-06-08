// Idempotent: creates KKRI Pencari Arah (siswa) tables + O*NET reference
// tables + course catalog in Turso. Mirrors migrate-kkri.mjs pattern.
// Usage: node apps/belneg/scripts/migrate-siswa.mjs

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

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const steps = [];
const step = (label, sql) => steps.push({ label, sql });

// ─────────────────────────────────────────────────────────────
// Auth + profile
// ─────────────────────────────────────────────────────────────
step("siswa_users", `
  CREATE TABLE IF NOT EXISTS siswa_users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    birth_year INTEGER,
    gender TEXT CHECK (gender IN ('L','P') OR gender IS NULL),
    school_npsn TEXT,
    school_class TEXT CHECK (school_class IN ('10','11','12') OR school_class IS NULL),
    primary_career_onet TEXT,
    riasec_top_code TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_active_at TEXT,
    deleted_at TEXT
  )
`);
step("idx_siswa_users_npsn", `CREATE INDEX IF NOT EXISTS idx_siswa_users_npsn ON siswa_users(school_npsn)`);
step("idx_siswa_users_active", `CREATE INDEX IF NOT EXISTS idx_siswa_users_active ON siswa_users(is_active, deleted_at)`);
step("idx_siswa_users_top_code", `CREATE INDEX IF NOT EXISTS idx_siswa_users_top_code ON siswa_users(riasec_top_code)`);

step("siswa_otp", `
  CREATE TABLE IF NOT EXISTS siswa_otp (
    id TEXT PRIMARY KEY,
    contact TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
step("idx_siswa_otp_contact", `CREATE INDEX IF NOT EXISTS idx_siswa_otp_contact ON siswa_otp(contact, used)`);

// ─────────────────────────────────────────────────────────────
// Assessment
// ─────────────────────────────────────────────────────────────
step("siswa_assessments", `
  CREATE TABLE IF NOT EXISTS siswa_assessments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    riasec_realistic INTEGER,
    riasec_investigative INTEGER,
    riasec_artistic INTEGER,
    riasec_social INTEGER,
    riasec_enterprising INTEGER,
    riasec_conventional INTEGER,
    top_code TEXT,
    submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
step("idx_siswa_assessments_user", `CREATE INDEX IF NOT EXISTS idx_siswa_assessments_user ON siswa_assessments(user_id, submitted_at DESC)`);

step("siswa_assessment_answers", `
  CREATE TABLE IF NOT EXISTS siswa_assessment_answers (
    assessment_id TEXT NOT NULL,
    question_idx INTEGER NOT NULL,
    answer INTEGER NOT NULL,
    riasec_dim TEXT NOT NULL,
    PRIMARY KEY (assessment_id, question_idx)
  )
`);

// ─────────────────────────────────────────────────────────────
// Self-assessment + learning path + progress
// ─────────────────────────────────────────────────────────────
step("siswa_self_assessments", `
  CREATE TABLE IF NOT EXISTS siswa_self_assessments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    onet_skill_id TEXT NOT NULL,
    current_level INTEGER NOT NULL,
    target_level INTEGER NOT NULL,
    gap_category TEXT NOT NULL CHECK (gap_category IN ('critical','moderate','minimal')),
    rated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
step("idx_siswa_self_assess_user", `CREATE INDEX IF NOT EXISTS idx_siswa_self_assess_user ON siswa_self_assessments(user_id, rated_at DESC)`);
step("idx_siswa_self_assess_skill", `CREATE INDEX IF NOT EXISTS idx_siswa_self_assess_skill ON siswa_self_assessments(user_id, onet_skill_id)`);

step("siswa_learning_paths", `
  CREATE TABLE IF NOT EXISTS siswa_learning_paths (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    target_career_onet TEXT NOT NULL,
    generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ai_prompt_tokens INTEGER,
    ai_completion_tokens INTEGER,
    full_json TEXT
  )
`);
step("idx_siswa_paths_user", `CREATE INDEX IF NOT EXISTS idx_siswa_paths_user ON siswa_learning_paths(user_id, generated_at DESC)`);

step("siswa_learning_phases", `
  CREATE TABLE IF NOT EXISTS siswa_learning_phases (
    id TEXT PRIMARY KEY,
    path_id TEXT NOT NULL,
    phase_number INTEGER NOT NULL,
    title TEXT,
    estimated_weeks INTEGER,
    description TEXT,
    skill_targets TEXT,
    project_suggestion TEXT,
    social_accounts TEXT
  )
`);
step("idx_siswa_phases_path", `CREATE INDEX IF NOT EXISTS idx_siswa_phases_path ON siswa_learning_phases(path_id, phase_number)`);

step("siswa_course_progress", `
  CREATE TABLE IF NOT EXISTS siswa_course_progress (
    user_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    phase_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('belum','berproses','selesai','lompati')),
    started_at TEXT,
    completed_at TEXT,
    notes TEXT,
    PRIMARY KEY (user_id, course_id)
  )
`);
step("idx_siswa_progress_user_status", `CREATE INDEX IF NOT EXISTS idx_siswa_progress_user_status ON siswa_course_progress(user_id, status)`);
step("idx_siswa_progress_phase", `CREATE INDEX IF NOT EXISTS idx_siswa_progress_phase ON siswa_course_progress(phase_id, status)`);

// ─────────────────────────────────────────────────────────────
// Gamification
// ─────────────────────────────────────────────────────────────
step("siswa_activity_log", `
  CREATE TABLE IF NOT EXISTS siswa_activity_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    ref_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
step("idx_siswa_activity_user_day", `CREATE INDEX IF NOT EXISTS idx_siswa_activity_user_day ON siswa_activity_log(user_id, created_at DESC)`);
step("idx_siswa_activity_type", `CREATE INDEX IF NOT EXISTS idx_siswa_activity_type ON siswa_activity_log(activity_type, created_at DESC)`);

step("siswa_badges", `
  CREATE TABLE IF NOT EXISTS siswa_badges (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    badge_code TEXT NOT NULL,
    awarded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    meta TEXT,
    UNIQUE (user_id, badge_code)
  )
`);
step("idx_siswa_badges_user", `CREATE INDEX IF NOT EXISTS idx_siswa_badges_user ON siswa_badges(user_id, awarded_at DESC)`);

// ─────────────────────────────────────────────────────────────
// O*NET reference data
// ─────────────────────────────────────────────────────────────
step("onet_occupations", `
  CREATE TABLE IF NOT EXISTS onet_occupations (
    onet_soc_code TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    alt_titles TEXT
  )
`);

step("onet_skills", `
  CREATE TABLE IF NOT EXISTS onet_skills (
    element_id TEXT PRIMARY KEY,
    element_name TEXT NOT NULL,
    category TEXT
  )
`);

step("onet_knowledge", `
  CREATE TABLE IF NOT EXISTS onet_knowledge (
    element_id TEXT PRIMARY KEY,
    element_name TEXT NOT NULL,
    category TEXT
  )
`);

step("onet_interests", `
  CREATE TABLE IF NOT EXISTS onet_interests (
    onet_soc_code TEXT NOT NULL,
    riasec_dim TEXT NOT NULL CHECK (riasec_dim IN ('Realistic','Investigative','Artistic','Social','Enterprising','Conventional')),
    score REAL NOT NULL,
    PRIMARY KEY (onet_soc_code, riasec_dim)
  )
`);
step("idx_onet_interests_dim", `CREATE INDEX IF NOT EXISTS idx_onet_interests_dim ON onet_interests(riasec_dim, score DESC)`);

step("onet_occupation_skills", `
  CREATE TABLE IF NOT EXISTS onet_occupation_skills (
    onet_soc_code TEXT NOT NULL,
    element_id TEXT NOT NULL,
    importance REAL,
    level REAL,
    PRIMARY KEY (onet_soc_code, element_id)
  )
`);
step("idx_onet_occ_skills_imp", `CREATE INDEX IF NOT EXISTS idx_onet_occ_skills_imp ON onet_occupation_skills(onet_soc_code, importance DESC)`);

step("onet_occupation_knowledge", `
  CREATE TABLE IF NOT EXISTS onet_occupation_knowledge (
    onet_soc_code TEXT NOT NULL,
    element_id TEXT NOT NULL,
    importance REAL,
    level REAL,
    PRIMARY KEY (onet_soc_code, element_id)
  )
`);
step("idx_onet_occ_know_imp", `CREATE INDEX IF NOT EXISTS idx_onet_occ_know_imp ON onet_occupation_knowledge(onet_soc_code, importance DESC)`);

// ─────────────────────────────────────────────────────────────
// Course catalog + skill tags
// ─────────────────────────────────────────────────────────────
step("course_catalog", `
  CREATE TABLE IF NOT EXISTS course_catalog (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    external_id TEXT,
    title TEXT NOT NULL,
    provider TEXT,
    description TEXT,
    url TEXT NOT NULL,
    duration_hours INTEGER,
    language TEXT CHECK (language IN ('id','en') OR language IS NULL),
    price_idr INTEGER DEFAULT 0,
    rating REAL,
    level TEXT CHECK (level IN ('beginner','intermediate','advanced') OR level IS NULL),
    tagged_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
step("idx_course_catalog_active", `CREATE INDEX IF NOT EXISTS idx_course_catalog_active ON course_catalog(active, rating DESC)`);
step("idx_course_catalog_source", `CREATE INDEX IF NOT EXISTS idx_course_catalog_source ON course_catalog(source, external_id)`);
step("idx_course_catalog_lang", `CREATE INDEX IF NOT EXISTS idx_course_catalog_lang ON course_catalog(language, level)`);
step("idx_course_catalog_tagged", `CREATE INDEX IF NOT EXISTS idx_course_catalog_tagged ON course_catalog(tagged_at)`);

step("course_skill_tags", `
  CREATE TABLE IF NOT EXISTS course_skill_tags (
    course_id TEXT NOT NULL,
    onet_element_id TEXT NOT NULL,
    coverage TEXT CHECK (coverage IN ('foundational','developing','proficient') OR coverage IS NULL),
    confidence REAL,
    PRIMARY KEY (course_id, onet_element_id)
  )
`);
step("idx_course_tags_element", `CREATE INDEX IF NOT EXISTS idx_course_tags_element ON course_skill_tags(onet_element_id, confidence DESC)`);

// ─────────────────────────────────────────────────────────────
// Execute
// ─────────────────────────────────────────────────────────────
const total = steps.length;
let i = 0;
for (const s of steps) {
  i++;
  process.stdout.write(`[${String(i).padStart(2)}/${total}] ${s.label} … `);
  await client.execute(s.sql);
  console.log("OK");
}

console.log("\n✓ Done. Verifying …");
const r = await client.execute(`
  SELECT name FROM sqlite_master
  WHERE type='table' AND (name LIKE 'siswa_%' OR name LIKE 'onet_%' OR name LIKE 'course_%')
  ORDER BY name
`);
console.table(r.rows.map(x => ({ table: x.name })));

console.log(`\nTables touched: ${r.rows.length}`);
await client.close();
