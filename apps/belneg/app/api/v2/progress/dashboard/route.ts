import { NextRequest } from "next/server";
import { qAll, qGet, requireSiswa, ok } from "../../_lib";
import { computeSkillNow } from "../../_badges";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireSiswa(req);
  if (!auth.ok) return auth.res;
  const userId = auth.user.sub;

  // Overall
  const overallRows = await qAll<{ status: string; n: number }>(
    `SELECT status, COUNT(*) AS n FROM siswa_course_progress WHERE user_id = ? GROUP BY status`,
    [userId]
  );
  const byStatus: Record<string, number> = { belum: 0, berproses: 0, selesai: 0, lompati: 0 };
  for (const r of overallRows) byStatus[r.status] = r.n;
  const total = byStatus.belum + byStatus.berproses + byStatus.selesai + byStatus.lompati;
  const percent_complete = total === 0 ? 0 : Math.round((byStatus.selesai / total) * 100);

  // Per-phase
  const phaseRows = await qAll<any>(
    `SELECT ph.id, ph.phase_number, ph.title,
            COUNT(p.course_id) AS total,
            SUM(CASE WHEN p.status = 'selesai' THEN 1 ELSE 0 END) AS done
     FROM siswa_learning_phases ph
     JOIN siswa_learning_paths lp ON lp.id = ph.path_id
     LEFT JOIN siswa_course_progress p ON p.phase_id = ph.id AND p.user_id = lp.user_id
     WHERE lp.user_id = ?
     GROUP BY ph.id
     ORDER BY ph.phase_number ASC`,
    [userId]
  );
  const phases = phaseRows.map(r => ({
    phase_number: r.phase_number,
    title: r.title,
    completed: Number(r.done) || 0,
    total: Number(r.total) || 0,
    percent: r.total > 0 ? Math.round((Number(r.done) / Number(r.total)) * 100) : 0,
  }));

  // Skill radar before / now (keyed by element_name for friendliness)
  const skillMap = await computeSkillNow(userId);
  const elementIds = [...skillMap.keys()];
  const names = elementIds.length > 0
    ? await qAll<{ element_id: string; element_name: string }>(
        `SELECT element_id, element_name FROM onet_skills WHERE element_id IN (${elementIds.map(() => "?").join(",")})
         UNION ALL
         SELECT element_id, element_name FROM onet_knowledge WHERE element_id IN (${elementIds.map(() => "?").join(",")})`,
        [...elementIds, ...elementIds]
      )
    : [];
  const nameByEid = new Map(names.map(r => [r.element_id, r.element_name]));
  const skill_radar_before: Record<string, number> = {};
  const skill_radar_now:    Record<string, number> = {};
  for (const [eid, { initial, now }] of skillMap) {
    const label = nameByEid.get(eid) || eid;
    skill_radar_before[label] = initial;
    skill_radar_now[label]    = now;
  }

  // Timeline — last 30 activity events related to learning
  const timeline = await qAll<{ event: string; ref: string | null; ts: string }>(
    `SELECT activity_type AS event, ref_id AS ref, created_at AS ts
     FROM siswa_activity_log
     WHERE user_id = ?
       AND activity_type IN ('course_started','course_completed','learning_path_generated','self_assessment_done','assessment_done','career_selected','badge_awarded')
     ORDER BY created_at DESC LIMIT 30`,
    [userId]
  );

  // Enrich timeline with course titles where ref points at course_id
  const courseRefs = timeline.filter(t => t.ref && (t.event === "course_started" || t.event === "course_completed")).map(t => t.ref!);
  let titlesByCourse = new Map<string, string>();
  if (courseRefs.length > 0) {
    const titleRows = await qAll<{ id: string; title: string }>(
      `SELECT id, title FROM course_catalog WHERE id IN (${courseRefs.map(() => "?").join(",")})`,
      courseRefs
    );
    titlesByCourse = new Map(titleRows.map(r => [r.id, r.title]));
  }
  const timelineFmt = timeline.map(t => {
    const date = t.ts ? t.ts.slice(0, 10) : null;
    let label = t.event;
    if (t.event === "course_started"   && t.ref) label = `Mulai '${titlesByCourse.get(t.ref) || t.ref}'`;
    else if (t.event === "course_completed" && t.ref) label = `Selesai '${titlesByCourse.get(t.ref) || t.ref}'`;
    else if (t.event === "learning_path_generated") label = "Learning path dibuat";
    else if (t.event === "self_assessment_done")    label = "Self-assessment selesai";
    else if (t.event === "assessment_done")         label = "Kuis RIASEC selesai";
    else if (t.event === "career_selected")         label = `Karier dipilih: ${t.ref || "?"}`;
    else if (t.event === "badge_awarded")           label = `Badge diraih: ${t.ref || "?"}`;
    return { date, event: label };
  });

  // Projected completion — naive: avg days per completed course × remaining courses
  let projected_completion: string | null = null;
  const completedTimes = await qAll<{ started_at: string; completed_at: string }>(
    `SELECT started_at, completed_at FROM siswa_course_progress
     WHERE user_id = ? AND status = 'selesai' AND started_at IS NOT NULL AND completed_at IS NOT NULL`,
    [userId]
  );
  const remaining = byStatus.belum + byStatus.berproses;
  if (remaining > 0) {
    let avgDays = 14; // default heuristic
    if (completedTimes.length > 0) {
      const totalDays = completedTimes.reduce((acc, r) => {
        const s = new Date(r.started_at + "Z").getTime();
        const c = new Date(r.completed_at + "Z").getTime();
        return acc + Math.max(1, (c - s) / 86400000);
      }, 0);
      avgDays = Math.max(3, Math.round(totalDays / completedTimes.length));
    }
    const proj = new Date(Date.now() + remaining * avgDays * 86400000);
    projected_completion = proj.toISOString().slice(0, 10);
  }

  return ok({
    overall: {
      courses_total: total,
      courses_belum: byStatus.belum,
      courses_berproses: byStatus.berproses,
      courses_selesai: byStatus.selesai,
      courses_lompati: byStatus.lompati,
      percent_complete,
    },
    phases,
    skill_radar_before,
    skill_radar_now,
    timeline: timelineFmt,
    projected_completion,
  });
}
