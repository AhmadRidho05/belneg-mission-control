import { NextRequest } from "next/server";
import { qAll, qGet, qRun, requireSiswa, ok, bad } from "../_lib";

export const dynamic = "force-dynamic";

// Stats are partial in S2 — fields tied to features built in later sessions
// (assessment, learning path, courses, streak) are returned with stub
// values for now and will light up automatically once their data lands.
async function buildStats(userId: string) {
  const [
    assessmentRow,
    careerSelectRow,
    pathRow,
    progressRows,
    streakRow,
    badgeRow,
  ] = await Promise.all([
    qGet<{ n: number }>(`SELECT COUNT(*) AS n FROM siswa_assessments WHERE user_id = ?`, [userId]),
    qGet<{ primary_career_onet: string | null }>(`SELECT primary_career_onet FROM siswa_users WHERE id = ?`, [userId]),
    qGet<{ n: number }>(`SELECT COUNT(*) AS n FROM siswa_learning_paths WHERE user_id = ?`, [userId]),
    qAll<{ status: string; n: number }>(
      `SELECT status, COUNT(*) AS n FROM siswa_course_progress WHERE user_id = ? GROUP BY status`,
      [userId]
    ),
    qGet<{ days: number }>(
      `SELECT COUNT(DISTINCT DATE(created_at)) AS days
       FROM siswa_activity_log
       WHERE user_id = ? AND created_at >= DATETIME('now','-30 days')`,
      [userId]
    ),
    qGet<{ n: number }>(`SELECT COUNT(*) AS n FROM siswa_badges WHERE user_id = ?`, [userId]),
  ]);

  const byStatus = Object.fromEntries(progressRows.map(r => [r.status, r.n]));
  const inProgress = byStatus["berproses"] ?? 0;
  const completed  = byStatus["selesai"]   ?? 0;
  const total      = (byStatus["belum"] ?? 0) + inProgress + completed + (byStatus["lompati"] ?? 0);

  // Naive streak: # distinct active days in the last 30 days. The "real"
  // streak (consecutive trailing days) lands with /api/v2/streak in S5.
  const naiveStreak = streakRow?.days ?? 0;

  // Readiness score is computed in S5; return 0 until then.
  const readiness = 0;

  return {
    assessment_done: (assessmentRow?.n ?? 0) > 0,
    careers_explored: careerSelectRow?.primary_career_onet ? 1 : 0,
    learning_path_active: (pathRow?.n ?? 0) > 0,
    courses_total: total,
    courses_in_progress: inProgress,
    courses_completed: completed,
    badges_earned: badgeRow?.n ?? 0,
    current_streak_days: naiveStreak,
    readiness_score: readiness,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireSiswa(req);
  if (!auth.ok) return auth.res;

  const u = await qGet<any>(
    `SELECT id, email, full_name, birth_year, gender, school_npsn, school_class,
            primary_career_onet, riasec_top_code, is_active, created_at, last_active_at
     FROM siswa_users WHERE id = ?`,
    [auth.user.sub]
  );
  if (!u) return bad("user not found", 404);

  let school: any = null;
  if (u.school_npsn) {
    school = await qGet<any>(
      `SELECT npsn, nama, kecamatan, kab_kota, provinsi
       FROM fact_satpen_dikmen WHERE npsn = ?`,
      [u.school_npsn]
    );
  }

  const stats = await buildStats(u.id);

  return ok({
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    birth_year: u.birth_year,
    gender: u.gender,
    school_class: u.school_class,
    primary_career_onet: u.primary_career_onet,
    riasec_top_code: u.riasec_top_code,
    school,
    stats,
    created_at: u.created_at,
    last_active_at: u.last_active_at,
  });
}

const ALLOWED = ["full_name","birth_year","gender","school_npsn","school_class","primary_career_onet"] as const;

export async function PATCH(req: NextRequest) {
  const auth = await requireSiswa(req);
  if (!auth.ok) return auth.res;

  let body: any;
  try { body = await req.json(); } catch { return bad("invalid json"); }

  const sets: string[] = [];
  const args: any[] = [];

  for (const k of ALLOWED) {
    if (body[k] == null) continue;
    const v = body[k];

    if (k === "full_name") {
      const s = String(v).trim().slice(0, 200);
      if (s.length < 2) return bad("full_name minimal 2 karakter");
      sets.push("full_name = ?"); args.push(s);
    } else if (k === "birth_year") {
      const y = parseInt(String(v), 10);
      const now = new Date().getFullYear();
      if (!Number.isInteger(y) || y < now - 25 || y > now - 12) return bad("birth_year tidak masuk akal");
      sets.push("birth_year = ?"); args.push(y);
    } else if (k === "gender") {
      const g = String(v).trim().toUpperCase();
      if (!["L","P"].includes(g)) return bad("gender harus 'L' atau 'P'");
      sets.push("gender = ?"); args.push(g);
    } else if (k === "school_npsn") {
      const npsn = String(v).trim();
      if (!/^\d{8,10}$/.test(npsn)) return bad("school_npsn harus 8-10 digit");
      const school = await qGet<{ bentuk_pendidikan: string }>(
        `SELECT bentuk_pendidikan FROM fact_satpen_dikmen WHERE npsn = ?`,
        [npsn]
      );
      if (!school) return bad("NPSN tidak ditemukan", 404);
      if (!["SMA","SMK","MA","MAK"].includes(school.bentuk_pendidikan)) {
        return bad("sekolah harus bentuk pendidikan SMA/SMK/MA/MAK", 422);
      }
      sets.push("school_npsn = ?"); args.push(npsn);
    } else if (k === "school_class") {
      const c = String(v).trim();
      if (!["10","11","12"].includes(c)) return bad("school_class harus 10, 11, atau 12");
      sets.push("school_class = ?"); args.push(c);
    } else if (k === "primary_career_onet") {
      // Loose validation here; S3 sets this via /api/v2/careers/[code]/select
      // after verifying the code against onet_occupations.
      const s = String(v).trim();
      if (!/^\d{2}-\d{4}\.\d{2}$/.test(s)) return bad("primary_career_onet format invalid (expected NN-NNNN.NN)");
      sets.push("primary_career_onet = ?"); args.push(s);
    }
  }

  if (sets.length === 0) return bad("no fields to update");

  args.push(auth.user.sub);
  await qRun(`UPDATE siswa_users SET ${sets.join(", ")} WHERE id = ?`, args);
  return ok({ updated: true, fields: sets.length });
}
