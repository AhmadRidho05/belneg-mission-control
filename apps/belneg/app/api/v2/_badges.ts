// Badge auto-award logic. Called from progress/course PATCH and
// self-assessment/submit. Idempotent — siswa_badges has UNIQUE(user_id,
// badge_code) so re-runs are safe.
import "server-only";
import { qAll, qGet, qRun, newId } from "../v1/_lib";

// Coverage → numeric "skill bump" for skill-radar / gap recompute. Used by
// both badge logic (gap_closed_critical_*) and the dashboard "skill_radar_now".
const COVERAGE_BUMP: Record<string, number> = {
  foundational: 2,
  developing:   3,
  proficient:   4,
};
export function coverageToLevel(c: string): number { return COVERAGE_BUMP[c] ?? 0; }

export type BadgeDef = {
  code: string;
  label: string;
  description: string;
  emoji: string;
};

export const BADGES: BadgeDef[] = [
  { code: "first_assess",            emoji: "🧭", label: "Penjelajah",            description: "Menyelesaikan kuis RIASEC pertamamu." },
  { code: "first_self_assess",       emoji: "🔍", label: "Refleksi Diri",         description: "Menyelesaikan self-assessment skill pertama." },
  { code: "path_generated",          emoji: "🗺️", label: "Petualang",             description: "Menghasilkan learning path pertama." },
  { code: "course_first",            emoji: "🎯", label: "Pemula",                description: "Menyelesaikan kursus pertama." },
  { code: "course_10",               emoji: "⭐", label: "Konsisten",             description: "Menyelesaikan 10 kursus." },
  { code: "course_25",               emoji: "🌟", label: "Tekun",                 description: "Menyelesaikan 25 kursus." },
  { code: "course_50",               emoji: "💫", label: "Master",                description: "Menyelesaikan 50 kursus." },
  { code: "streak_3",                emoji: "🔥", label: "Hangat",                description: "Aktif 3 hari berturut-turut." },
  { code: "streak_7",                emoji: "🔥🔥", label: "Pembara",              description: "Aktif 7 hari berturut-turut." },
  { code: "streak_30",               emoji: "🔥🔥🔥", label: "Tak Terkalahkan",   description: "Aktif 30 hari berturut-turut." },
  { code: "gap_closed_critical_1",   emoji: "⚡", label: "Penembus",              description: "Menutup gap kritis pertama." },
  { code: "gap_closed_critical_all", emoji: "💎", label: "Master Skill",          description: "Menutup semua gap kritis." },
  { code: "phase_1_done",            emoji: "🥉", label: "Fase 1 Tuntas",         description: "Menyelesaikan seluruh kursus di Fase 1." },
  { code: "phase_2_done",            emoji: "🥈", label: "Fase 2 Tuntas",         description: "Menyelesaikan seluruh kursus di Fase 2." },
  { code: "phase_3_done",            emoji: "🥇", label: "Lulus Path",            description: "Menyelesaikan seluruh learning path." },
];

const BADGE_CODES = new Set(BADGES.map(b => b.code));

// ─────────────────────────────────────────────────────────────────────────
// Streak — # consecutive days with at least 1 activity, walking back from today
// ─────────────────────────────────────────────────────────────────────────
export async function computeStreak(userId: string): Promise<{ current: number; longest: number; lastActive: string | null }> {
  // Pull distinct days from activity_log (last 365 days) in DESC order.
  const rows = await qAll<{ day: string }>(
    `SELECT DISTINCT DATE(created_at) AS day
     FROM siswa_activity_log
     WHERE user_id = ? AND created_at >= datetime('now','-365 days')
     ORDER BY day DESC`,
    [userId]
  );
  if (rows.length === 0) return { current: 0, longest: 0, lastActive: null };

  const days = rows.map(r => r.day);

  // current_streak: starting from today (or yesterday if today not present),
  // count back as long as each day is exactly 1 day after the previous.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const yesterday = new Date(today); yesterday.setUTCDate(today.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  let current = 0;
  let cursor = days.includes(todayStr) ? todayStr : (days.includes(yesterdayStr) ? yesterdayStr : null);
  if (cursor) {
    current = 1;
    const daySet = new Set(days);
    let d = new Date(cursor + "T00:00:00Z");
    while (true) {
      d.setUTCDate(d.getUTCDate() - 1);
      const ds = d.toISOString().slice(0, 10);
      if (daySet.has(ds)) current++;
      else break;
    }
  }

  // longest_streak: walk the sorted list and find max run of consecutive days
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const ds of [...days].sort()) {
    const d = new Date(ds + "T00:00:00Z");
    if (prev) {
      const diff = (d.getTime() - prev.getTime()) / 86400000;
      if (diff === 1) run++;
      else run = 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prev = d;
  }

  return { current, longest, lastActive: days[0] };
}

// ─────────────────────────────────────────────────────────────────────────
// "Skill now" — initial self-assess level, bumped by completed courses
// ─────────────────────────────────────────────────────────────────────────
export async function computeSkillNow(userId: string): Promise<Map<string, { initial: number; now: number; target: number }>> {
  const sa = await qAll<{ element_id: string; cur: number; tgt: number }>(
    `SELECT onet_skill_id AS element_id, current_level AS cur, target_level AS tgt
     FROM siswa_self_assessments WHERE user_id = ?`,
    [userId]
  );
  // Map element_id → {initial, now, target}
  const out = new Map<string, { initial: number; now: number; target: number }>();
  for (const r of sa) {
    out.set(r.element_id, { initial: r.cur, now: r.cur, target: r.tgt });
  }
  if (out.size === 0) return out;

  // For each completed course tagged with this element_id, take max coverage.
  const elementIds = [...out.keys()];
  const placeholders = elementIds.map(() => "?").join(",");
  const tagged = await qAll<{ element_id: string; coverage: string }>(
    `SELECT t.onet_element_id AS element_id, t.coverage
     FROM siswa_course_progress p
     JOIN course_skill_tags t ON t.course_id = p.course_id
     WHERE p.user_id = ?
       AND p.status = 'selesai'
       AND t.onet_element_id IN (${placeholders})`,
    [userId, ...elementIds]
  );
  for (const t of tagged) {
    const e = out.get(t.element_id)!;
    const bump = coverageToLevel(t.coverage);
    if (bump > e.now) e.now = Math.min(5, bump);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Recompute gap categories using "now" levels — used by gap_closed badges
// ─────────────────────────────────────────────────────────────────────────
export async function recomputedGapCategories(userId: string): Promise<{
  critical: number; moderate: number; minimal: number; closedCritical: string[]; allClosedCritical: boolean;
}> {
  const skills = await computeSkillNow(userId);
  let critical = 0, moderate = 0, minimal = 0;
  const closedCritical: string[] = [];
  let totalInitiallyCritical = 0;

  for (const [eid, { initial, now, target }] of skills) {
    const initialGap = target - initial;
    const wasCritical = initialGap >= 3;
    if (wasCritical) totalInitiallyCritical++;

    const nowGap = target - now;
    if (nowGap >= 3)     { critical++; }
    else if (nowGap === 2) { moderate++; }
    else                   { minimal++; if (wasCritical) closedCritical.push(eid); }
  }
  return {
    critical, moderate, minimal,
    closedCritical,
    allClosedCritical: totalInitiallyCritical > 0 && critical === 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Award a single badge (idempotent — UNIQUE(user_id, badge_code))
// ─────────────────────────────────────────────────────────────────────────
async function award(userId: string, code: string, meta: Record<string, any> = {}): Promise<boolean> {
  if (!BADGE_CODES.has(code)) {
    console.warn(`[badges] unknown code: ${code}`);
    return false;
  }
  const existing = await qGet<{ id: string }>(
    `SELECT id FROM siswa_badges WHERE user_id = ? AND badge_code = ?`,
    [userId, code]
  );
  if (existing) return false;
  try {
    await qRun(
      `INSERT INTO siswa_badges (id, user_id, badge_code, meta) VALUES (?,?,?,?)`,
      [newId("bdg"), userId, code, JSON.stringify(meta)]
    );
    await qRun(
      `INSERT INTO siswa_activity_log (id, user_id, activity_type, ref_id) VALUES (?,?,?,?)`,
      [newId("act"), userId, "badge_awarded", code]
    );
    return true;
  } catch (e: any) {
    // UNIQUE constraint race — treat as already awarded.
    if (String(e?.message || "").includes("UNIQUE")) return false;
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Top-level check: scan all criteria, award any newly earned. Cheap; safe to
// call on every course-status change and self-assessment submission.
// ─────────────────────────────────────────────────────────────────────────
export async function checkAllBadges(userId: string): Promise<string[]> {
  const newly: string[] = [];

  // Counts
  const [
    assessmentCount, selfAssessCount, pathCount, completedRow, phaseStats,
  ] = await Promise.all([
    qGet<{ n: number }>(`SELECT COUNT(*) AS n FROM siswa_assessments WHERE user_id = ?`, [userId]),
    qGet<{ n: number }>(`SELECT COUNT(*) AS n FROM siswa_self_assessments WHERE user_id = ?`, [userId]),
    qGet<{ n: number }>(`SELECT COUNT(*) AS n FROM siswa_learning_paths WHERE user_id = ?`, [userId]),
    qGet<{ n: number }>(`SELECT COUNT(*) AS n FROM siswa_course_progress WHERE user_id = ? AND status = 'selesai'`, [userId]),
    qAll<{ phase_number: number; total: number; done: number }>(
      `SELECT ph.phase_number,
              COUNT(*) AS total,
              SUM(CASE WHEN p.status = 'selesai' THEN 1 ELSE 0 END) AS done
       FROM siswa_learning_phases ph
       JOIN siswa_learning_paths lp ON lp.id = ph.path_id
       JOIN siswa_course_progress p ON p.phase_id = ph.id AND p.user_id = lp.user_id
       WHERE lp.user_id = ?
       GROUP BY ph.phase_number`,
      [userId]
    ),
  ]);

  if ((assessmentCount?.n ?? 0) > 0 && await award(userId, "first_assess"))                          newly.push("first_assess");
  if ((selfAssessCount?.n ?? 0) > 0 && await award(userId, "first_self_assess"))                     newly.push("first_self_assess");
  if ((pathCount?.n ?? 0) > 0       && await award(userId, "path_generated"))                        newly.push("path_generated");

  const completed = completedRow?.n ?? 0;
  if (completed >= 1  && await award(userId, "course_first", { completed })) newly.push("course_first");
  if (completed >= 10 && await award(userId, "course_10",    { completed })) newly.push("course_10");
  if (completed >= 25 && await award(userId, "course_25",    { completed })) newly.push("course_25");
  if (completed >= 50 && await award(userId, "course_50",    { completed })) newly.push("course_50");

  // Streak
  const streak = await computeStreak(userId);
  if (streak.current >= 3  && await award(userId, "streak_3",  { current: streak.current })) newly.push("streak_3");
  if (streak.current >= 7  && await award(userId, "streak_7",  { current: streak.current })) newly.push("streak_7");
  if (streak.current >= 30 && await award(userId, "streak_30", { current: streak.current })) newly.push("streak_30");

  // Gap closure
  if ((selfAssessCount?.n ?? 0) > 0) {
    const gaps = await recomputedGapCategories(userId);
    if (gaps.closedCritical.length >= 1 && await award(userId, "gap_closed_critical_1", { count: gaps.closedCritical.length })) {
      newly.push("gap_closed_critical_1");
    }
    if (gaps.allClosedCritical && await award(userId, "gap_closed_critical_all")) {
      newly.push("gap_closed_critical_all");
    }
  }

  // Phase complete
  for (const ph of phaseStats) {
    if (ph.total > 0 && ph.done === ph.total) {
      const code = `phase_${ph.phase_number}_done`;
      if (BADGE_CODES.has(code) && await award(userId, code, { total: ph.total })) {
        newly.push(code);
      }
    }
  }

  return newly;
}
