# KKRI — Pencari Arah · Architecture

> Pipeline: **Assess (RIASEC) → Match (O*NET) → Analyze (Skill Gap) → Learn (AI Learning Path) → Track (Credential Progress)** untuk siswa SMA. Backend ride-along di BELNEG Mission Control (this repo), UI di sister repo `kkri-pencari-arah`.

## System diagram

```
┌────────────────────────────────────────────────────────────────────┐
│ Mobile app (kkri-pencari-arah)                                     │
│  Expo SDK 56 · React Native · TypeScript                           │
│  Screens: SignUp → Assess → Result → SelfAssess → LearningPath →   │
│           Progress → Profile                                       │
└────────────┬───────────────────────────────────────────────────────┘
             │ HTTPS + JWT (Bearer)
             ▼
┌────────────────────────────────────────────────────────────────────┐
│ BELNEG Mission Control (this repo, apps/belneg/)                   │
│                                                                    │
│  Public mobile API:   /api/v2/*                                    │
│   ├─ auth/*           (sign-up, OTP, verify, JWT 30d)              │
│   ├─ schools          (SMA list, filtered from fact_satpen_dikmen) │
│   ├─ assessment/*     (RIASEC 60 items + scoring)                  │
│   ├─ careers/*        (top-5 match + skills detail)                │
│   ├─ self-assessment/*(8-15 skills rating + gap calc)              │
│   ├─ courses/*        (browseable catalog + skill filter)          │
│   ├─ learning-path/*  (Claude Sonnet generation + retrieve)        │
│   ├─ progress/*       (course status update + dashboard agg)       │
│   ├─ streak           (auto-computed daily activity)               │
│   └─ badges           (awarded on gap-close milestones)            │
│                                                                    │
│  Admin dashboard:     /admin/siswa                                 │
│   ├─ Stats            (DAU/WAU/MAU, location, device)              │
│   ├─ Insights         (RIASEC dist, profession map, by school)     │
│   ├─ AI Recommendations  (on-demand Claude prompt)                 │
│   └─ User explorer    (search/filter, detail page)                 │
│                                                                    │
│  Background jobs (cron / one-shot scripts):                        │
│   ├─ ONet import         (monthly: occupations, skills, knowledge) │
│   ├─ Course catalog sync (weekly: Coursera, Class Central, etc)    │
│   ├─ AI skill tagging    (monthly: Claude Batch API on new courses)│
│   └─ Streak rollup       (daily: compute consecutive-days metric)  │
└────────────┬───────────────────────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────────────┐
│ Turso libSQL (Tokyo region) — single shared DB                     │
│                                                                    │
│  Existing tables (reuse):                                          │
│   fact_satpen_dikmen (SMA database, source of school list)         │
│                                                                    │
│  New tables (siswa_* + onet_* + course_*):                         │
│   siswa_users, siswa_otp                                           │
│   siswa_assessments, siswa_assessment_answers                      │
│   siswa_self_assessments                                           │
│   siswa_learning_paths, siswa_learning_phases                      │
│   siswa_course_progress                                            │
│   siswa_badges, siswa_activity_log                                 │
│   onet_occupations, onet_skills, onet_knowledge, onet_interests    │
│   onet_occupation_skills, onet_occupation_knowledge                │
│   course_catalog, course_skill_tags                                │
└────────────────────────────────────────────────────────────────────┘
```

## Why this split?

| Concern | Reason |
|---|---|
| **One source of truth (DB)** | Same Turso DB serves SMA list (existing `fact_satpen_dikmen`), Pembina KKRI (`kkri_*`), Pencari Arah (`siswa_*`). Avoids data fragmentation. |
| **AI cost centralized** | Claude Sonnet + Batch API runs server-side. Mobile never holds API key. Caching + rate-limiting easier. |
| **Mobile is pure consumer** | UI iteration fast, no backend secrets, OTA updates without rebuild for JS changes. |
| **Admin reuses Belneg shell** | `/admin/siswa` sits next to `/admin/users`, `/admin/reports`. Sidebar nav, theme, auth (still open-internal for MVP) all reused. |
| **Separate repos for mobile** | Same logic as `pembina-kkri-app`: Expo tooling heavy, App Store release cadence differs from web, separate access control. |

## Cost projection (monthly, MVP scale: ~1000 active siswa)

| Service | Usage | Cost/mo |
|---|---|---|
| **Turso libSQL** | <2GB total + <10M reads | **$0** (free tier 9GB/1B reads) |
| **Vercel functions** | <100GB bandwidth | **$0** (Hobby) |
| **Vercel Blob** | minimal (no per-user uploads in this app) | **$0** |
| **Resend (OTP email)** | ~3000/mo for 1000 users (3 OTP avg) | **$0** (free 3k/mo) |
| **Claude Sonnet** — learning path | 1000 users × $0.05 = | **$50** |
| **Claude Sonnet** — admin AI recs | ~50/mo × $0.05 | **$2.50** |
| **Claude Batch API** — course tagging | 5000 courses × $0.005 one-time = $25; monthly refresh on new ~500 = | **$2.50/mo** |
| **EAS Build** (mobile) | 1-2 builds/mo | **$0** (free tier) |
| **TOTAL recurring** | | **~$55/mo** at 1000 users |

Scaling to 10k users: linear ~$500/mo (mostly learning path Claude calls).

## Vibe-coding session plan (12 total, 6 per repo)

### Backend sessions (this repo, `docs/siswa/session-N.md`)

| # | Session | What it builds | Est time |
|---|---|---|---|
| **S1** | Foundation: DB schema + O*NET ingestion | All siswa_*/onet_*/course_* tables + script to import O*NET CSVs (one-shot) | 1-2h |
| **S2** | Student auth + schools API | `/api/v2/auth/*` + `/api/v2/me` + `/api/v2/schools` (SMA list from existing satpen) | 45min |
| **S3** | Assessment pipeline | RIASEC 60 items + scoring + career matching from O*NET interests-to-occupations | 2h |
| **S4** | Self-assessment + skill gap + course catalog | Per-skill rating + gap calc + curated course seed (~200 initial) + Claude Batch tagging script | 2h |
| **S5** | Learning path + progress + gamification | Claude Sonnet path gen + progress endpoints + streak/badges/readiness | 2h |
| **S6** | Admin SISWA dashboard | Full `/admin/siswa` page: stats accordion, RIASEC insights, AI recs, user explorer | 2-3h |

### Mobile sessions (new repo `kkri-pencari-arah`, `docs/session-N.md`)

| # | Session | What it builds | Est time |
|---|---|---|---|
| **M1** | Scaffold + auth + onboarding | Expo init, theme, sign-up + school selector + OTP verify | 1h |
| **M2** | RIASEC questionnaire UI | 60 items in 6 sections, progress indicator, result screen with R-I-A-S-E-C breakdown | 2h |
| **M3** | Career match + self-assessment | Top 5 careers display + per-skill rating 1-5 + skill gap visualization | 2h |
| **M4** | Learning path UI | Phased roadmap display, course cards with provider/duration/URL, project cards, medsos suggestions | 2h |
| **M5** | Progress + dashboard | Radar chart (before/after), phase progress bars, timeline view, streak + badges + readiness score | 2h |
| **M6** | Polish + EAS build | Animations, empty states, error boundaries, accessibility, build APK + IPA | 1-2h |

**Total estimated time: 22-28 hours of vibe coding.** Realistically spread over 2-3 weeks part-time.

## Data flow per user journey

```
Day 1 — Onboarding:
  Sign up (email + school) → OTP verify → JWT → Profile complete

Day 1-2 — Assessment:
  Take RIASEC 60 items (15 min) → Get R-I-A-S-E-C profile
  See top 5 careers from O*NET
  Pick 1 primary career target

Day 3-5 — Self-assess + gap:
  Backend pulls Skills + Knowledge for top 5 careers
  Filter importance > 3.5, dedupe → 8-15 skills
  User rates each 1-5
  Skill gap = needed_level - current_level
  Categorize: critical (gap≥3), moderate (gap=2), minimal (gap≤1)

Day 5 — Learning path:
  Click "Generate Learning Path"
  Backend: Claude Sonnet receives gaps + course catalog
  Output: 3-phase plan with courses + projects + medsos
  Save to DB, return to mobile

Ongoing — Track:
  User marks courses Belum / Berproses / Selesai / Lompati
  Streak counter tics daily on any activity
  Badge awarded when critical gap → minimal
  Readiness score recomputed nightly: 0-100
  Progress dashboard updates real-time
```

## Open questions for user before starting S1

1. **O*NET data source**: download official CSVs from onetcenter.org (~50MB)? Or use REST API (rate-limited)? Recommend: CSV bulk import.
2. **Course catalog initial size**: 200 curated handpicked, or 5000 scraped? Recommend: 200 curated initially, expand via scrape after MVP.
3. **Coursera API key**: do you have one? If not, use Class Central scrape as primary.
4. **Email sender for OTP**: reuse Resend `onboarding@resend.dev`, or set up `noreply@kkri.go.id` (needs DNS verification)?
5. **Mobile auth method**: email-only OTP (same as Pembina), or also support no-friction guest mode (assess first, sign up later)?

Defaults above sensible if you don't have preference.

---

*Generated: Mei 2026. Update when scope shifts.*
