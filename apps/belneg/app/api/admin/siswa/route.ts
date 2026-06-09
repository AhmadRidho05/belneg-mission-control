// Paginated explorer for the /admin/siswa dashboard.
import { NextRequest, NextResponse } from "next/server";
import { qAll, ok } from "../../v1/_lib";
import { getAdminFromRequest } from "../../web/_lib";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await getAdminFromRequest(req)) return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const q             = (sp.get("q")         || "").trim();
  const school        = (sp.get("school")    || "").trim();
  const provinsi      = (sp.get("provinsi")  || "").trim();
  const gender        = (sp.get("gender")    || "").trim();
  const klass         = (sp.get("class")     || "").trim();
  const topCode       = (sp.get("top_code")  || "").trim();
  const hasPath       =  sp.get("has_path"); // "1" or "0"
  const limit         = Math.min(Math.max(parseInt(sp.get("limit") || "50", 10) || 50, 1), 200);
  const offset        = Math.max(parseInt(sp.get("offset") || "0", 10) || 0, 0);

  const conds: string[] = [`u.deleted_at IS NULL`];
  const args: any[] = [];

  if (q) {
    conds.push(`(u.full_name LIKE ? OR u.email LIKE ? OR s.nama LIKE ?)`);
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (school)   { conds.push(`s.nama LIKE ?`);       args.push(`%${school}%`); }
  if (provinsi) { conds.push(`s.provinsi LIKE ?`);   args.push(`%${provinsi}%`); }
  if (gender    && ["L","P"].includes(gender))       { conds.push(`u.gender = ?`);       args.push(gender); }
  if (klass     && ["10","11","12"].includes(klass)) { conds.push(`u.school_class = ?`); args.push(klass); }
  if (topCode)  { conds.push(`u.riasec_top_code = ?`); args.push(topCode); }
  if (hasPath === "1") conds.push(`EXISTS (SELECT 1 FROM siswa_learning_paths lp WHERE lp.user_id = u.id)`);
  if (hasPath === "0") conds.push(`NOT EXISTS (SELECT 1 FROM siswa_learning_paths lp WHERE lp.user_id = u.id)`);

  const whereSql = conds.join(" AND ");

  const [rows, totalRow] = await Promise.all([
    qAll<any>(
      `SELECT u.id, u.full_name, u.email, u.gender, u.school_class,
              u.riasec_top_code, u.primary_career_onet, u.last_active_at,
              s.nama AS school_nama, s.provinsi,
              o.title AS primary_career_title,
              (SELECT COUNT(*) FROM siswa_course_progress p WHERE p.user_id = u.id AND p.status = 'selesai') AS courses_completed
       FROM siswa_users u
       LEFT JOIN fact_satpen_dikmen s ON s.npsn = u.school_npsn
       LEFT JOIN onet_occupations  o ON o.onet_soc_code = u.primary_career_onet
       WHERE ${whereSql}
       ORDER BY u.last_active_at DESC NULLS LAST, u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...args, limit, offset]
    ),
    qAll<{ n: number }>(
      `SELECT COUNT(*) AS n FROM siswa_users u
       LEFT JOIN fact_satpen_dikmen s ON s.npsn = u.school_npsn
       WHERE ${whereSql}`,
      args
    ),
  ]);

  return ok({ total: totalRow[0]?.n ?? 0, rows, limit, offset });
}
