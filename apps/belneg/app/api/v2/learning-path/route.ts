import { NextRequest } from "next/server";
import { qAll, qGet, requireSiswa, ok, bad } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireSiswa(req);
  if (!auth.ok) return auth.res;
  const userId = auth.user.sub;

  const path = await qGet<any>(
    `SELECT id, target_career_onet, generated_at, full_json
     FROM siswa_learning_paths
     WHERE user_id = ?
     ORDER BY generated_at DESC LIMIT 1`,
    [userId]
  );
  if (!path) return bad("belum ada learning path — generate di POST /api/v2/learning-path/generate", 404);

  const phases = await qAll<any>(
    `SELECT id, phase_number, title, estimated_weeks, description,
            skill_targets, project_suggestion, social_accounts
     FROM siswa_learning_phases
     WHERE path_id = ?
     ORDER BY phase_number ASC`,
    [path.id]
  );

  // Course progress per phase
  const progress = await qAll<any>(
    `SELECT p.course_id, p.phase_id, p.status, p.started_at, p.completed_at,
            c.title, c.provider, c.url, c.duration_hours, c.language, c.price_idr, c.rating, c.level
     FROM siswa_course_progress p
     JOIN course_catalog c ON c.id = p.course_id
     WHERE p.user_id = ?`,
    [userId]
  );
  const progressByPhase = new Map<string, any[]>();
  for (const p of progress) {
    if (!p.phase_id) continue;
    const arr = progressByPhase.get(p.phase_id) || [];
    arr.push(p);
    progressByPhase.set(p.phase_id, arr);
  }

  const career = await qGet<{ onet_soc_code: string; title: string }>(
    `SELECT onet_soc_code, title FROM onet_occupations WHERE onet_soc_code = ?`,
    [path.target_career_onet]
  );

  // Map ai-generated phase content (skill_targets / project_suggestion /
  // social_accounts) which were stored as JSON in siswa_learning_phases.
  const enrichedPhases = phases.map(ph => ({
    id: ph.id,
    phase_number: ph.phase_number,
    title: ph.title,
    estimated_weeks: ph.estimated_weeks,
    description: ph.description,
    skill_targets:     safeParse(ph.skill_targets,     []),
    project_suggestion: safeParse(ph.project_suggestion, null),
    social_accounts:   safeParse(ph.social_accounts,   []),
    courses: (progressByPhase.get(ph.id) || []).map(p => ({
      course_id: p.course_id,
      title: p.title,
      provider: p.provider,
      url: p.url,
      duration_hours: p.duration_hours,
      language: p.language,
      price_idr: p.price_idr,
      rating: p.rating,
      level: p.level,
      status: p.status,
      started_at: p.started_at,
      completed_at: p.completed_at,
    })),
  }));

  return ok({
    id: path.id,
    target_career: career || { onet_soc_code: path.target_career_onet, title: "(unknown)" },
    generated_at: path.generated_at,
    phases: enrichedPhases,
  });
}

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}
