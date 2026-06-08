# Session 3 — Assessment pipeline (RIASEC + career match)

> **Workspace**: BELNEG Mission Control
> **Prereq**: Session 2 done (auth + schools works)
> **Estimated time**: 2 hours

## What this session builds

The "Assess → Match" stage. Endpoints for RIASEC questionnaire delivery, scoring, top-5 career matching from O*NET data.

## Concrete deliverables

### 1. RIASEC question bank (`apps/belneg/data/riasec-onet-ip-short.json`)

Use **O*NET Interest Profiler Short Form** (60 items, public domain — downloadable from onetcenter.org/IP.html). Format:
```json
[
  {"idx": 0, "text": "Membangun rangka kayu untuk rumah", "dim": "R"},
  {"idx": 1, "text": "Memimpin kelompok pendaki gunung", "dim": "E"},
  ...
]
```
60 items, balanced 10 per dim (R/I/A/S/E/C). All in **Bahasa Indonesia** (translated from official English, sanity-checked semantically).

### 2. `GET /api/v2/assessment/questions`

Returns the question bank. Static — same for everyone. Cache aggressively.
```json
{
  "version": "onet-ip-short-1.0",
  "instructions": "Untuk setiap pertanyaan, pilih seberapa Anda tertarik melakukan aktivitas tersebut...",
  "scale_labels": {
    "1": "Sangat tidak tertarik",
    "2": "Tidak tertarik",
    "3": "Netral",
    "4": "Tertarik",
    "5": "Sangat tertarik"
  },
  "questions": [...60 items]
}
```

### 3. `POST /api/v2/assessment/submit`

- Body: `{answers: [{idx, value}]}` — 60 entries, each value 1..5
- Validate: must be exactly 60, no missing idx
- Score:
  - For each dim, sum the 10 items × value (range 10..50 per dim)
  - Normalise to 0..100 scale: `(sum - 10) / 40 * 100`
  - top_code = top 3 dims by score, e.g. `"IRC"`
- INSERT row to `siswa_assessments` + 60 rows to `siswa_assessment_answers`
- UPDATE `siswa_users.riasec_top_code`
- Log activity: `assessment_done`
- Return: `{id, scores: {R,I,A,S,E,C}, top_code, careers_preview: [top 3 careers from O*NET]}`

### 4. `GET /api/v2/assessment/latest`

Bearer auth. Returns user's most recent assessment (scores + top_code). 404 if never taken.

### 5. Career matching algorithm

Function `matchCareers(userScores: {R,I,A,S,E,C}, limit=5)`:

```ts
// O*NET scores each occupation 1..7 per RIASEC dim
// User score is 0..100 per dim
// Compute weighted cosine similarity between user vector and each occupation vector
// (normalise both to unit vectors first)
// Return top-N by similarity descending
```

Specifically:
```sql
WITH user_vec AS (
  SELECT :r AS r, :i AS i, :a AS a, :s AS s, :e AS e, :c AS c
),
occ AS (
  SELECT
    o.onet_soc_code, o.title,
    MAX(CASE WHEN oi.riasec_dim = 'Realistic'      THEN oi.score END) AS r,
    MAX(CASE WHEN oi.riasec_dim = 'Investigative'  THEN oi.score END) AS i,
    MAX(CASE WHEN oi.riasec_dim = 'Artistic'       THEN oi.score END) AS a,
    MAX(CASE WHEN oi.riasec_dim = 'Social'         THEN oi.score END) AS s,
    MAX(CASE WHEN oi.riasec_dim = 'Enterprising'   THEN oi.score END) AS e,
    MAX(CASE WHEN oi.riasec_dim = 'Conventional'   THEN oi.score END) AS c
  FROM onet_occupations o JOIN onet_interests oi ON oi.onet_soc_code = o.onet_soc_code
  GROUP BY o.onet_soc_code
)
SELECT
  occ.onet_soc_code, occ.title,
  -- Cosine similarity (user vec normalised, occ vec normalised)
  (user_vec.r * occ.r + user_vec.i * occ.i + user_vec.a * occ.a +
   user_vec.s * occ.s + user_vec.e * occ.e + user_vec.c * occ.c) /
  (SQRT(user_vec.r*user_vec.r + ... ) * SQRT(occ.r*occ.r + ...)) AS similarity
FROM occ, user_vec
ORDER BY similarity DESC LIMIT 5;
```

### 6. `GET /api/v2/careers/match`

Bearer auth.
- Uses user's latest assessment scores
- Returns top 5 careers with full details:
  ```json
  {
    "based_on_assessment_id": "...",
    "rows": [
      {
        "onet_soc_code": "15-1252.00",
        "title": "Software Developers",
        "title_id": "Pengembang Perangkat Lunak",
        "description": "...",
        "match_score": 0.94,
        "riasec_profile": {R:2.5, I:6.8, A:4.1, S:3.2, E:3.0, C:4.5},
        "n_skills_required": 24,
        "n_knowledge_required": 12,
        "median_salary_idr": null   // future enrichment
      },
      ...
    ]
  }
  ```

### 7. `GET /api/v2/careers/[onet_soc_code]`

Full detail of a single career:
- Description (long)
- Top 10 skills (importance > 3.5) with names + importance
- Top 10 knowledge areas
- Related careers (cosine similar based on RIASEC, top 3)
- Sample tasks (if O*NET Tasks.txt included in S1 import — optional enrichment)

### 8. (Optional but nice) `POST /api/v2/careers/[onet_soc_code]/select`

User picks a primary career target. Updates `siswa_users.primary_career_onet`. Returns `{ok: true}`.

## How to verify

```bash
TOKEN=...  # from auth/verify-otp

# Get questions
curl https://belneg.vercel.app/api/v2/assessment/questions | jq '.questions | length'  # → 60

# Submit assessment
curl -X POST https://belneg.vercel.app/api/v2/assessment/submit \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"answers":[{"idx":0,"value":3},...]}'  # 60 answers

# Get top 5 career match
curl https://belneg.vercel.app/api/v2/careers/match -H "Authorization: Bearer $TOKEN"

# Drill down a career
curl https://belneg.vercel.app/api/v2/careers/15-1252.00 -H "Authorization: Bearer $TOKEN"
```

## Commit message template

```
siswa/api: assessment pipeline — RIASEC scoring + O*NET career match

  Endpoints:
    GET  /api/v2/assessment/questions   — 60-item O*NET IP Short Form (id)
    POST /api/v2/assessment/submit      — score + store + return top 3 preview
    GET  /api/v2/assessment/latest      — user's most recent
    GET  /api/v2/careers/match          — top 5 careers via cosine similarity
                                           of user RIASEC vs O*NET interests
    GET  /api/v2/careers/[code]         — full career detail (skills/knowledge/related)
    POST /api/v2/careers/[code]/select  — set primary_career_onet on user profile

  Question bank: data/riasec-onet-ip-short.json (60 items, BI, balanced 10/dim)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## What's next

→ [Session 4 — Self-assessment + course catalog + AI tagging](./session-4-skills-courses.md)
