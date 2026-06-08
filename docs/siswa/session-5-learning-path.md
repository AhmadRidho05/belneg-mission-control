# Session 5 — Learning path + progress + gamification

> **Workspace**: BELNEG Mission Control
> **Prereq**: Session 4 done (gaps computed + courses tagged)
> **Estimated time**: 2 hours

## What this session builds

The "Learn → Track" stage: Claude Sonnet generates personalised 3-phase roadmap; user marks course progress; streak/badges/readiness score auto-compute.

## Concrete deliverables

### 1. `POST /api/v2/learning-path/generate`

Bearer auth.
- Idempotency: if user has a `siswa_learning_paths` row with `generated_at > 7 days ago`, return existing (avoid burning AI cost). Force regenerate with `?force=true`.
- Fetch inputs:
  - User's gaps (`siswa_self_assessments` latest) grouped by category
  - Target career (`siswa_users.primary_career_onet`)
  - Top-tagged courses for each critical/moderate skill (LIMIT 5 per skill from `course_catalog` JOIN `course_skill_tags`)
- Build Claude Sonnet prompt:
  ```
  System: You are a career coach helping an Indonesian high school student
          build a personalised learning roadmap. Output strict JSON.

  User: My target career: {career_title} (O*NET {code})
        My skill gaps (critical/moderate/minimal):
          - {skill_name}: current {N}/5, need {M}/5, gap {category}
          ... (8-15 skills)

        Available courses (curated catalog):
          - {course_title} ({provider}, {duration}h, {price})
            URL: {url}
            Teaches: {skill_names}
          ... (top 30-50 courses by relevance to my gaps)

        Generate a 3-phase learning path:
        Phase 1: Critical gaps (3-4 months target)
        Phase 2: Moderate gaps (2-3 months)
        Phase 3: Enrichment & specialization (2-3 months)

        For each phase: order courses by prerequisite logic, include
        1 hands-on project suggestion, suggest 2-3 Indonesian Instagram
        and/or TikTok accounts to follow that align with the skills.

        Output JSON schema:
        {
          phases: [{
            phase_number, title, estimated_weeks,
            description, skill_targets: [element_id],
            courses: [{id, title, why_chosen}],
            project_suggestion: { title, description, deliverable, est_weeks },
            social_accounts: [{ platform, handle, why }]
          }]
        }
  ```
- Use `claude-sonnet-4-6` with `output_config.format = json_schema` for guaranteed structure
- Save `full_json` to `siswa_learning_paths.full_json`
- Persist phase rows in `siswa_learning_phases`
- Pre-populate `siswa_course_progress` rows with `status='belum'` for all referenced courses
- Log activity: `learning_path_generated`
- Return: full path JSON

### 2. `GET /api/v2/learning-path`

Bearer auth. Returns user's current learning path with all 3 phases + their courses + project + social accounts. Joined with `siswa_course_progress` so client sees status per course.

### 3. `PATCH /api/v2/progress/course/[course_id]`

Bearer auth.
- Body: `{status: 'belum' | 'berproses' | 'selesai' | 'lompati', notes?: string}`
- UPDATE `siswa_course_progress` row
- If status changed to `'berproses'`: set `started_at = NOW()`, log `course_started`
- If status changed to `'selesai'`: set `completed_at = NOW()`, log `course_completed`, trigger badge check (see below)
- Return: updated row

### 4. `GET /api/v2/progress/dashboard`

Bearer auth. Aggregated stats for the dashboard tab:
```json
{
  "overall": {
    "courses_total": 24,
    "courses_belum": 8,
    "courses_berproses": 3,
    "courses_selesai": 12,
    "courses_lompati": 1,
    "percent_complete": 50
  },
  "phases": [
    {"phase_number": 1, "title": "...", "completed": 4, "total": 6, "percent": 67},
    {"phase_number": 2, "title": "...", "completed": 2, "total": 9, "percent": 22},
    {"phase_number": 3, "title": "...", "completed": 0, "total": 9, "percent": 0}
  ],
  "skill_radar_before": {  // user's initial self-assessment levels (1..5 per skill)
    "Pemahaman Bacaan": 3,
    "Pemrograman": 1,
    ...
  },
  "skill_radar_now": {  // recomputed based on courses completed × course tag coverage
    "Pemahaman Bacaan": 3,
    "Pemrograman": 3,
    ...
  },
  "timeline": [
    {"date": "2026-05-10", "event": "Started 'Python for Everybody'"},
    {"date": "2026-05-22", "event": "Completed 'Python for Everybody'"},
    ...
  ],
  "projected_completion": "2026-12-15"  // simple projection: avg days per course × remaining
}
```

### 5. `GET /api/v2/streak`

Bearer auth.
- Compute consecutive days with at least one `siswa_activity_log` entry (any activity type)
- Return: `{current_streak: 7, longest_streak: 14, last_active_at: "..."}`

Logic: query distinct days from activity_log for user, traverse backwards from today to find consecutive count. Cache result in memory per-request OK.

### 6. `GET /api/v2/badges` + badge auto-award logic

Badges list (codes + criteria):
- `first_assess` — taken first RIASEC
- `first_self_assess` — submitted self-assessment
- `path_generated` — generated first learning path
- `course_first` — completed first course
- `course_10` / `course_25` / `course_50` — milestones
- `streak_3` / `streak_7` / `streak_30` — consecutive days
- `gap_closed_critical_1` — closed first critical gap (recompute: skill's gap moved from critical→minimal)
- `gap_closed_critical_all` — closed all critical gaps
- `phase_1_done` / `phase_2_done` / `phase_3_done` — full phase complete

Badge award function called from:
- `PATCH /api/v2/progress/course/[id]` (after status update)
- `POST /api/v2/self-assessment/submit` (recompute gaps)
- Daily cron (optional, for streak badges based on activity_log)

Each award INSERTs to `siswa_badges` (with UNIQUE constraint on user_id + badge_code) and logs `badge_awarded` activity.

`GET /api/v2/badges` returns: `{earned: [...], available: [...with criteria description]}`.

### 7. `GET /api/v2/readiness-score`

Bearer auth. Compute 0-100 score:
```
score = round(
  0.40 * (gap_closure_rate * 100)             // % of skills moved out of critical/moderate
  + 0.30 * (courses_complete / courses_total) * 100
  + 0.15 * (phases_complete / 3) * 100
  + 0.10 * min(streak_days / 30, 1) * 100     // streak (capped at 30d)
  + 0.05 * (badges_earned / 10) * 100         // engagement
)
```
Return: `{score, components: {gap, courses, phases, streak, engagement}, last_updated}`.

## Cost note

Each `POST /learning-path/generate` call: ~3k input + 2k output tokens with Sonnet 4.6 = ~$0.05/user. For 1000 users = $50/month max. Use `claude-sonnet-4-6` not Opus.

Cache aggressively (7-day TTL). User can manually trigger regeneration via UI button only.

## How to verify

```bash
TOKEN=...

# Generate path (one-time per user)
curl -X POST https://belneg.vercel.app/api/v2/learning-path/generate \
  -H "Authorization: Bearer $TOKEN"

# Get current path
curl https://belneg.vercel.app/api/v2/learning-path -H "Authorization: Bearer $TOKEN"

# Mark course as berproses
curl -X PATCH https://belneg.vercel.app/api/v2/progress/course/crs_abc123 \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"berproses"}'

# Dashboard
curl https://belneg.vercel.app/api/v2/progress/dashboard -H "Authorization: Bearer $TOKEN"

# Streak + badges + score
curl https://belneg.vercel.app/api/v2/streak -H "Authorization: Bearer $TOKEN"
curl https://belneg.vercel.app/api/v2/badges -H "Authorization: Bearer $TOKEN"
curl https://belneg.vercel.app/api/v2/readiness-score -H "Authorization: Bearer $TOKEN"
```

## Commit message template

```
siswa/api: learning path generation + progress tracking + gamification

  AI:
    POST /api/v2/learning-path/generate  — Claude Sonnet 4.6 with strict
                                            JSON schema; 3-phase roadmap;
                                            7-day cache; force=true override
    GET  /api/v2/learning-path           — retrieve + join progress

  Progress:
    PATCH /api/v2/progress/course/[id]   — belum/berproses/selesai/lompati
                                            with auto-timestamps + activity log
    GET   /api/v2/progress/dashboard     — overall + per-phase + skill radar
                                            before/after + timeline +
                                            projected completion

  Gamification:
    GET /api/v2/streak           — current + longest consecutive activity days
    GET /api/v2/badges           — earned + available with criteria
    GET /api/v2/readiness-score  — 0-100 weighted composite

  Badge auto-award triggers on: course status change, self-assessment
  submission, daily streak rollup.

  Est cost @1k users: ~$50/mo (Sonnet path gen capped at 1 per 7 days).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## What's next

→ [Session 6 — Admin SISWA dashboard](./session-6-admin-dashboard.md)
