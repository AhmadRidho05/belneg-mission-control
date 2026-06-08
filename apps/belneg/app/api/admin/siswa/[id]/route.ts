// Full user bundle for /admin/siswa/[id] detail page.
import { NextRequest } from "next/server";
import { qAll, qGet, ok, bad } from "../../../v1/_lib";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const user = await qGet<any>(
    `SELECT u.*, s.nama AS school_nama, s.kecamatan, s.kab_kota, s.provinsi,
            o.title AS primary_career_title, o.description AS primary_career_description
     FROM siswa_users u
     LEFT JOIN fact_satpen_dikmen s ON s.npsn = u.school_npsn
     LEFT JOIN onet_occupations  o ON o.onet_soc_code = u.primary_career_onet
     WHERE u.id = ?`,
    [id]
  );
  if (!user) return bad("siswa tidak ditemukan", 404);

  const [
    latestAssessment, selfAssessments, learningPath, learningPhases, courseProgress, activityLog, badges,
  ] = await Promise.all([
    qGet<any>(
      `SELECT id, riasec_realistic AS r, riasec_investigative AS i,
              riasec_artistic AS a, riasec_social AS s,
              riasec_enterprising AS e, riasec_conventional AS c,
              top_code, submitted_at
       FROM siswa_assessments WHERE user_id = ?
       ORDER BY submitted_at DESC LIMIT 1`,
      [id]
    ),
    qAll<any>(
      `SELECT sa.onet_skill_id AS element_id, sa.current_level, sa.target_level,
              sa.gap_category, sa.rated_at,
              COALESCE(s.element_name, k.element_name) AS element_name,
              COALESCE(s.category,     k.category)     AS taxonomy_category,
              CASE WHEN s.element_id IS NOT NULL THEN 'skill'
                   WHEN k.element_id IS NOT NULL THEN 'knowledge' END AS kind
       FROM siswa_self_assessments sa
       LEFT JOIN onet_skills    s ON s.element_id = sa.onet_skill_id
       LEFT JOIN onet_knowledge k ON k.element_id = sa.onet_skill_id
       WHERE sa.user_id = ?
       ORDER BY sa.gap_category, (sa.target_level - sa.current_level) DESC`,
      [id]
    ),
    qGet<any>(
      `SELECT id, target_career_onet, generated_at, ai_prompt_tokens, ai_completion_tokens
       FROM siswa_learning_paths WHERE user_id = ?
       ORDER BY generated_at DESC LIMIT 1`,
      [id]
    ),
    qAll<any>(
      `SELECT ph.id, ph.phase_number, ph.title, ph.estimated_weeks, ph.description
       FROM siswa_learning_phases ph
       JOIN siswa_learning_paths lp ON lp.id = ph.path_id
       WHERE lp.user_id = ?
       ORDER BY ph.phase_number ASC`,
      [id]
    ),
    qAll<any>(
      `SELECT p.course_id, p.phase_id, p.status, p.started_at, p.completed_at,
              c.title, c.provider, c.url, c.duration_hours, c.language, c.price_idr, c.rating, c.level
       FROM siswa_course_progress p
       JOIN course_catalog c ON c.id = p.course_id
       WHERE p.user_id = ?
       ORDER BY p.completed_at DESC NULLS LAST, p.started_at DESC NULLS LAST`,
      [id]
    ),
    qAll<any>(
      `SELECT activity_type, ref_id, created_at
       FROM siswa_activity_log WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 100`,
      [id]
    ),
    qAll<any>(
      `SELECT badge_code, awarded_at, meta FROM siswa_badges WHERE user_id = ?
       ORDER BY awarded_at DESC`,
      [id]
    ),
  ]);

  return ok({
    user,
    latest_assessment: latestAssessment ?? null,
    self_assessments:  selfAssessments,
    learning_path:     learningPath ? { ...learningPath, phases: learningPhases } : null,
    course_progress:   courseProgress,
    activity_log:      activityLog,
    badges,
  });
}
