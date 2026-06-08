# Session 6 — Admin SISWA dashboard

> **Workspace**: BELNEG Mission Control
> **Prereq**: Sessions 1-5 done (mobile-facing API + DB fully populated)
> **Estimated time**: 2-3 hours

## What this session builds

Admin-facing **`/admin/siswa`** page in BELNEG Mission Control dashboard. Accordion-style sub-menus per user spec:
1. Key statistics
2. Insights (RIASEC, profession, location, cross-tab)
3. AI-generated recommendations (on-demand)
4. User explorer with search/filter + detail page

Reuse Belneg theme (dark navy + amber), sidebar already has the entry from Session 4.

## Concrete deliverables

### 1. Backend stats aggregator `apps/belneg/app/admin/siswa/admin-stats.ts`

Server-side `getSiswaStats()` function — single `Promise.all` of 15+ queries:

**Hero KPIs:**
- `total_users` (active + non-deleted)
- `new_users_7d`, `new_users_30d`, `new_users_90d`
- `dau` (distinct user_id from activity_log today)
- `wau` (7d), `mau` (30d), `m6_active` (180d), `m12_active` (365d)
- `assessments_done`, `paths_generated`, `courses_started`, `courses_completed`
- `avg_readiness_score`

**Geographic / device:**
- Users per provinsi (from school_npsn → fact_satpen_dikmen.provinsi)
- Users per kab/kota
- Users per school (top 20)
- Device stats — derive from activity_log user_agent if logged, else placeholder

**RIASEC insights:**
- Distribution of top_code across all assessments (sankey or bar)
- Avg score per dim (R/I/A/S/E/C)
- Top 10 most-common 3-letter codes (e.g. "ISA", "SEC")
- RIASEC dim by gender (radar)
- RIASEC dim by school_class (10/11/12)
- RIASEC dim by provinsi (heatmap top 10 provinces × 6 dims)

**Profession insights:**
- Top 20 careers chosen as `primary_career_onet`
- Top 20 careers appearing in top-5 matches (frequency)
- Career match diversity (count distinct onet codes / total users) — index 0..1
- Avg match_score for primary career

**Cross-tab:**
- Top career per provinsi (heatmap)
- Top career per gender
- Top career per RIASEC top_code (which careers do "ISA" types pick?)

**Funnel:**
- Sign-up → Assessment done → Career picked → Self-assessment → Path generated → First course started → First course completed
- Each as count + % conversion from previous step

### 2. Chart components reuse + add

Reuse from `app/admin/users/admin-charts.tsx`:
- DoughnutChart, TrendLaporanPesertaChart (rename → TrendActivityChart for clarity)
- SankeyChart, TreemapPangkat (rebrand → TreemapRiasec)
- HBarChart, PangkatStatusStackedBar (rebrand)
- DowHourHeatmap, GeoKabBubble, ProvinsiBarChart

New components:
- **RiasecRadarChart** — Recharts RadarChart, 6 axes (R/I/A/S/E/C), one or multiple series (e.g. by gender)
- **FunnelChart** — vertical bars decreasing, with % conversion labels
- **HeatmapRiasecByProvince** — 10 rows × 6 cols, color intensity

### 3. Admin page layout `apps/belneg/app/admin/siswa/page.tsx`

```tsx
import SiswaClient from "./siswa-client";
import { getSiswaStats } from "./admin-stats";

export const dynamic = "force-dynamic";

export default async function AdminSiswaPage() {
  const stats = await getSiswaStats();
  return <SiswaClient stats={stats} />;
}
```

### 4. `apps/belneg/app/admin/siswa/siswa-client.tsx`

Client component with 4 accordions (collapsible sections):

**Accordion 1: "Key Statistics"** (default open)
- Hero KPI grid (8 cards: total, DAU, WAU, MAU, new_7d, new_30d, courses_completed, avg_readiness)
- Geographic: provinsi map/bar + kab/kota bar
- Device stats (if available)
- Sign-up trend line (last 90 days)
- Daily active users line (last 90 days)

**Accordion 2: "Insights Asesmen & Profesi"**
- RIASEC dim distribution (doughnut)
- Top 10 3-letter codes (HBar)
- RIASEC by gender (radar with 2 series)
- RIASEC by school_class (radar with 3 series)
- Top 20 careers — primary selection (HBar)
- Top 20 careers — frequency in top-5 match (HBar)
- Heatmap: RIASEC dim × top 10 provinsi
- Heatmap: top 10 careers × provinsi
- Career diversity bubble (provinsi: x=#users, y=#unique careers, size=avg match_score)

**Accordion 3: "AI Recommendations"**
- Empty state with "Generate Rekomendasi" button (saves API cost — only fires Claude on click)
- POST to `/api/admin/siswa/recommendations` (new endpoint, takes current stats + Claude Sonnet)
- Prompt template: "Based on this snapshot of siswa engagement stats, what 3 actions should admin take to improve outcomes? Be specific, data-driven, actionable."
- Display result as markdown-rendered card with bullet points
- Cache last 1 result per day (don't burn API on every page load)

**Accordion 4: "User Explorer"**
- Search bar + filter chips (school, provinsi, gender, class, RIASEC top_code, has_assessment, has_path, gap_category)
- Result table: name, school, class, top_code, primary_career, courses_complete, readiness, last_active
- Pagination (100 rows visible default)
- Click row → navigate to `/admin/siswa/[id]` detail page

### 5. User detail page `apps/belneg/app/admin/siswa/[id]/page.tsx`

Server-fetch user with all denormalised joins. Render via `siswa-detail-client.tsx`:
- Header: name + school + class + RIASEC chips + readiness score gauge
- Tabs: Profile · Assessment · Skill Gaps · Learning Path · Progress · Activity Timeline
- Each tab content sourced from `/api/admin/siswa/[id]` (new endpoint returning full bundle, similar to admin users endpoint)

### 6. Admin API endpoints

**`POST /api/admin/siswa/recommendations`**
- Body: optional `{focus?: 'engagement' | 'retention' | 'career_match'}` for prompt steering
- Builds Claude Sonnet prompt with current snapshot stats
- Returns: `{recommendations: [{title, rationale, action_steps}], generated_at, prompt_tokens, completion_tokens}`
- Cache last result for 24 hours per `focus` value

**`GET /api/admin/siswa`**
- Query: `?q=&school=&provinsi=&gender=&class=&top_code=&has_path=&limit=&offset=`
- Returns paginated user list (denormalised with school name + readiness score)

**`GET /api/admin/siswa/[id]`**
- Full bundle: user + latest_assessment + self_assessment_items + learning_path + course_progress + activity_log + badges

### 7. Sidebar nav (already added in S4 stub)

Confirm entry exists:
```ts
{ href: "/admin/siswa", label: "Siswa KKRI", icon: GraduationCap, sub: "Pencari Arah" }
```

## How to verify

After deploy, open `https://belneg.vercel.app/admin/siswa`:
1. All 4 accordions render
2. Hero KPIs show numbers (even if low with empty DB initially — seed some test siswa first)
3. Charts render without errors (use seed-demo-siswa.mjs if you want bulk dummy data — optional add)
4. "Generate Rekomendasi" button hits Claude and renders bullet list
5. User explorer search filters work instantly (client-side)
6. Click a user → detail page loads with all tabs

## Optional: seed dummy siswa for demo

Like `seed-demo-users.mjs` from Pembina:
- `scripts/seed-demo-siswa.mjs`
- Create 500 dummy siswa across 20 schools, with synthesized RIASEC scores + path + partial progress
- Mark with email pattern `*.demo@siswa.kkri` for cleanup

## Commit message template

```
admin/siswa: full SISWA dashboard with 4 accordion sections

  Mirrors the rich /admin/users dashboard pattern but for student users.

  Section 1 — Key Statistics:
    Hero KPI grid (8), geographic distribution (provinsi/kab/school),
    device stats, sign-up + DAU trend lines

  Section 2 — Insights:
    RIASEC distribution doughnut + top codes bar + radar by gender/class,
    profession ranking (primary chosen + top-5 frequency), heatmap
    RIASEC × provinsi, heatmap careers × provinsi, career diversity bubble

  Section 3 — AI Recommendations:
    On-demand only (preserve Claude budget). Button → POST to
    /api/admin/siswa/recommendations → Sonnet generates 3 actionable
    items with rationale + steps. 24h cache.

  Section 4 — User Explorer:
    Search + 8 filter dimensions, paginated table, click for detail page

  /admin/siswa/[id] — full user detail with 6 tabs: Profile · Assessment
    · Skill Gaps · Learning Path · Progress · Activity Timeline

  Endpoints:
    GET  /api/admin/siswa                 — paginated explorer
    GET  /api/admin/siswa/[id]            — full user bundle
    POST /api/admin/siswa/recommendations — AI insights

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## What's done after this

Backend is complete. Mobile app (sister repo `kkri-pencari-arah`) consumes everything via `/api/v2/*`. Move to mobile session M1 in that repo.
