import { NextRequest } from "next/server";
import { qAll, qGet, requireSiswa, ok } from "../_lib";
import { BADGES, computeStreak, recomputedGapCategories } from "../_badges";

export const dynamic = "force-dynamic";

// Weights per S5 spec:
//   40% gap closure rate, 30% courses_complete/total, 15% phases_complete/3,
//   10% min(streak/30, 1), 5% badges_earned/total
const W_GAP      = 0.40;
const W_COURSES  = 0.30;
const W_PHASES   = 0.15;
const W_STREAK   = 0.10;
const W_BADGES   = 0.05;

export async function GET(req: NextRequest) {
  const auth = await requireSiswa(req);
  if (!auth.ok) return auth.res;
  const userId = auth.user.sub;

  // 1. Gap closure — % of initially-critical-or-moderate skills now sitting
  // in 'minimal'. If no self-assessment yet, treat component as 0.
  let gapComponent = 0;
  let gapPct = 0;
  const totalSelfAssess = await qGet<{ n: number }>(
    `SELECT COUNT(*) AS n FROM siswa_self_assessments WHERE user_id = ?`,
    [userId]
  );
  if ((totalSelfAssess?.n ?? 0) > 0) {
    const initial = await qGet<{ n: number }>(
      `SELECT COUNT(*) AS n FROM siswa_self_assessments
       WHERE user_id = ? AND gap_category IN ('critical','moderate')`,
      [userId]
    );
    const denom = initial?.n ?? 0;
    if (denom > 0) {
      const recomputed = await recomputedGapCategories(userId);
      const still = recomputed.critical + recomputed.moderate;
      gapPct = Math.max(0, Math.min(1, (denom - still) / denom));
    }
    gapComponent = gapPct * 100;
  }

  // 2. Courses completion
  const courseTotals = await qAll<{ status: string; n: number }>(
    `SELECT status, COUNT(*) AS n FROM siswa_course_progress WHERE user_id = ? GROUP BY status`,
    [userId]
  );
  const courseMap: Record<string, number> = { belum: 0, berproses: 0, selesai: 0, lompati: 0 };
  for (const r of courseTotals) courseMap[r.status] = r.n;
  const courseTotal = courseMap.belum + courseMap.berproses + courseMap.selesai + courseMap.lompati;
  const coursePct = courseTotal > 0 ? courseMap.selesai / courseTotal : 0;
  const coursesComponent = coursePct * 100;

  // 3. Phases — count phases where every course is 'selesai'
  const phaseRows = await qAll<{ total: number; done: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN p.status = 'selesai' THEN 1 ELSE 0 END) AS done
     FROM siswa_learning_phases ph
     JOIN siswa_learning_paths lp ON lp.id = ph.path_id
     JOIN siswa_course_progress p ON p.phase_id = ph.id AND p.user_id = lp.user_id
     WHERE lp.user_id = ?
     GROUP BY ph.id`,
    [userId]
  );
  const phasesComplete = phaseRows.filter(r => r.total > 0 && r.done === r.total).length;
  const phasesPct = Math.min(1, phasesComplete / 3);
  const phasesComponent = phasesPct * 100;

  // 4. Streak (capped at 30)
  const streak = await computeStreak(userId);
  const streakPct = Math.min(1, streak.current / 30);
  const streakComponent = streakPct * 100;

  // 5. Badges (denom = total possible badges, not 10 — the spec said 10 but
  // we ended up with 15; using total is more honest)
  const badgesRow = await qGet<{ n: number }>(
    `SELECT COUNT(*) AS n FROM siswa_badges WHERE user_id = ?`,
    [userId]
  );
  const badgesEarned = badgesRow?.n ?? 0;
  const badgesPct = Math.min(1, badgesEarned / BADGES.length);
  const badgesComponent = badgesPct * 100;

  const score = Math.round(
    W_GAP * gapComponent +
    W_COURSES * coursesComponent +
    W_PHASES * phasesComponent +
    W_STREAK * streakComponent +
    W_BADGES * badgesComponent
  );

  return ok({
    score,
    components: {
      gap:        { weight: W_GAP,     value: Math.round(gapComponent),       raw: gapPct },
      courses:    { weight: W_COURSES, value: Math.round(coursesComponent),   raw: coursePct,    completed: courseMap.selesai, total: courseTotal },
      phases:     { weight: W_PHASES,  value: Math.round(phasesComponent),    raw: phasesPct,    complete: phasesComplete },
      streak:     { weight: W_STREAK,  value: Math.round(streakComponent),    raw: streakPct,    current_days: streak.current },
      engagement: { weight: W_BADGES,  value: Math.round(badgesComponent),    raw: badgesPct,    badges_earned: badgesEarned, total: BADGES.length },
    },
    last_updated: new Date().toISOString(),
  });
}
