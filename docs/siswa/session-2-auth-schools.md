# Session 2 — Student auth + Schools API

> **Workspace**: BELNEG Mission Control (this repo, `apps/belneg/`)
> **Prereq**: Session 1 done (DB tables + O*NET imported)
> **Estimated time**: 45 minutes

## What this session builds

Public-facing **`/api/v2/*`** namespace for student mobile consumption. Sign-up flow with school selection (auto-active, no admin approval needed). JWT-protected `/me` + school listing.

## Concrete deliverables

### 1. New file `apps/belneg/app/api/v2/_lib.ts`

Mirror of v1 _lib but:
- Different JWT audience: `"kkri-pencari-arah"` (vs `"pembina-kkri-app"`)
- Different token key prefix
- `requireSiswa(req)` middleware that reads `siswa_users` table (not `kkri_users`)
- Reuse `qAll`/`qGet`/`qRun` (import from v1 `_lib`)

### 2. Endpoint `POST /api/v2/auth/request-otp`
Same shape as v1 but writes to `siswa_otp`, queries `siswa_users` for rate limit.
- Body: `{contact}` (email only for MVP — phone returns 501)
- Rate-limit 60s per email
- Returns: `{sent, expires_at, dev_code?}` (dev_code only in dev)
- Uses Resend with subject `"Kode OTP KKRI Pencari Arah"`

### 3. Endpoint `POST /api/v2/auth/verify-otp`
- Body: `{contact, code, full_name?, school_npsn?, school_class?, birth_year?, gender?}` (last 5 only on first-time signup)
- If user exists → just issue JWT
- If user NEW → auto-create with `is_active=1` (no admin approval needed for students), require all 5 onboarding fields, then issue JWT
- Returns: `{access_token, expires_in, user}`

### 4. Endpoint `GET /api/v2/schools?q=&kab=&provinsi=`
- Returns SMA-family schools from `fact_satpen_dikmen`
- Filter: `bentuk_pendidikan IN ('SMA', 'SMK', 'MA', 'MAK')` (target audience)
- Query: optional `q` (search name), `kab` (filter kab_kota), `provinsi` (filter provinsi)
- Return: `{rows: [{npsn, nama, bentuk, status, kecamatan, kab_kota, provinsi}], count}`
- Public endpoint (no auth — needed during sign-up before user has token)
- Pagination: limit 50 default, max 200

### 5. Endpoint `GET /api/v2/me`
- Bearer auth
- Returns full siswa_users row + denormalised school name + activity stats:
  ```
  {
    id, email, full_name, birth_year, gender, school_class, primary_career_onet,
    riasec_top_code,
    school: {npsn, nama, kab_kota, provinsi},
    stats: {
      assessment_done: boolean,
      careers_explored: number,
      learning_path_active: boolean,
      courses_in_progress: number,
      courses_completed: number,
      current_streak_days: number,
      readiness_score: number     // 0-100
    }
  }
  ```

### 6. Endpoint `PATCH /api/v2/me`
- Bearer auth
- Allow update: `full_name`, `birth_year`, `gender`, `school_npsn`, `school_class`, `primary_career_onet`

### 7. Activity log helper
On every successful auth check (`requireSiswa`), opportunistically write a `siswa_activity_log` row with `activity_type='login'` if last login was >12h ago. Drives streak counter.

## How to verify

```bash
# Request OTP
curl -X POST https://belneg.vercel.app/api/v2/auth/request-otp \
  -H 'Content-Type: application/json' \
  -d '{"contact":"siswa.test@example.com"}'

# Verify + signup (first time needs onboarding fields)
curl -X POST https://belneg.vercel.app/api/v2/auth/verify-otp \
  -H 'Content-Type: application/json' \
  -d '{
    "contact":"siswa.test@example.com",
    "code":"123456",
    "full_name":"Test Siswa",
    "school_npsn":"20228539",
    "school_class":"11",
    "birth_year":2008,
    "gender":"L"
  }'

# Schools search
curl 'https://belneg.vercel.app/api/v2/schools?q=jakarta&limit=10'

# /me with token
curl https://belneg.vercel.app/api/v2/me -H "Authorization: Bearer <token>"
```

## Commit message template

```
siswa/api: v2 auth + schools + me endpoints

  Public /api/v2/* namespace for KKRI Pencari Arah mobile consumption.
  Reuses Resend OTP delivery + jose JWT pattern from v1, but writes to
  siswa_* tables and uses a separate JWT audience ("kkri-pencari-arah").

  Endpoints:
    POST /api/v2/auth/request-otp   — email OTP (60s rate-limit)
    POST /api/v2/auth/verify-otp    — auto-create with is_active=1 on
                                       first signup (no admin approval);
                                       requires full_name + school_npsn +
                                       school_class + birth_year + gender
                                       on first-time
    GET  /api/v2/schools            — SMA/SMK/MA/MAK list from
                                       fact_satpen_dikmen (public, search
                                       + kab/prov filter, 50-row default)
    GET  /api/v2/me                 — full profile + activity stats
                                       (streak, readiness_score, etc.)
    PATCH /api/v2/me                — update profile fields

  Activity log: requireSiswa() writes 'login' row if last login >12h ago,
  driving the streak counter (S5).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## What's next

→ [Session 3 — Assessment pipeline (RIASEC + career match)](./session-3-assessment.md)
