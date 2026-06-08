# Session 4 — Self-assessment + course catalog + AI skill tagging

> **Workspace**: BELNEG Mission Control
> **Prereq**: Session 3 done (RIASEC + career match works)
> **Estimated time**: 2 hours

## What this session builds

The "Analyze" stage: self-assessment of relevant skills → skill gap calculation. Plus the **course catalog seed** and **Claude Batch API skill tagging** infrastructure.

## Concrete deliverables

### 1. `GET /api/v2/self-assessment/skills`

Bearer auth.
- Pulls top-5 career match results for the user (from latest assessment)
- For those 5 careers, JOIN `onet_occupation_skills` + `onet_occupation_knowledge`
- Filter `importance > 3.5` (the "really matters" threshold per spec)
- Deduplicate across the 5 careers
- Return: 8-15 skills/knowledge elements
  ```json
  {
    "based_on_careers": ["15-1252.00", "15-1253.00", ...],
    "items": [
      {
        "element_id": "2.A.1.a",
        "element_name": "Reading Comprehension",
        "element_name_id": "Pemahaman Bacaan",
        "kind": "skill",         // 'skill' | 'knowledge'
        "category": "Basic Skills",
        "avg_importance": 4.2,
        "avg_target_level": 5.1,  // from O*NET 1..7 scale
        "appears_in_careers": ["15-1252.00", "15-1253.00"]
      },
      ...
    ]
  }
  ```

Scale labels for client:
```json
{
  "1": "Belum pernah belajar",
  "2": "Pernah dengar/baca",
  "3": "Pernah belajar/praktik dasar",
  "4": "Cukup kompeten",
  "5": "Mahir/profesional"
}
```

### 2. `POST /api/v2/self-assessment/submit`

- Body: `{ratings: [{element_id, current_level}]}` — must cover all items from /skills
- For each: compute `target_level` from O*NET (max of importance × level across the 5 careers, capped to user-facing 1..5 scale)
- Compute `gap = target_level - current_level`
- Categorize: `gap >= 3` → critical, `gap == 2` → moderate, `gap <= 1` → minimal
- INSERT to `siswa_self_assessments` (one row per skill)
- Return: `{summary: {critical: N, moderate: N, minimal: N}, items: [...full breakdown]}`

### 3. `GET /api/v2/self-assessment/gaps`

Bearer auth. Returns the user's latest computed gaps grouped by category. Used by learning path generation in S5.

### 4. Course catalog initial seed (`scripts/seed-courses.mjs`)

Curate ~200 courses manually across the source mix specified. Hardcoded array in script. Schema per course:
```js
{
  source: "coursera" | "class_central" | "dicoding" | "futureskills" | "youtube" | ...,
  external_id: "stable identifier",
  title: "...",
  provider: "University of Michigan" | "Dicoding Indonesia" | ...,
  description: "...",
  url: "https://...",
  duration_hours: 12,
  language: "id" | "en",
  price_idr: 0,        // 0 = free
  rating: 4.7,
  level: "beginner" | "intermediate" | "advanced"
}
```

Distribute across common career skill clusters:
- Programming (Python, JS, Java) — 30 courses
- Data Science (statistics, ML, SQL) — 25
- Design (UI/UX, graphic) — 20
- Business (marketing, finance, management) — 25
- Communication + Soft skills — 20
- Mathematics + Science — 15
- Languages — 15
- Trades + Practical (electrical, mechanical) — 15
- Healthcare + Biology — 15
- Indonesian-specific (Pancasila, kewarganegaraan, bahasa) — 15

INSERT to `course_catalog`. Print summary stats.

### 5. AI skill-tagging script `scripts/tag-courses.mjs`

For each untagged course (`tagged_at IS NULL OR tagged_at < NOW() - 30 days`), use Claude Batch API to tag with O*NET skills + knowledge.

Process:
```js
1. Fetch untagged courses (batch size 100)
2. Fetch O*NET taxonomy (onet_skills + onet_knowledge, 68 elements total)
3. Build prompt per course:
   "Given this course metadata, identify which O*NET skills/knowledge it teaches.
    Return JSON: {tags: [{element_id, coverage, confidence}]}
    coverage: 'foundational' | 'developing' | 'proficient'
    confidence: 0.0..1.0
    Course: {title, provider, description}
    O*NET taxonomy: {68 elements with id + name}"
4. Submit to Claude Batch API (single batch of all 100 prompts at once)
5. Poll batch status; when complete:
   - Parse responses
   - DELETE old tags for each course
   - INSERT new course_skill_tags rows
   - UPDATE course_catalog.tagged_at
6. Print summary: courses tagged, total tags created, batch cost
```

Use `@anthropic-ai/sdk` (`pnpm add @anthropic-ai/sdk` — likely already installed from prior work). Model: `claude-haiku-4-5` (fast + cheap for tagging task, accuracy is good enough for skill matching).

Add to env: `ANTHROPIC_API_KEY` (user already has this from earlier tagging work — already in their shell).

### 6. `GET /api/v2/courses`

Public-ish browseable catalog. Bearer auth optional (returns same for now).
- Query: `?skill_id=`, `?provider=`, `?language=`, `?level=`, `?free=true`, `?q=`, `?limit=`, `?offset=`
- JOIN with `course_skill_tags` if `skill_id` filter present
- Order: `rating DESC, duration_hours ASC` default
- Return: `{total, rows: [{...course + tags}]}`

### 7. Add admin sidebar nav stub

In `apps/belneg/components/sidebar.tsx`, add an entry:
```ts
{ href: "/admin/siswa", label: "Siswa KKRI", icon: GraduationCap, sub: "Pencari Arah" }
```
The page itself is built in S6.

## How to verify

```bash
TOKEN=...

# Get personalised skill list (after user took assessment)
curl https://belneg.vercel.app/api/v2/self-assessment/skills -H "Authorization: Bearer $TOKEN"

# Submit ratings
curl -X POST https://belneg.vercel.app/api/v2/self-assessment/submit \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"ratings":[{"element_id":"2.A.1.a","current_level":3},...]}'

# Browse courses
curl 'https://belneg.vercel.app/api/v2/courses?skill_id=2.A.1.a&language=id&free=true&limit=20' \
  -H "Authorization: Bearer $TOKEN"

# Run tagging (one-shot)
node scripts/tag-courses.mjs
```

## Commit message template

```
siswa/api: self-assessment + course catalog + AI tagging

  - GET  /api/v2/self-assessment/skills   — 8-15 relevant skills derived
                                              from user's top-5 career match
  - POST /api/v2/self-assessment/submit   — store ratings + compute gaps
                                              (critical/moderate/minimal)
  - GET  /api/v2/self-assessment/gaps     — current gap breakdown
  - GET  /api/v2/courses                  — catalog browse with filters

  Scripts:
    scripts/seed-courses.mjs    — initial ~200 curated courses (multi-source)
    scripts/tag-courses.mjs     — Claude Batch API skill tagging (haiku)

  Cost: ~$10 one-shot for 200 courses; ~$2.50/mo refresh on new courses.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## What's next

→ [Session 5 — Learning path + progress + gamification](./session-5-learning-path.md)
