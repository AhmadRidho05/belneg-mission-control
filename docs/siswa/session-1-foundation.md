# Session 1 — Foundation: DB schema + O*NET ingestion

> **Workspace**: BELNEG Mission Control (this repo, `apps/belneg/`)
> **Prereq**: Read [ARCHITECTURE.md](./ARCHITECTURE.md) first.
> **Estimated time**: 1-2 hours

## What this session builds

The structural foundation for **KKRI Pencari Arah**. After this session you'll have:
- All new DB tables created in Turso (idempotent migration)
- O*NET data imported (occupations, skills, knowledge, interests)
- Course catalog table ready (empty — populated in S4)
- Verification scripts to confirm data integrity

No API endpoints yet. No mobile-facing code. Just data layer.

## State assumed from previous work

- Turso libSQL connection working (already serving Pembina KKRI)
- `apps/belneg/scripts/migrate-*.mjs` pattern established
- `apps/belneg/app/api/v1/_lib.ts` (qAll/qGet/qRun helpers)
- `fact_satpen_dikmen` table exists with SMA records

## Concrete deliverables

### 1. Migration script `scripts/migrate-siswa.mjs`

Idempotent (CREATE TABLE IF NOT EXISTS). Tables:

**Auth + profile:**
```sql
siswa_users (
  id TEXT PK,             -- 'sis_' + nanoid(16)
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  birth_year INTEGER,
  gender TEXT CHECK (gender IN ('L', 'P', NULL)),
  school_npsn TEXT,       -- FK to fact_satpen_dikmen.npsn (nullable)
  school_class TEXT,      -- '10', '11', '12'
  primary_career_onet TEXT, -- onet_soc_code chosen by user as target
  riasec_top_code TEXT,   -- 3-letter Holland code, e.g. 'RIA'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_active_at TEXT,
  deleted_at TEXT
)
siswa_otp (same shape as kkri_otp)
```

**Assessment:**
```sql
siswa_assessments (
  id TEXT PK,
  user_id TEXT FK,
  riasec_realistic INTEGER,
  riasec_investigative INTEGER,
  riasec_artistic INTEGER,
  riasec_social INTEGER,
  riasec_enterprising INTEGER,
  riasec_conventional INTEGER,
  top_code TEXT,          -- denormalised top-3, e.g. 'IRC'
  submitted_at TEXT DEFAULT CURRENT_TIMESTAMP
)
siswa_assessment_answers (
  assessment_id TEXT FK,
  question_idx INTEGER,   -- 0..59
  answer INTEGER,         -- 1..5 Likert
  riasec_dim TEXT,        -- which of R/I/A/S/E/C this q maps to
  PRIMARY KEY (assessment_id, question_idx)
)
```

**Self-assessment + learning:**
```sql
siswa_self_assessments (
  id TEXT PK,
  user_id TEXT FK,
  onet_skill_id TEXT,     -- references onet_skills.element_id
  current_level INTEGER,  -- 1..5
  target_level INTEGER,   -- pulled from O*NET occupation's required level
  gap_category TEXT,      -- 'critical' | 'moderate' | 'minimal'
  rated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
siswa_learning_paths (
  id TEXT PK,
  user_id TEXT FK,
  target_career_onet TEXT,
  generated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  ai_prompt_tokens INTEGER,
  ai_completion_tokens INTEGER,
  full_json TEXT          -- store the full Claude response for audit
)
siswa_learning_phases (
  id TEXT PK,
  path_id TEXT FK,
  phase_number INTEGER,   -- 1, 2, 3
  title TEXT,
  estimated_weeks INTEGER,
  description TEXT,
  skill_targets TEXT,     -- JSON array of onet_skill_ids
  project_suggestion TEXT,
  social_accounts TEXT    -- JSON array of {platform, handle, why}
)
siswa_course_progress (
  user_id TEXT,
  course_id TEXT,         -- FK to course_catalog.id
  phase_id TEXT,          -- FK to siswa_learning_phases.id (nullable)
  status TEXT CHECK (status IN ('belum','berproses','selesai','lompati')),
  started_at TEXT,
  completed_at TEXT,
  notes TEXT,
  PRIMARY KEY (user_id, course_id)
)
```

**Gamification:**
```sql
siswa_activity_log (
  id TEXT PK,
  user_id TEXT FK,
  activity_type TEXT,     -- 'assessment_done' | 'course_started' | 'course_completed' | 'login' | ...
  ref_id TEXT,            -- optional FK to entity (course_id, assessment_id, etc)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
siswa_badges (
  id TEXT PK,
  user_id TEXT FK,
  badge_code TEXT,        -- 'first_assess' | 'skill_closed_critical' | 'streak_7' | etc
  awarded_at TEXT DEFAULT CURRENT_TIMESTAMP,
  meta TEXT               -- JSON
)
```

**O*NET reference data:**
```sql
onet_occupations (
  onet_soc_code TEXT PK,   -- '15-1252.00'
  title TEXT,
  description TEXT,
  alt_titles TEXT          -- JSON array
)
onet_skills (
  element_id TEXT PK,      -- '2.A.1.a'
  element_name TEXT,       -- 'Reading Comprehension'
  category TEXT            -- 'Basic Skills' | 'Cross-Functional' | etc
)
onet_knowledge (
  element_id TEXT PK,
  element_name TEXT,
  category TEXT
)
onet_interests (
  onet_soc_code TEXT,
  riasec_dim TEXT,         -- 'Realistic' | 'Investigative' | ...
  score REAL,              -- 1..7
  PRIMARY KEY (onet_soc_code, riasec_dim)
)
onet_occupation_skills (
  onet_soc_code TEXT,
  element_id TEXT,
  importance REAL,         -- 1..5
  level REAL,              -- 1..7
  PRIMARY KEY (onet_soc_code, element_id)
)
onet_occupation_knowledge (
  onet_soc_code TEXT,
  element_id TEXT,
  importance REAL,
  level REAL,
  PRIMARY KEY (onet_soc_code, element_id)
)
```

**Course catalog:**
```sql
course_catalog (
  id TEXT PK,              -- 'crs_' + nanoid
  source TEXT,             -- 'coursera' | 'class_central' | 'dicoding' | 'futureskills' | ...
  external_id TEXT,
  title TEXT NOT NULL,
  provider TEXT,           -- 'University of Michigan' | 'Dicoding' | ...
  description TEXT,
  url TEXT NOT NULL,
  duration_hours INTEGER,
  language TEXT,           -- 'id' | 'en'
  price_idr INTEGER,       -- 0 for free
  rating REAL,
  level TEXT,              -- 'beginner' | 'intermediate' | 'advanced'
  tagged_at TEXT,          -- when AI tagged it
  active INTEGER DEFAULT 1
)
course_skill_tags (
  course_id TEXT,
  onet_element_id TEXT,    -- the skill or knowledge
  coverage TEXT,           -- 'foundational' | 'developing' | 'proficient'
  confidence REAL,         -- 0..1 from Claude
  PRIMARY KEY (course_id, onet_element_id)
)
```

Indexes: kab/role/active filters, FKs.

### 2. O*NET data import script `scripts/import-onet.mjs`

Download O*NET 28.0+ from `https://www.onetcenter.org/database.html` (or pin a version snapshot). The official zip contains tab-separated text files. Need:
- `Occupation Data.txt` → `onet_occupations`
- `Skills.txt`, `Knowledge.txt` → `onet_skills`, `onet_knowledge` (deduplicated by element_id)
- `Interests.txt` → `onet_interests`
- `Skills.txt` (the occupation-skills cross) → `onet_occupation_skills` (importance + level rows)
- `Knowledge.txt` (occupation-knowledge cross) → `onet_occupation_knowledge`

Script should:
1. Read all relevant .txt files from `data/onet/` (you'll need to manually drop them there first)
2. Parse + transform + bulk insert
3. Print final row counts per table
4. Handle re-runs idempotently (TRUNCATE + INSERT, since O*NET data is reference)

Expected counts (O*NET 28.0):
- occupations: ~923
- skills: 35 unique elements
- knowledge: 33 unique elements
- interests: ~923 × 6 = ~5538
- occupation_skills: ~923 × 35 = ~32k
- occupation_knowledge: ~923 × 33 = ~30k

### 3. Verification queries

After import, run smoke tests:
```sql
-- Top 5 careers for someone with R-I-A profile
SELECT o.onet_soc_code, o.title,
       (SELECT score FROM onet_interests WHERE onet_soc_code = o.onet_soc_code AND riasec_dim = 'Realistic') AS r,
       (SELECT score FROM onet_interests WHERE onet_soc_code = o.onet_soc_code AND riasec_dim = 'Investigative') AS i,
       (SELECT score FROM onet_interests WHERE onet_soc_code = o.onet_soc_code AND riasec_dim = 'Artistic') AS a
FROM onet_occupations o
WHERE r > 4 AND i > 4 AND a > 4
LIMIT 5;

-- Skills required for "Software Developers" (15-1252.00)
SELECT s.element_name, os.importance, os.level
FROM onet_occupation_skills os
JOIN onet_skills s ON s.element_id = os.element_id
WHERE os.onet_soc_code = '15-1252.00' AND os.importance > 3.5
ORDER BY os.importance DESC;
```

## How to verify

1. `node scripts/migrate-siswa.mjs` — should print all CREATE TABLE statements as no-op (or first-time creation)
2. Download O*NET zip, extract to `data/onet/`, run `node scripts/import-onet.mjs`
3. Run verification queries above — counts should match expected ranges
4. `vercel env ls production` — confirm `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` present (no new env vars needed yet)

## Commit message template

```
siswa(foundation): DB schema + O*NET reference data import

  Adds 14 new tables under siswa_*/onet_*/course_* prefixes for the
  KKRI Pencari Arah pipeline (Assess → Match → Analyze → Learn → Track).

  Tables: siswa_users, siswa_otp, siswa_assessments,
    siswa_assessment_answers, siswa_self_assessments,
    siswa_learning_paths, siswa_learning_phases,
    siswa_course_progress, siswa_activity_log, siswa_badges,
    onet_occupations (923 rows), onet_skills (35), onet_knowledge (33),
    onet_interests (~5.5k), onet_occupation_skills (~32k),
    onet_occupation_knowledge (~30k), course_catalog, course_skill_tags

  Scripts:
    scripts/migrate-siswa.mjs   — idempotent table create
    scripts/import-onet.mjs     — O*NET CSV bulk import (28.0)

  See docs/siswa/ARCHITECTURE.md for full pipeline diagram.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## What's next

→ [Session 2 — Student auth + schools API](./session-2-auth-schools.md)
